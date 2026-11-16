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
    tg, tg3 = grams(tw), grams(tw, 3)
    scores, counts, tri = [], [], []
    for a in ayat:
        w = norm(a['t'])
        g = grams(w)
        c = len(g & tg)
        scores.append(c / len(g) if g else 0); counts.append(c)
        tri.append(len(grams(w, 3) & tg3))
    # well-recited ayat: a good share of the ayah's word pairs, and not just a stock phrase
    good = [i for i in range(len(ayat)) if (scores[i] >= 0.3 and counts[i] >= 3) or (counts[i] >= 5 and scores[i] >= 0.12)]
    if good:
        blocks, cur = [], [good[0]]
        for i in good[1:]:
            if i - cur[-1] <= 2: cur.append(i)
            else: blocks.append(cur); cur = [i]
        blocks.append(cur)
        best = max(blocks, key=lambda b: (sum(counts[i] for i in b), len(b)))
        return (ayat[best[0]]['n'], ayat[best[-1]]['n']), scores
    # long ayat that are only partly recited: word triples clearly ahead of any unrelated ayah
    best = max(range(len(ayat)), key=lambda i: tri[i])
    others = [c for i, c in enumerate(tri) if abs(i - best) > 2] or [0]
    if tri[best] >= 3 and tri[best] >= 2 * max(others):
        rng = [i for i in range(best - 2, best + 3) if 0 <= i < len(ayat) and tri[i] >= 0.6 * tri[best]]
        return (ayat[rng[0]]['n'], ayat[rng[-1]]['n']), scores
    return None, scores


if __name__ == '__main__':
    here = os.path.dirname(os.path.abspath(__file__))
    ayat = json.load(open(os.path.join(here, '..', 'data', 'ayat.json'), encoding='utf-8'))
    rng, scores = match(open(sys.argv[1], encoding='utf-8').read(), ayat)
    if '-v' in sys.argv:
        print(sorted(((round(s, 2), i + 1) for i, s in enumerate(scores)), reverse=True)[:12], file=sys.stderr)
    print(f'{rng[0]} {rng[1]}' if rng else '')
