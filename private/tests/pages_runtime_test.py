"""Pages/workerd real en loopback; RPC simulada, sin datos ni cuentas reales."""
from pathlib import Path
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
import json, os, socket, subprocess, sys, tempfile, threading, time
from urllib.request import urlopen
from urllib.error import HTTPError, URLError

ROOT=Path(__file__).resolve().parents[2]
sys.stdout.reconfigure(encoding='utf-8',errors='replace')

def free_port():
 with socket.socket() as sock:
  sock.bind(('127.0.0.1',0));return sock.getsockname()[1]

def request(url):
 try:
  with urlopen(url,timeout=8) as response:return response.status,response.headers,response.read().decode()
 except HTTPError as error:return error.code,error.headers,error.read().decode()

def main():
 checks=0
 def check(name,condition):
  nonlocal checks
  assert condition,name
  checks+=1;print('PASS Pages:',name,flush=True)
 class RPC(BaseHTTPRequestHandler):
  def do_POST(self):
   args=json.loads(self.rfile.read(int(self.headers.get('Content-Length',0))))
   if args.get('p_slug')=='offline':self.send_error(503);return
   body=json.dumps({'slug':'native-product','name':'Producto de prueba Pages','description':'Solo fixture local','images':[{'ogStoragePath':'fixture.og.jpg'}]}).encode()
   self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
  def log_message(self,*args):pass
 server=ThreadingHTTPServer(('127.0.0.1',0),RPC);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
 processes=[];logs=[]
 # Windows puede retener brevemente los SQLite de workerd después de taskkill.
 # La limpieza de esa caché no debe invalidar las comprobaciones funcionales.
 temporary=tempfile.TemporaryDirectory(prefix="pages_",dir=ROOT/"artifacts",ignore_cleanup_errors=os.name=='nt')
 try:
  directory=temporary.name
  base=Path(directory)
  env={**os.environ,'WRANGLER_SEND_METRICS':'false','CI':'1','SUPABASE_URL':'https://mock.supabase.co','SUPABASE_ANON_KEY':'mock-public-key','SITE_URL':'https://store.example.com','PANEL_URL':'https://panel.example.com','STOREFRONT_URL':'https://store.example.com','CF_PAGES_BRANCH':'main','PRODUCTION_BRANCH':'main','SKIP_SITEMAP_API':'1'}
  env.pop('CF_PAGES_URL',None)
  for script,folder,key in [('build.mjs','store','BS_OUTPUT_DIR'),('build-panel.mjs','panel','BS_PANEL_OUTPUT_DIR')]:
   subprocess.run(['node',script],cwd=ROOT,env={**env,key:(base/folder).relative_to(ROOT).as_posix()},check=True,capture_output=True)
  def start(folder,bindings):
   port=free_port();origin=f'http://127.0.0.1:{port}'
   # Isolated cwd keeps local .env/.dev.vars and generated production config out of this test.
   log=(base/(folder+'-'+str(port)+'.log')).open('w',encoding='utf-8');logs.append(log)
   command=['node',str(ROOT/'node_modules/wrangler/bin/wrangler.js'),'pages','dev',str(base/folder),'--ip','127.0.0.1','--port',str(port),'--inspector-port',str(free_port()),'--compatibility-date','2026-11-04','--show-interactive-dev-session=false','--persist-to',str(base/('state-'+str(port)))]
   for key,value in bindings.items():command+=['--binding',key+'='+value]
   process=subprocess.Popen(command,cwd=base,env=env,stdout=log,stderr=subprocess.STDOUT,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0,start_new_session=os.name!='nt');processes.append(process)
   deadline=time.monotonic()+90
   while time.monotonic()<deadline:
    if process.poll() is not None:break
    try:request(origin+'/');return origin
    except (URLError,TimeoutError,ConnectionError):time.sleep(.25)
   log.flush();raise RuntimeError((base/(folder+'-'+str(port)+'.log')).read_text(encoding='utf-8',errors='replace'))
  origin=start('store',{'SUPABASE_URL':f'http://127.0.0.1:{server.server_port}','SUPABASE_ANON_KEY':'mock-public-key'})
  status,headers,body=request(origin+'/')
  check('home 200 y HTML sin caché',status==200 and 'no-store' in headers.get('Cache-Control',''))
  status,headers,body=request(origin+'/assets/js/ui.js')
  check('JS estático con una hora de caché',status==200 and 'max-age=3600' in headers.get('Cache-Control',''))
  check('CSP y HSTS en estáticos','https://mock.supabase.co' in headers.get('Content-Security-Policy','') and 'max-age=' in headers.get('Strict-Transport-Security',''))
  status,headers,body=request(origin+'/producto/native-product/?utm_source=test')
  check('ficha 200 con HTMLRewriter nativo',status==200 and '<title>Producto de prueba Pages | Batting Shop</title>' in body)
  check('og:title del producto','property="og:title" content="Producto de prueba Pages | Batting Shop"' in body)
  check('og:url sin parámetros',f'property="og:url" content="{origin}/producto/native-product/"' in body)
  check('og:image JPG','fixture.og.jpg' in body)
  status,headers,body=request(origin+'/producto/offline/')
  check('fallback ante Supabase caído',status==200 and '<title>Producto | Batting Shop</title>' in body)
  for path in ['/admin/','/assets/admin.js','/private/supabase/schema.sql']:
   check('ruta privada ausente '+path,request(origin+path)[0]==404)
  panel=start('panel',{})
  for path in ['/','/assets/config.js','/assets/admin.js']:
   status,headers,body=request(panel+path)
   check('panel cerrado sin Access '+path,status==503 and 'adminEmail' not in body and 'no-store' in headers.get('Cache-Control',''))
  panel=start('panel',{'CF_ACCESS_TEAM_DOMAIN':'https://fixture.cloudflareaccess.com','CF_ACCESS_AUD':'test-audience','PANEL_ALLOWED_EMAILS':'owner@example.invalid'})
  check('panel deniega sesión Access ausente',request(panel+'/')[0]==403)
  print(f'{checks}/{checks} comprobaciones con Pages/workerd nativo correctas; RPC simulada.',flush=True)
 finally:
  for process in processes:
   if process.poll() is None:
    if os.name=='nt':subprocess.run(['taskkill','/PID',str(process.pid),'/T','/F'],capture_output=True)
    else:
     import signal
     os.killpg(process.pid,signal.SIGTERM)
    process.wait(timeout=10)
  for log in logs:log.close()
  server.shutdown();server.server_close();thread.join();temporary.cleanup()
 return 0

if __name__=='__main__':sys.exit(main())
