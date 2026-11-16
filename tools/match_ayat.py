"""Find which ayat of Al-Baqarah a transcript covers.

Usage: python tools/match_ayat.py transcript.txt  -> prints "FROM TO"
Scores each ayah by how many of its word bigrams appear in the transcript,
then returns the densest contiguous block of well-matched ayat.
"""
import json, re, sys, os

DIAC = re.compile(r'[ؐ-ًؚ-ٰٟۖ-ۭـ]')
def norm(t):
    t = DIAC.sub('', t)
    t = re.sub('[إأآٱا]', 'ا', t)
    t = t.replace('ى', 'ي').replace('ة', 'ه').replace('ؤ', 'و').replace('ئ', 'ي').replace('ء', '')
    t = re.sub(r'[^ء-ي\s]', ' ', t)
    return t.split()

def grams(words, n=2):
    return {' '.join(words[i:i + n]) for i in range(len(words) - n + 1)}

def match(transcript, ayat):
    tw = norm(transcript)
    tg = grams(tw)
    scores = []
    for a in ayat:
        g = grams(norm(a['t']))
        scores.append(len(g & tg) / len(g) if g else 0)
    good = [i for i, s in enumerate(scores) if s >= 0.3]
    if not good:
        return None, scores
    # group into blocks allowing a gap of one ayah, keep the block with most matched ayat
    blocks, cur = [], [good[0]]
    for i in good[1:]:
        if i - cur[-1] <= 2: cur.append(i)
        else: blocks.append(cur); cur = [i]
    blocks.append(cur)
    best = max(blocks, key=lambda b: (len(b), sum(scores[i] for i in b)))
    return (ayat[best[0]]['n'], ayat[best[-1]]['n']), scores

if __name__ == '__main__':
    here = os.path.dirname(os.path.abspath(__file__))
    ayat = json.load(open(os.path.join(here, '..', 'data', 'ayat.json'), encoding='utf-8'))
    rng, scores = match(open(sys.argv[1], encoding='utf-8').read(), ayat)
    if '-v' in sys.argv:
        print(sorted(((round(s, 2), i + 1) for i, s in enumerate(scores)), reverse=True)[:12], file=sys.stderr)
    print(f'{rng[0]} {rng[1]}' if rng else '')
