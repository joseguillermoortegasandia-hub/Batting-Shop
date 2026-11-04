"""Acceso MFA y guardado en panel con API simulada: no escribe en Supabase."""
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from urllib.parse import urlparse
import base64,json,os,subprocess,tempfile,threading,time,uuid
ROOT=Path(__file__).resolve().parents[2]
def main():
 from playwright.sync_api import sync_playwright
 (ROOT/'artifacts').mkdir(exist_ok=True)
 with tempfile.TemporaryDirectory(prefix='panel_flow_',dir=ROOT/'artifacts') as td:
  env={**os.environ,'BS_PANEL_OUTPUT_DIR':Path(td).relative_to(ROOT).as_posix(),'SUPABASE_URL':'https://mock.supabase.co','SUPABASE_ANON_KEY':'mock-public-key','PANEL_URL':'http://localhost:8081','STOREFRONT_URL':'http://localhost:8080'}
  env.pop('CF_PAGES_URL',None);env.pop('CF_PAGES_BRANCH',None)
  subprocess.run(['node','build-panel.mjs'],cwd=ROOT,env=env,check=True,capture_output=True)
  class Handler(SimpleHTTPRequestHandler):
   protocol_version='HTTP/1.1'
   def __init__(self,*args,**kwargs):super().__init__(*args,directory=td,**kwargs)
   def log_message(self,*args):pass
  class Server(ThreadingHTTPServer):request_queue_size=128
  server=Server(('127.0.0.1',0),Handler);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start();origin=f'http://127.0.0.1:{server.server_port}'
  user_id='10000000-0000-4000-8000-000000000001';category_id='20000000-0000-4000-8000-000000000001'
  factor={'id':'factor-test','factor_type':'totp','status':'verified','friendly_name':'Test'}
  user={'id':user_id,'email':'owner@example.invalid','role':'authenticated','aud':'authenticated','factors':[factor],'app_metadata':{'provider':'email'},'user_metadata':{}}
  category={'id':category_id,'slug':'accesorios','name':'Accesorios','is_active':True,'show_on_home':True,'variant_mode':'single','sort_order':1}
  def jwt(aal):
   encode=lambda o:base64.urlsafe_b64encode(json.dumps(o).encode()).decode().rstrip('=')
   return encode({'alg':'HS256','typ':'JWT'})+'.'+encode({'sub':user_id,'aud':'authenticated','role':'authenticated','aal':aal,'email':user['email'],'exp':int(time.time())+3600,'iat':int(time.time()),'session_id':str(uuid.uuid4())})+'.'+'a'*43
  try:
   with sync_playwright() as pw:
    browser=pw.chromium.launch(channel='chrome')
    for aal in ['aal1','aal2']:
     db={'products':[],'product_variants':[],'inventory_private':[]};errors=[];requests=[]
     def api(route):
      request=route.request;url=urlparse(request.url);path=url.path;method=request.method;requests.append((method,path))
      data=request.post_data_json if request.post_data else None
      if path=='/auth/v1/token':body={'access_token':jwt(aal),'refresh_token':'test-refresh-token','expires_in':3600,'token_type':'bearer','user':user}
      elif path=='/auth/v1/user':body=user
      elif path=='/auth/v1/factors':body={'all':[factor],'totp':[factor],'phone':[]}
      elif path=='/auth/v1/logout':body={}
      elif path.startswith('/rest/v1/'):
       table=path.rsplit('/',1)[-1]
       if table=='admin_users':rows=[{'user_id':user_id,'role':'owner'}]
       elif table=='categories':rows=[category]
       else:rows=db.get(table,[])
       if method=='POST':
        rows=data if isinstance(data,list) else [data]
        for row in rows:
         row.setdefault('id',str(uuid.uuid4()));row.setdefault('created_at','2026-11-03T00:00:00Z');row.setdefault('updated_at',row['created_at'])
         if table=='product_variants':row.setdefault('available',False)
        db.setdefault(table,[]).extend(rows)
       elif method not in ['GET','HEAD']:raise AssertionError('Petición de escritura inesperada: '+method+' '+path)
       body=rows[0] if 'application/vnd.pgrst.object+json' in request.headers.get('accept','') and rows else rows
      else:raise AssertionError('Endpoint inesperado '+path)
      route.fulfill(json=body,headers={'Access-Control-Allow-Origin':'*'})
     context=browser.new_context(viewport={'width':1366,'height':900});context.route('https://mock.supabase.co/**',api);page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
     page.goto(origin);page.locator('#adminEmail').fill(user['email']);page.locator('#adminPassword').fill('Test-only-password-123!');page.locator('#signInBtn').click()
     if aal=='aal1':
      page.wait_for_selector('#mfaChallengePanel',state='visible');assert not page.locator('#adminApp').is_visible();print('PASS MFA requerido antes de entrar al panel',flush=True)
     else:
      try:page.wait_for_selector('#adminApp',state='visible')
      except Exception:print('DIAGNOSTICO',requests,errors,page.locator('body').inner_text(),flush=True);raise
      page.get_by_role('button',name='+ Nuevo producto',exact=True).click();page.wait_for_selector('#productEditor[open]')
      page.locator('#saveDraft').click();page.wait_for_selector('.admin-toast.error');assert not db['products'];assert not errors,errors
      print('PASS formulario incompleto muestra error y no escribe productos',flush=True)
      page.locator('#fName').fill('Producto de prueba local');page.locator('#fBrand').fill('Marca de prueba');page.locator('#fPrice').fill('12.50');page.locator('#fDescription').fill('Solo fixture local, nunca se envía a la base real.')
      page.locator('#saveDraft').click();page.wait_for_selector('#productEditor',state='hidden')
      assert len(db['products'])==1 and db['products'][0]['status']=='draft';assert len(db['product_variants'])==1 and len(db['inventory_private'])==1
      assert page.locator('#metricDrafts').inner_text()=='1';assert not errors,errors
      page.screenshot(path=str(ROOT/'artifacts/panel-dashboard-test.png'),full_page=True)
      print('PASS login MFA AAL2, formulario de producto, variante, inventario y borrador (API simulada)',flush=True)
     context.close()
    browser.close()
  finally:server.shutdown();server.server_close();thread.join()
if __name__=='__main__':main()
