"""Keep Firebase Hosting under the free storage quota: retain only the 2 newest versions
and delete older ones. Uses the service account in $SA_FILE."""
import json, os, sys
from google.oauth2 import service_account
from google.auth.transport.requests import AuthorizedSession

SITE = os.environ.get('SITE', 'tafseer-albaqara')
creds = service_account.Credentials.from_service_account_file(os.environ['SA_FILE'], scopes=['https://www.googleapis.com/auth/cloud-platform'])
s = AuthorizedSession(creds)
API = 'https://firebasehosting.googleapis.com/v1beta1'
r = s.patch(f'{API}/sites/{SITE}/config?updateMask=maxVersions', json={'maxVersions': 2}); print('config', r.status_code, r.text[:200])
live = s.get(f'{API}/sites/{SITE}/channels/live').json().get('release', {}).get('version', {}).get('name')
versions, tok = [], None
while True:
    j = s.get(f'{API}/sites/{SITE}/versions', params={'pageSize': 100, **({'pageToken': tok} if tok else {})}).json()
    versions += j.get('versions', []); tok = j.get('nextPageToken')
    if not tok: break
print(len(versions), 'versions; live =', live)
for v in versions:
    if v['name'] != live and v.get('status') in ('FINALIZED', 'CREATED', 'ABANDONED', 'EXPIRED'):
        d = s.delete(f"{API}/{v['name']}"); print('delete', v['name'].split('/')[-1], v.get('status'), d.status_code)
