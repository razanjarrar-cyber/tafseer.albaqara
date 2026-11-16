"""Re-match every imported recording from its saved transcript and rebuild data/clips.json.

Recordings with an "البقرة N" file name keep the ayat in their name. Others are matched
from data/transcripts/<audio basename>.txt. Unmatched files stay in audio/unmatched/.
Run from the repo root: python tools/rebuild_mapping.py
"""
import json, os, re, sys, shutil
sys.path.insert(0, os.path.dirname(__file__))
from match_ayat import match


def load(p, d):
    try: return json.load(open(p, encoding='utf-8'))
    except FileNotFoundError: return d


def save(p, data):
    with open(p, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2); f.write('\n')


ayat = load('data/ayat.json', [])
clips = load('data/clips.json', [])
unmatched = load('data/unmatched.json', [])

keep = [c for c in clips if not c.get('file')]          # recordings not from the Drive import
items = [{**c, 'path': c['src'], 'original': c['file']} for c in clips if c.get('file')]
items += [{'path': u['file'], 'original': u['original'], 'duration': u.get('duration'), 'added': u.get('added')} for u in unmatched]


def hint(name):
    m = re.match(r'البقرة\s+([\d\s.]+)', name)
    if not m: return None
    ns = [int(x) for x in re.findall(r'\d+', m.group(1))]
    return (min(ns), max(ns)) if ns else None


for it in items:
    key = os.path.splitext(os.path.basename(it['path']))[0]
    tpath = f'data/transcripts/{key}.txt'
    rng = hint(it['original'])
    it['how'] = 'name'
    if not rng and os.path.exists(tpath):
        rng, _ = match(open(tpath, encoding='utf-8').read(), ayat); it['how'] = 'audio'
    if not rng and not os.path.exists(tpath):
        rng = (it['from'], it['to']) if it.get('from') else None; it['how'] = 'previous'
    it['rng'] = rng
    it['tkey'] = key

# move everything to temporary names first so renames can't collide
os.makedirs('audio/_tmp', exist_ok=True)
for i, it in enumerate(items):
    tmp = f'audio/_tmp/{i}.m4a'
    shutil.move(it['path'], tmp); it['tmp'] = tmp
    t = f"data/transcripts/{it['tkey']}.txt"
    if os.path.exists(t): shutil.move(t, f'audio/_tmp/{i}.txt'); it['ttmp'] = f'audio/_tmp/{i}.txt'

ids = {c['id'] for c in keep}
new_clips, new_un, report = [], [], []
for it in sorted(items, key=lambda x: (x['rng'] or (999, 999), x['original'])):
    if it['rng']:
        a, b = it['rng']
        base = f'{a}' if a == b else f'{a}-{b}'
        cid, n = base, 2
        while cid in ids: cid = f'{base}_{n}'; n += 1
        ids.add(cid)
        dest = f'audio/{cid}.m4a'
        new_clips.append({'id': cid, 'from': a, 'to': b, 'src': dest, 'title': it.get('title', ''), 'speaker': it.get('speaker', ''),
                          'duration': it.get('duration'), 'added': it.get('added'), 'file': it['original'], 'auto': True})
    else:
        os.makedirs('audio/unmatched', exist_ok=True)
        dest = f"audio/unmatched/{it['tkey']}.m4a"
        new_un.append({'file': dest, 'original': it['original'], 'duration': it.get('duration'), 'added': it.get('added')})
    shutil.move(it['tmp'], dest)
    if it.get('ttmp'): shutil.move(it['ttmp'], f"data/transcripts/{os.path.splitext(os.path.basename(dest))[0]}.txt")
    report.append({'name': it['original'], 'range': it['rng'], 'how': it['how']})
os.rmdir('audio/_tmp')

allc = sorted(keep + new_clips, key=lambda c: (c['from'], c['to']))
save('data/clips.json', allc)
save('data/unmatched.json', new_un)
save('data/rebuild-report.json', report)
print(len(new_clips), 'matched,', len(new_un), 'unmatched')
