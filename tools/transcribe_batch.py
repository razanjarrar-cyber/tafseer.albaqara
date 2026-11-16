"""Transcribe files already in the repo and keep the text, used by .github/workflows/transcribe.yml.

  list GLOB N   -> shards.json + matrix
  shard K       -> out/<K>/<basename>.txt (model from $WHISPER_MODEL, default small)
"""
import glob, json, os, sys
if sys.argv[1] == 'list':
    files = sorted(glob.glob(sys.argv[2])); n = int(sys.argv[3])
    json.dump([files[i::n] for i in range(n)], open('shards.json', 'w'))
    print(json.dumps([i for i in range(n) if files[i::n]]))
else:
    import whisper
    k = int(sys.argv[2]); files = json.load(open('shards.json'))[k]
    out = os.path.join('out', str(k)); os.makedirs(out, exist_ok=True)
    model = whisper.load_model(os.environ.get('WHISPER_MODEL', 'small'))
    for f in files:
        text = model.transcribe(f, language='ar', fp16=False)['text']
        open(os.path.join(out, os.path.splitext(os.path.basename(f))[0] + '.txt'), 'w', encoding='utf-8').write(text)
        print('done', f, flush=True)
