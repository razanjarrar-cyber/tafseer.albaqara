"""Download audio from a public Google Drive folder/file into audio/inbox/, keeping the original name in a .json sidecar."""
import os, sys, json, re, tempfile, shutil, gdown

url = sys.argv[1]
root = os.path.join(os.path.dirname(__file__), '..')
inbox = os.path.join(root, 'audio', 'inbox'); os.makedirs(inbox, exist_ok=True)
tmp = tempfile.mkdtemp()
if '/folders/' in url:
    gdown.download_folder(url, output=tmp, quiet=False, retries=3)
else:
    gdown.download(url, output=tmp + '/', quiet=False, fuzzy=True)
AUDIO = ('.m4a', '.mp3', '.mp4', '.aac', '.ogg', '.wav', '.opus', '.webm', '.amr', '.3gp')
n = 0
for dirpath, _, names in os.walk(tmp):
    for name in sorted(names):
        if not name.lower().endswith(AUDIO): continue
        src = os.path.join(dirpath, name)
        ext = os.path.splitext(name)[1].lower()
        safe = f'drive-{n:03d}{ext}'
        # store as AAC m4a if the format is not browser friendly
        if ext in ('.amr', '.3gp', '.wav', '.ogg', '.opus', '.webm'):
            safe = f'drive-{n:03d}.m4a'
            os.system(f'ffmpeg -loglevel error -y -i "{src}" -vn -ac 1 -c:a aac -b:a 64k "{os.path.join(inbox, safe)}"')
        else:
            shutil.copy(src, os.path.join(inbox, safe))
        json.dump({'file': os.path.relpath(src, tmp)}, open(os.path.join(inbox, safe) + '.json', 'w'), ensure_ascii=False)
        print('imported', name, '->', safe); n += 1
print(n, 'files')
