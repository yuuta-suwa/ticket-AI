from pathlib import Path
import json,hashlib
r=Path(__file__).resolve().parents[1]
m=json.loads((r/'source-snapshot-manifest.json').read_text())
assert m['source_commit']=='03a801ccd82d8aca8378554dfc61ec5104596032'
for f in m['files']:
 p=r/f['path'];assert p.is_file(),f['path'];b=p.read_bytes();assert len(b)==f['bytes'],f['path'];assert hashlib.sha256(b).hexdigest()==f['sha256'],f['path']
for p in r.rglob('*.json'):json.loads(p.read_text())
assert len(json.loads((r/'docs/DESIGN_REFERENCES.json').read_text())['images'])==3
print('Source integrity OK:',len(m['files']),'files. JSON syntax and design manifest OK.')
