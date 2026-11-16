"""Run by .github/workflows/detect-ayat.yml.

For each audio file in audio/inbox/: transcribe with Whisper, find the ayat it
covers, move it to audio/<from>-<to>.<ext> and add it to data/clips.json.
Files whose ayat can't be found go to audio/unmatched/ and data/unmatched.json.
"""
import json, os, subprocess, sys, datetime, shutil
sys.path.insert(0, os.path.dirname(__file__))
from match_ayat import match

ROOT = os.path.join(os.path.dirname(__file__), '..')
P = lambda *a: os.path.join(ROOT, *a)
AUDIO_EXT = ('.m4a', '.mp3', '.mp4', '.aac', '.ogg', '.wav', '.opus', '.webm')

def load(path, default):
    try: return json.load(open(path, encoding='utf-8'))
    except FileNotFoundError: return default

def save(path, data):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2); f.write('\n')

def duration(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path], capture_output=True, text=True).stdout
    try: return round(float(out))
    except ValueError: return None

COMMIT_EACH = '--commit-each' in sys.argv

def commit(msg):
    run = lambda *a: subprocess.run(a, cwd=ROOT, check=False)
    run('git', 'add', '-A', 'audio', 'data')
    if subprocess.run(['git', 'diff', '--cached', '--quiet'], cwd=ROOT).returncode == 0: return
    run('git', 'commit', '-q', '-m', msg)
    for _ in range(3):
        if run('git', 'pull', '--rebase', '-q').returncode == 0 and run('git', 'push', '-q').returncode == 0: return

def main():
    import whisper
    inbox = P('audio', 'inbox')
    files = sorted(f for f in os.listdir(inbox) if f.lower().endswith(AUDIO_EXT)) if os.path.isdir(inbox) else []
    if not files: print('inbox empty'); return
    ayat = load(P('data', 'ayat.json'), [])
    clips = load(P('data', 'clips.json'), [])
    unmatched = load(P('data', 'unmatched.json'), [])
    model = whisper.load_model(os.environ.get('WHISPER_MODEL', 'medium'))
    for f in files:
        src = os.path.join(inbox, f)
        meta = load(src + '.json', {})
        print('transcribing', f, flush=True)
        text = model.transcribe(src, language='ar', fp16=False)['text']
        rng, _ = match(text, ayat)
        ext = os.path.splitext(f)[1].lower().replace('.mp4', '.m4a')
        if not rng:
            os.makedirs(P('audio', 'unmatched'), exist_ok=True)
            dest = os.path.join('audio', 'unmatched', f)
            shutil.move(src, P(dest))
            unmatched.append({'file': dest, 'original': meta.get('file', f), 'title': meta.get('title', ''), 'speaker': meta.get('speaker', ''), 'added': str(datetime.date.today())})
            print('  no match ->', dest)
        else:
            a, b = rng
            base = f'{a}' if a == b else f'{a}-{b}'
            cid, n = base, 2
            ids = {c['id'] for c in clips}
            while cid in ids: cid = f'{base}_{n}'; n += 1
            dest = f'audio/{cid}{ext}'
            shutil.move(src, P(dest))
            clips.append({'file': meta.get('file', f), 'id': cid, 'from': a, 'to': b, 'src': dest, 'title': meta.get('title', ''), 'speaker': meta.get('speaker', ''),
                          'duration': duration(P(dest)), 'added': str(datetime.date.today()), 'auto': True})
            os.makedirs(P('data', 'transcripts'), exist_ok=True)
            open(P('data', 'transcripts', cid + '.txt'), 'w', encoding='utf-8').write(text)
            print(f'  ayat {a}-{b} ->', dest)
        if os.path.exists(src + '.json'): os.remove(src + '.json')
        if COMMIT_EACH:
            clips.sort(key=lambda c: (c['from'], c['to']))
            save(P('data', 'clips.json'), clips)
            if unmatched: save(P('data', 'unmatched.json'), unmatched)
            commit(f'Detect ayat: {f}')
    clips.sort(key=lambda c: (c['from'], c['to']))
    save(P('data', 'clips.json'), clips)
    if unmatched: save(P('data', 'unmatched.json'), unmatched)

if __name__ == '__main__':
    main()
