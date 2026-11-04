"""Prueba dos orígenes y salidas independientes sin tocar Supabase real."""
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
import os,subprocess,tempfile,threading,urllib.request,urllib.error,json
ROOT=Path(__file__).resolve().parents[2]
def main():
 (ROOT/'artifacts').mkdir(exist_ok=True)
 with tempfile.TemporaryDirectory(prefix='split_',dir=ROOT/'artifacts') as td:
  base=Path(td);store=base/'store';panel=base/'panel'
  env=os.environ.copy();env.update(SUPABASE_URL='https://mock.supabase.co',SUPABASE_ANON_KEY='mock-public-key',SKIP_SITEMAP_API='1',SITE_URL='http://localhost:8080',PANEL_URL='http://localhost:8081',STOREFRONT_URL='http://localhost:8080');env.pop('CF_PAGES_URL',None);env.pop('CF_PAGES_BRANCH',None)
  for script,dest,var in [('build.mjs',store,'BS_OUTPUT_DIR'),('build-panel.mjs',panel,'BS_PANEL_OUTPUT_DIR')]:
   subprocess.run(['node',script],cwd=ROOT,env={**env,var:dest.relative_to(ROOT).as_posix()},check=True,capture_output=True,text=True)
  files=[p for p in store.rglob('*') if p.is_file()]
  assert not any('admin' in p.relative_to(store).as_posix().lower() or 'panel' in p.relative_to(store).as_posix().lower() for p in files)
  for path in files:
   if path.suffix in {'.js','.html','.css','.json','.txt','.xml','.webmanifest'} or path.name=='_headers':
    content=path.read_text(encoding='utf-8').lower();assert 'admin' not in content and 'admin_users' not in content and 'createclient' not in content and 'supabase-js' not in content,path
  assert not list(store.rglob('supabase-*.js'))
  assert (panel/'assets/admin.js').is_file() and (panel/'assets/config.js').is_file()
  assert (panel/'assets/vendor/supabase-2.117.2.js').is_file()
  assert 'http://localhost:8080' in (panel/'index.html').read_text(encoding='utf-8')
  assert json.loads((panel/'_routes.json').read_text())['include']==['/*']
  servers=[];threads=[]
  def start(directory):
   class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(directory),**kwargs)
    def log_message(self,*args):pass
   server=ThreadingHTTPServer(('127.0.0.1',0),Handler);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start();servers.append(server);threads.append(thread);return f'http://127.0.0.1:{server.server_port}'
  try:
   store_origin=start(store);panel_origin=start(panel)
   for path in ['/admin','/admin/','/admin/index.html','/%61dmin/','/panel/','/assets/admin.js','/admin/assets/admin.js','/assets/image-processing.js','/assets/vendor/supabase-2.117.2.js']:
    try:urllib.request.urlopen(store_origin+path);raise AssertionError('Ruta privada accesible: '+path)
    except urllib.error.HTTPError as error:assert error.code==404,(path,error.code)
   html=urllib.request.urlopen(panel_origin+'/').read().decode();assert 'adminEmail' in html and 'supabase-2.117.2.js' in html
   assert 'adminEmail' not in urllib.request.urlopen(store_origin+'/').read().decode()
  finally:
   for server in servers:server.shutdown();server.server_close()
   for thread in threads:thread.join()
  result=subprocess.run(['node','private/tests/panel_worker_test.mjs',str(panel/'_worker.js')],cwd=ROOT,capture_output=True,text=True)
  assert result.returncode==0,result.stdout+result.stderr
  print(result.stdout.strip())
  # Configuraciones que podrían mezclar los dos sitios se rechazan antes de copiar.
  before=(panel/'index.html').read_bytes()
  for invalid in [
   {'PANEL_URL':env['STOREFRONT_URL']},
   {'CF_PAGES_URL':'https://panel.example.invalid'},
   {'PANEL_URL':'https://user:password@panel.example.invalid'},
   {'SUPABASE_ANON_KEY':'sb_secret_forbidden'}
  ]:
   rejected=subprocess.run(['node','build-panel.mjs'],cwd=ROOT,env={**env,**invalid,'BS_PANEL_OUTPUT_DIR':panel.relative_to(ROOT).as_posix()},capture_output=True,text=True)
   assert rejected.returncode!=0,invalid
   assert (panel/'index.html').read_bytes()==before,'Un build inválido no debe reemplazar el panel anterior'
 print('PASS separación: sin panel ni SDK en tienda; 9 rutas antiguas dan 404; panel separado y Worker privado')
if __name__=='__main__':main()
