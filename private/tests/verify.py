"""Verificación no destructiva: builds temporales; no falsifica vendor."""
from pathlib import Path
import base64, json, os, re, subprocess, tempfile, sys
ROOT=Path(__file__).resolve().parents[2]
checks=[]
def check(name,ok,detail=''):
 checks.append(bool(ok));print(('PASS' if ok else 'FAIL'),name,detail if not ok else '')
def read(p):return (ROOT/p).read_text(encoding='utf-8')
def main():
 pkg=json.loads(read('package.json'))
 check('pnpm fijado y lockfile',pkg['packageManager']=='pnpm@11.5.1' and (ROOT/'pnpm-lock.yaml').exists())
 check('Migracion y rollback 004',(ROOT/'private/supabase/migrations/004_security_performance.sql').exists() and (ROOT/'private/supabase/rollback/004_security_performance.rollback.sql').exists())
 from pglast import parse_sql,parse_plpgsql
 sql_paths=list((ROOT/'private/supabase').rglob('*.sql'))
 try:
  for path in sql_paths:parse_sql(path.read_text(encoding='utf-8'))
  parse_plpgsql(read('private/supabase/migrations/004_security_performance.sql'))
  check('Sintaxis SQL y PLpgSQL 004',True)
 except Exception as error:check('Sintaxis SQL y PLpgSQL 004',False,str(error))
 result=subprocess.run(['node','private/tests/admin_test.mjs'],cwd=ROOT,capture_output=True,text=True);check('Validacion de entradas y sesion admin',result.returncode==0,result.stdout+result.stderr)
 for p in [*ROOT.glob('public/**/*.js'),*ROOT.glob('panel/**/*.js'),ROOT/'build.mjs',ROOT/'build-panel.mjs']:
  result=subprocess.run(['node','--check',str(p)],capture_output=True,text=True)
  check(f'Sintaxis {p.relative_to(ROOT)}',result.returncode==0,result.stderr)
 paths=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z'],cwd=ROOT).decode().split('\0')
 secret=re.compile(r'(?:ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|sb_secret_[A-Za-z0-9_]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|AKIA[A-Z0-9]{16})')
 leaks=[]
 for path in filter(None,paths):
  p=ROOT/path
  if not p.is_file():continue
  if p.suffix.lower() in {'.js','.mjs','.html','.sql','.json','.yaml','.md','.txt','.csv'}:
   content=p.read_text(encoding='utf-8')
   if secret.search(content):leaks.append(path)
   for token in re.findall(r'eyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+',content):
    try:
     if json.loads(base64.urlsafe_b64decode(token+'='*(-len(token)%4))).get('role')=='service_role':leaks.append(path)
    except (ValueError,UnicodeError):pass
 check('Sin claves privadas reconocibles en archivos versionados',not leaks,str(leaks))
 (ROOT/'artifacts').mkdir(exist_ok=True)
 with tempfile.TemporaryDirectory(prefix='verify_',dir=ROOT/'artifacts') as td:
  env=os.environ.copy();env.update(BS_OUTPUT_DIR=Path(td).relative_to(ROOT).as_posix(),SUPABASE_URL='https://example.supabase.co',SUPABASE_ANON_KEY='public-test-key',SKIP_SITEMAP_API='1',CF_PAGES_BRANCH='preview',CF_PAGES_URL='https://preview.pages.dev');env.pop('SITE_URL',None)
  def build(extra={}):return subprocess.run(['node','build.mjs'],cwd=ROOT,env={**env,**extra},capture_output=True,text=True)
  result=build();check('Build preview',result.returncode==0,result.stdout+result.stderr)
  if result.returncode==0:
   out=Path(td);headers=(out/'_headers').read_text(encoding='utf-8');worker=(out/'_worker.js').read_text(encoding='utf-8')
   check('Rutas Worker solo producto',json.loads((out/'_routes.json').read_text())['include']==['/producto/*'])
   check('CSP exacta sin wildcard','https://example.supabase.co' in headers and '*.supabase.co' not in headers+worker)
   check('Cache estatica revalidable','max-age=3600, must-revalidate' in headers and 'max-age=86400' in headers and 'immutable' in headers)
   check('Worker timeout 2.5s y cache 60s','2500' in worker and 'max-age=60' in worker)
   for page in ['index.html','catalogo.html','producto/index.html','favoritos.html','tallas.html']:
    html=(out/page).read_text(encoding='utf-8');check(f'{page}: sin SDK publico ni placeholders','assets/vendor/supabase-' not in html and '<!--BS_' not in html)
   check('Tienda sin SDK ni archivos privados',not (out/'admin').exists() and not list(out.rglob('supabase-*.js')))
   check('Sin SQL ni datos privados desplegados',not any(p.suffix in {'.sql','.csv'} and 'admin/import-template.csv' not in p.as_posix() for p in out.rglob('*')))
   result=subprocess.run(['node','private/tests/worker_test.mjs',str(out/'_worker.js')],cwd=ROOT,capture_output=True,text=True);check('Contrato Worker con mocks locales',result.returncode==0,result.stdout+result.stderr)
  for label,extra in [('Origen invalido',{'SUPABASE_URL':'https://evil.example'}),('Clave secreta',{'SUPABASE_ANON_KEY':'sb_secret_forbidden'}),('Produccion sin dominio',{'CF_PAGES_BRANCH':'main'})]:
   result=build(extra);check('Rechaza '+label,result.returncode!=0,result.stdout+result.stderr)
  result=build({'CF_PAGES_BRANCH':'main','SITE_URL':'https://shop.example.com'});check('Build produccion configurada',result.returncode==0,result.stdout+result.stderr)
 result=subprocess.run([sys.executable,'private/tests/separation_test.py'],cwd=ROOT,capture_output=True,text=True);check('Separacion HTTP y autenticacion criptografica del panel',result.returncode==0,result.stdout+result.stderr)
 print(f'{sum(checks)}/{len(checks)} comprobaciones correctas');return 0 if all(checks) else 1
if __name__=='__main__':sys.exit(main())
