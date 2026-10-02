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
