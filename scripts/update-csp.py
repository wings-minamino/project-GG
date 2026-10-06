"""Refresh inline-script hashes after editing index.html (Python standard library)."""
from pathlib import Path
import re,hashlib,base64
p=Path(__file__).resolve().parents[1]/'index.html'
s=p.read_text()
hashes=["'sha256-"+base64.b64encode(hashlib.sha256(code.encode()).digest()).decode()+"'" for code in re.findall(r'<script>(.*?)</script>',s,re.S)]
policy="default-src 'none'; script-src "+' '.join(hashes)+"; style-src 'unsafe-inline'; img-src 'self' data:; connect-src https://phswoncmibtmihpmlvdg.supabase.co; manifest-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'"
meta='<meta http-equiv="Content-Security-Policy" content="'+policy+'">'
if 'http-equiv="Content-Security-Policy"' in s:s=re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>',meta,s)
else:s=s.replace('<meta charset="UTF-8">','<meta charset="UTF-8">\n'+meta)
p.write_text(s)
print('Updated CSP for',len(hashes),'inline scripts')

# Build the dedicated teacher entrypoint from the same application source.
admin=s.replace('const IS_ADMIN_PORTAL = false;', 'const IS_ADMIN_PORTAL = true;')
admin=admin.replace('<title>ガチャミッション</title>', '<title>プロジェクトGG 講師用</title>')
admin=admin.replace('./icons/', '../icons/').replace('./templates/', '../templates/').replace('./assets/', '../assets/')
admin_hashes=["'sha256-"+base64.b64encode(hashlib.sha256(code.encode()).digest()).decode()+"'" for code in re.findall(r'<script>(.*?)</script>',admin,re.S)]
admin_policy=policy.replace(' '.join(hashes),' '.join(admin_hashes))
admin=re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>', '<meta http-equiv="Content-Security-Policy" content="'+admin_policy+'">',admin)
folder=p.parent/'admin';folder.mkdir(exist_ok=True)
(folder/'index.html').write_text(admin)
import json
manifest=json.loads((p.parent/'manifest.webmanifest').read_text())
manifest['name']='プロジェクトGG 講師用';manifest['short_name']='GG 講師用'
for icon in manifest['icons']:icon['src']='../'+icon['src']
(folder/'manifest.webmanifest').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print('Built dedicated teacher portal with independent CSP and manifest')
