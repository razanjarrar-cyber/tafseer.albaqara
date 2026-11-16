"""Bulk import of a public Google Drive folder, used by .github/workflows/import-drive.yml.

  list  URL N        -> writes shards.json (N shards of {id, name}) and prints the matrix
  shard K            -> downloads shard K, transcribes, matches ayat; writes out/<K>/results.json + audio
  merge DIR          -> moves results from all shard dirs into audio/, updates data/clips.json, data/unmatched.json
"""
import json, os, sys, time, subprocess, datetime, shutil, hashlib

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, os.path.dirname(__file__))
AUDIO = ('.m4a', '.mp3', '.mp4', '.aac', '.ogg', '.wav', '.opus', '.webm', '.amr', '.3gp')


def load(p, d):
    try: return json.load(open(p, encoding='utf-8'))
    except FileNotFoundError: return d


def save(p, data):
    with open(p, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2); f.write('\n')


def cmd_list(url, n):
    import gdown
    files = gdown.download_folder(url, skip_download=True, quiet=True)
    items = [{'id': f.id, 'name': f.path} for f in files if f.path.lower().endswith(AUDIO)]
    shards = [items[i::n] for i in range(n)]
    save('shards.json', shards)
    print(len(items), 'audio files', file=sys.stderr)
    print(json.dumps(list(range(n))))


def duration(p):
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p], capture_output=True, text=True).stdout
    try: return round(float(out))
    except ValueError: return None


def cmd_shard(k):
    import gdown, whisper
    from match_ayat import match
    items = load('shards.json', [])[k]
    ayat = load(os.path.join(ROOT, 'data', 'ayat.json'), [])
    out = os.path.join('out', str(k)); os.makedirs(out, exist_ok=True)
    model = whisper.load_model('small')
    results = []
    for it in items:
        raw = os.path.join(out, 'raw' + os.path.splitext(it['name'])[1].lower())
        ok = False
        for attempt in range(6):
            try:
                gdown.download(id=it['id'], output=raw, quiet=True)
                ok = os.path.exists(raw) and os.path.getsize(raw) > 1000
            except Exception as e:
                print('download error', it['name'], e, flush=True)
            if ok: break
            time.sleep(20 * (attempt + 1))
        if not ok:
            results.append({**it, 'status': 'download_failed'}); continue
        # normalise to AAC .m4a (mono 64k keeps files small; already-AAC files are copied as is)
        dest = os.path.join(out, it['id'] + '.m4a')
        codec = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', raw], capture_output=True, text=True).stdout.strip()
        args = ['-c:a', 'copy'] if codec == 'aac' else ['-ac', '1', '-c:a', 'aac', '-b:a', '64k']
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', raw, '-vn', *args, '-movflags', '+faststart', dest], check=False)
        os.remove(raw)
        if not os.path.exists(dest):
            results.append({**it, 'status': 'convert_failed'}); continue
        text = model.transcribe(dest, language='ar', fp16=False)['text']
        rng, _ = match(text, ayat)
        md5 = hashlib.md5(open(dest, 'rb').read()).hexdigest()
        r = {**it, 'status': 'ok' if rng else 'no_match', 'from': rng and rng[0], 'to': rng and rng[1],
             'duration': duration(dest), 'audio': dest, 'md5': md5, 'text_start': text[:300]}
        results.append(r)
        print(it['name'], '->', rng, flush=True)
    save(os.path.join(out, 'results.json'), results)


def cmd_merge(d):
    clips = load(os.path.join(ROOT, 'data', 'clips.json'), [])
    unmatched = load(os.path.join(ROOT, 'data', 'unmatched.json'), [])
    report = []
    today = str(datetime.date.today())
    seen = set()
    all_results = []
    for root, _, names in os.walk(d):
        if 'results.json' in names:
            base = root
            for r in load(os.path.join(root, 'results.json'), []):
                r['audio'] = r.get('audio') and os.path.join(base, os.path.basename(r['audio']))
                all_results.append(r)
    all_results.sort(key=lambda r: (r.get('from') or 999, r.get('to') or 999, r['name']))
    for r in all_results:
        if r['status'] in ('download_failed', 'convert_failed'):
            report.append({'name': r['name'], 'status': r['status']}); continue
        if r['md5'] in seen:
            report.append({'name': r['name'], 'status': 'duplicate'}); continue
        seen.add(r['md5'])
        # skip recordings already in the app (same range and same length)
        if r['status'] == 'ok' and any(c['from'] == r['from'] and c['to'] == r['to'] and c.get('duration') and r['duration'] and abs(c['duration'] - r['duration']) <= 2 for c in clips):
            report.append({'name': r['name'], 'status': 'already_in_app', 'from': r['from'], 'to': r['to']}); continue
        if r['status'] == 'ok':
            a, b = r['from'], r['to']
            base = f'{a}' if a == b else f'{a}-{b}'
            cid, n = base, 2
            ids = {c['id'] for c in clips}
            while cid in ids: cid = f'{base}_{n}'; n += 1
            dest = f'audio/{cid}.m4a'
            shutil.move(r['audio'], os.path.join(ROOT, dest))
            clips.append({'id': cid, 'from': a, 'to': b, 'src': dest, 'title': '', 'speaker': '', 'duration': r['duration'], 'added': today, 'file': r['name'], 'auto': True})
            report.append({'name': r['name'], 'status': 'ok', 'from': a, 'to': b, 'id': cid})
        else:
            os.makedirs(os.path.join(ROOT, 'audio', 'unmatched'), exist_ok=True)
            dest = f"audio/unmatched/{r['id']}.m4a"
            shutil.move(r['audio'], os.path.join(ROOT, dest))
            unmatched.append({'file': dest, 'original': r['name'], 'duration': r['duration'], 'added': today, 'text_start': r.get('text_start', '')})
            report.append({'name': r['name'], 'status': 'no_match'})
    clips.sort(key=lambda c: (c['from'], c['to']))
    save(os.path.join(ROOT, 'data', 'clips.json'), clips)
    if unmatched: save(os.path.join(ROOT, 'data', 'unmatched.json'), unmatched)
    save(os.path.join(ROOT, 'data', 'import-report.json'), report)
    print(json.dumps(report, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    c = sys.argv[1]
    if c == 'list': cmd_list(sys.argv[2], int(sys.argv[3]))
    elif c == 'shard': cmd_shard(int(sys.argv[2]))
    elif c == 'merge': cmd_merge(sys.argv[2])
