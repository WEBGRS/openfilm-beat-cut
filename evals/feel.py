# Beat-sync feel of a rendered film: picture events against the sound's strong hits
# usage: python -I feel.py <film.mp4> --song <music file> --beats <beats.json of that file> [--json out.json]
# Needs ffmpeg, numpy, scipy and librosa. Picture events are frame jumps (cuts, punches, flashes, shakes);
# the song's beats are moved to the film by cross-correlating onsets, the drop is from the song's lift on.
import sys, json, subprocess, numpy as np, librosa

src = sys.argv[1]
out = sys.argv[sys.argv.index('--json') + 1] if '--json' in sys.argv else None
FPS = 30
W, H = 64, 36

# Probe size and fps
pr = json.loads(subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=r_frame_rate,width,height:format=duration', '-of', 'json', src], capture_output=True, text=True).stdout)
num, den = pr['streams'][0]['r_frame_rate'].split('/')
fps = float(num) / float(den)
dur = float(pr['format']['duration'])

# Grey frames, small
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', src, '-vf', f'scale={W}:{H},format=gray', '-f', 'rawvideo', '-'], capture_output=True).stdout
fr = np.frombuffer(raw, np.uint8).reshape(-1, H, W).astype(np.float32)
n = len(fr)
diff = np.zeros(n)
diff[1:] = np.abs(fr[1:] - fr[:-1]).mean(axis=(1, 2))
lum = fr.mean(axis=(1, 2))

# Picture events: frame jumps well above the local motion level
ev = []
for i in range(1, n):
    lo, hi = max(1, i - 15), min(n, i + 16)
    base = np.median(diff[lo:hi])
    if diff[i] >= max(10.0, 3.0 * base) and diff[i] == diff[max(1, i - 2):min(n, i + 3)].max():
        ev.append(i / fps)
ev = np.array(ev)

# Strong hits in the film's own sound
sr = 22050
pcm = subprocess.run(['ffmpeg', '-v', 'error', '-i', src, '-vn', '-ac', '1', '-ar', str(sr), '-f', 'f32le', '-'], capture_output=True).stdout
y = np.frombuffer(pcm[:len(pcm) // 4 * 4], np.float32).copy()
hop = 256
env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
on_f = librosa.onset.onset_detect(onset_envelope=env, sr=sr, hop_length=hop, backtrack=False)
on_t = librosa.frames_to_time(on_f, sr=sr, hop_length=hop)
on_s = env[on_f]
rms = librosa.feature.rms(y=y, hop_length=hop)[0]
rt = librosa.frames_to_time(np.arange(len(rms)), sr=sr, hop_length=hop)

# Loudness per second, the loud part: within 4 dB of the loudest second
secs = int(np.ceil(dur))
db = np.array([20 * np.log10(rms[(rt >= s) & (rt < s + 1)].mean() + 1e-9) if ((rt >= s) & (rt < s + 1)).any() else -99 for s in range(secs)])
top = np.percentile(db[db > -99], 95) if (db > -99).any() else 0
loud = lambda t: db[min(secs - 1, int(t))] >= top - 4

# Strong hits: onsets stronger than the 60th percentile of onsets, at least 0.2 s apart
thr = np.percentile(on_s, 60) if len(on_s) else 0
hits = []
for t, s in sorted(zip(on_t, on_s), key=lambda p: -p[1]):
    if s < thr or t < 0.2 or t > dur - 0.2:
        continue
    if all(abs(t - h) >= 0.2 for h in hits):
        hits.append(t)
hits = np.array(sorted(hits))

# Beats: the song's measured beats moved to where the film plays the song (cross-correlation of onsets)
beats = np.array([])
offset = None
lift_film = None
if '--song' in sys.argv:
    from scipy.signal import correlate
    song = sys.argv[sys.argv.index('--song') + 1]
    bj = json.load(open(sys.argv[sys.argv.index('--beats') + 1], encoding='utf-8'))
    sp = subprocess.run(['ffmpeg', '-v', 'error', '-i', song, '-ac', '1', '-ar', str(sr), '-f', 'f32le', '-'], capture_output=True).stdout
    ys = np.frombuffer(sp[:len(sp) // 4 * 4], np.float32).copy()
    es = librosa.onset.onset_strength(y=ys, sr=sr, hop_length=hop)
    c = correlate(es - es.mean(), env - env.mean(), mode='full')
    lag = int(np.argmax(c)) - (len(env) - 1)
    offset = lag * hop / sr
    beats = np.array(bj['beats']) - offset
    if bj.get('lift') is not None:
        lift_film = bj['lift'] - offset
        loud = lambda t: t >= lift_film - 1.0 / FPS
beats = beats[(beats > 0.2) & (beats < dur - 0.2)]

tol = 2.5 / FPS
near = lambda t, arr: (np.abs(arr - t) <= tol).any() if len(arr) else False


def part(sel):
    hs = hits[[sel(t) for t in hits]] if len(hits) else hits
    es = ev[[sel(t) for t in ev]] if len(ev) else ev
    length = sum(1 for s in range(secs) if sel(s + 0.5))
    covered = sum(near(h, ev) for h in hs)
    on = sum(near(e, on_t) for e in es)
    bs = beats[[sel(t) for t in beats]] if len(beats) else beats
    bcov = sum(near(b, ev) for b in bs)
    return {
        'beats': len(bs),
        'beats_with_event': bcov,
        'beat_cover': round(bcov / len(bs), 2) if len(bs) else None,
        'seconds': length,
        'events': len(es),
        'events_per_s': round(len(es) / length, 2) if length else None,
        'hits': len(hs),
        'hits_with_event': covered,
        'hit_cover': round(covered / len(hs), 2) if len(hs) else None,
        'events_on_onset': round(on / len(es), 2) if len(es) else None,
    }


offs = [float((on_t - e)[np.argmin(np.abs(on_t - e))]) * FPS for e in ev] if len(on_t) else []
res = {
    'file': src, 'duration': round(dur, 2), 'fps': fps,
    'all': part(lambda t: True),
    'loud': part(lambda t: loud(t)),
    'rest': part(lambda t: not loud(t)),
    'song_offset': offset,
    'lift_film': lift_film,
    'split': 'drop = from the song''s lift' if lift_film is not None else 'loud = within 4 dB of the loudest second',
    'mean_abs_offset_frames':round(float(np.mean(np.abs(offs))), 2) if offs else None,
    'events': [round(float(e), 3) for e in ev],
    'hits': [round(float(h), 3) for h in hits],
    'loud_seconds': [s for s in range(secs) if loud(s + 0.5)],
}
a, l, r = res['all'], res['loud'], res['rest']
print(f"{src}: {dur:.1f} s, {a['events']} picture events ({a['events_per_s']}/s), {a['hits']} strong hits, {a['hits_with_event']} with a picture event ({a['hit_cover']}), events on an onset {a['events_on_onset']}, mean |offset| {res['mean_abs_offset_frames']} fr")
print(f"  {'drop (from the lift at film ' + format(lift_film, '.2f') + ')' if lift_film is not None else 'loud'} {l['seconds']} s: {l['events_per_s']}/s, beat cover {l['beat_cover']} ({l['beats_with_event']}/{l['beats']}), hit cover {l['hit_cover']} ({l['hits_with_event']}/{l['hits']})  |  {'before' if lift_film is not None else 'rest'} {r['seconds']} s: {r['events_per_s']}/s, beat cover {r['beat_cover']} ({r['beats_with_event']}/{r['beats']}), hit cover {r['hit_cover']}")
if out:
    json.dump(res, open(out, 'w'), indent=1, default=float)
