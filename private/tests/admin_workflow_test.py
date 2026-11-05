"""Acceso con contraseña y guardado en panel con API simulada: no escribe en Supabase."""
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
  category={'id':category_id,'slug':'accesorios','name':'Accesorios','is_active':True,'show_on_home':True,'variant_mode':'color_only','sort_order':1}
  def jwt(aal):
   encode=lambda o:base64.urlsafe_b64encode(json.dumps(o).encode()).decode().rstrip('=')
   return encode({'alg':'HS256','typ':'JWT'})+'.'+encode({'sub':user_id,'aud':'authenticated','role':'authenticated','aal':aal,'email':user['email'],'exp':int(time.time())+3600,'iat':int(time.time()),'session_id':str(uuid.uuid4())})+'.'+'a'*43
  try:
   with sync_playwright() as pw:
    browser=pw.chromium.launch(channel='chrome')
    for authorized in [False,True]:
     aal='aal1'
     db={'products':[],'product_variants':[],'inventory_private':[]};errors=[];requests=[]
     def api(route):
      request=route.request;url=urlparse(request.url);path=url.path;method=request.method;requests.append((method,path))
      data=request.post_data_json if 'application/json' in request.headers.get('content-type','') and method in ['POST','PATCH'] else None
      if path=='/auth/v1/token':body={'access_token':jwt(aal),'refresh_token':'test-refresh-token','expires_in':3600,'token_type':'bearer','user':user}
      elif path=='/auth/v1/user':body=user
      elif path=='/auth/v1/factors':body={'all':[factor],'totp':[factor],'phone':[]}
      elif path=='/auth/v1/logout':body={}
      elif path=='/rest/v1/rpc/is_admin':body=authorized
      elif path.startswith('/storage/v1/object/'):
       if method=='GET':route.fulfill(body=(Path(td)/'test-photo.png').read_bytes(),content_type='image/png');return
       assert method=='POST';body={'Key':path.rsplit('/',1)[-1]}
      elif path.startswith('/rest/v1/'):
       table=path.rsplit('/',1)[-1]
       if table=='admin_users':rows=[{'user_id':user_id,'role':'owner'}] if authorized else []
       elif table=='categories':rows=[category]
       else:rows=db.get(table,[])
       if method=='POST':
        rows=data if isinstance(data,list) else [data]
        for row in rows:
         row.setdefault('id',str(uuid.uuid4()));row.setdefault('created_at','2026-11-03T00:00:00Z');row.setdefault('updated_at',row['created_at'])
         if table=='product_variants':row.setdefault('available',False)
        db.setdefault(table,[]).extend(rows)
       elif method=='PATCH':
        from urllib.parse import parse_qs
        row_id=parse_qs(url.query).get('id',[''])[0].removeprefix('eq.')
        rows=[row for row in rows if row.get('id')==row_id]
        for row in rows:row.update(data)
       elif method not in ['GET','HEAD']:raise AssertionError('Petición de escritura inesperada: '+method+' '+path)
       if method=='GET' and table=='products':
        from urllib.parse import parse_qs
        columns=parse_qs(url.query).get('select',['*'])[0]
        if columns!='*':rows=[{column:row.get(column) for column in columns.split(',')} for row in rows]
       body=rows[0] if 'application/vnd.pgrst.object+json' in request.headers.get('accept','') and rows else rows
      else:raise AssertionError('Endpoint inesperado '+path)
      route.fulfill(json=body,headers={'Access-Control-Allow-Origin':'*'})
     context=browser.new_context(viewport={'width':1366,'height':900});context.route('https://mock.supabase.co/**',api);page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
     page.goto(origin);page.locator('#adminEmail').fill(user['email']);page.locator('#adminPassword').fill('Test-only-password-123!');page.locator('#signInBtn').click()
     if not authorized:
      page.wait_for_selector('#loginError',state='visible');assert not page.locator('#adminApp').is_visible();print('PASS cuenta sin permiso rechazada',flush=True)
     else:
      try:
       page.wait_for_selector('#adminApp',state='visible')
       assert page.locator('#mfaEnrollPanel, #mfaChallengePanel').count()==0
       assert not any(path.startswith('/auth/v1/factors') for method,path in requests)
      except Exception:print('DIAGNOSTICO',requests,errors,page.locator('body').inner_text(),flush=True);raise
      page.wait_for_function("document.querySelector('#metricPublished').textContent==='0'")
      assert page.locator('#metricValue').inner_text()=='$0.00'
      page.get_by_role('button',name='+ Nuevo producto',exact=True).click();page.wait_for_selector('#productEditor[open]')
      page.locator('#savePublish').click();page.wait_for_selector('.admin-toast.error');assert not db['products'];assert not errors,errors
      print('PASS formulario incompleto muestra error y no escribe productos',flush=True)
      page.locator('#fName').fill('Producto de prueba local');page.locator('#fBrand').fill('Marca de prueba');page.locator('#fPrice').fill('12.50');page.locator('#fDescription').fill('Solo fixture local, nunca se envía a la base real.')
      assert page.locator('.editor-tabs, #fStatus, #saveDraft').count()==0
      assert page.locator('#imageFiles').is_visible()
      page.locator('#fMaxQuantity').select_option('1')
      assert page.locator('.variant-row').count()==1
      assert page.locator('#imageColor').is_disabled() and page.locator('#uploadImages').is_disabled()
      page.locator('#variantRows .field').filter(has=page.locator('label',has_text='Nombre para el cliente')).locator('input').fill('Blanco')
      assert page.locator('#imageColor').input_value()=='Blanco' and not page.locator('#imageColor').is_disabled()
      for _ in range(3):page.locator('#addVariant').click()
      assert page.locator('.variant-row').count()==4
      assert page.locator('.variant-heading').all_text_contents()==['Variante 1','Variante 2','Variante 3','Variante 4']
      for _ in range(3):page.locator('.variant-row').last.get_by_role('button',name='Eliminar',exact=True).click()
      assert page.locator('.variant-row').count()==1 and page.locator('#imageColor').input_value()=='Blanco'
      assert page.locator('#sessionPill').count()==0
      page.locator('#variantRows .field').filter(has=page.locator('label',has_text='Stock')).locator('input').fill('2')
      page.locator('#variantRows .field').filter(has=page.locator('label',has_text='Costo USD')).locator('input').fill('5')
      page.locator('#addVariant').click()
      page.locator('.variant-row').last.locator('.field').filter(has=page.locator('label',has_text='Nombre para el cliente')).locator('input').fill('Blanco')
      page.locator('#savePublish').click();page.wait_for_function("document.querySelector('#adminToastRegion').textContent.includes('repite color')")
      assert not db['products'];page.locator('.variant-row').last.get_by_role('button',name='Eliminar',exact=True).click()
      from PIL import Image
      photo=Path(td)/'test-photo.png';Image.new('RGB',(1000,1000),'navy').save(photo)
      page.locator('#imageFiles').set_input_files(str(photo));page.locator('#uploadImages').click();page.wait_for_selector('.image-item')
      assert not db['products'] and not any(path.startswith('/storage/') for method,path in requests)
      assert page.locator('#editorPreview img').get_attribute('src').startswith('blob:')
      assert 'bat-cursor-v2.png' in page.locator('#editorTitle').evaluate('(e)=>getComputedStyle(e).cursor')
      assert page.locator('#fName').evaluate('(e)=>getComputedStyle(e).cursor')=='text'
      for width in [320,390,768,1366]:
       page.set_viewport_size({'width':width,'height':900})
       assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
       page.locator('#productEditor').evaluate('(e)=>e.scrollTop=0')
       assert page.locator('#productEditor').evaluate('(e)=>e.scrollWidth<=e.clientWidth+1')
       assert page.locator('.product-editor-section').last.evaluate('(e)=>parseFloat(getComputedStyle(e).paddingLeft)')>=20
       page.screenshot(path=str(ROOT/f'artifacts/panel-editor-unified-{width}.png'),full_page=True)
       page.locator('.product-editor-section').nth(2).evaluate("e=>{const dialog=e.closest('dialog');dialog.scrollTop+=e.getBoundingClientRect().top-dialog.getBoundingClientRect().top-dialog.querySelector('.modal-head').offsetHeight-12}")
       page.screenshot(path=str(ROOT/f'artifacts/panel-fotos-{width}.png'),full_page=True)
      page.locator('#savePublish').click()
      try:page.wait_for_selector('#productEditor',state='hidden',timeout=10000)
      except Exception:print('SAVE DIAGNOSTICO',page.locator('#adminToastRegion').inner_text(),requests,errors,db,flush=True);raise
      assert len(db['products'])==1 and db['products'][0]['status']=='published' and db['products'][0]['max_order_quantity']==1;assert len(db['product_variants'])==1 and len(db['inventory_private'])==1
      assert len(db['product_images'])==1 and len(db['product_colors'])==1
      assert sum(method=='POST' and path.startswith('/storage/') for method,path in requests)==3
      assert page.locator('#metricPublished').inner_text()=='1'
      assert page.locator('#metricValue').inner_text()=='$10.00'
      assert db['product_colors'][0]['name']=='Blanco'
      page.get_by_role('button',name='Productos',exact=True).click();page.get_by_role('button',name='Editar',exact=True).click();page.wait_for_selector('#productEditor[open]')
      assert page.locator('#fMaxQuantity').input_value()=='1';page.locator('#closeEditor').click()
      db['inventory_private'][0]['cost']=None;page.reload();page.wait_for_function("document.querySelector('#metricValue').textContent==='Por calcular'")
      db['products'].append({**db['products'][0],'id':str(uuid.uuid4()),'status':'draft','name':'Otro fixture local'})
      db['inventory_private'][0].update(stock=3,cost=7)
      page.reload();page.wait_for_selector('#adminApp',state='visible');page.wait_for_function("document.querySelector('#metricDrafts').textContent==='1'")
      assert page.locator('#metricPublished').inner_text()=='1' and page.locator('#metricValue').inner_text()=='$21.00'
      with page.expect_download() as download_info:
       page.locator('#adminSidebar').get_by_role('button',name='Importar CSV',exact=True).click();page.locator('#downloadCsvTemplate').click()
      download=download_info.value;csv=Path(download.path()).read_text(encoding='utf-8-sig')
      assert 'code,slug,name,brand,category' in csv and 'Franklin' not in csv and 'Producto de ejemplo' not in csv
      page.locator('#csvFile').set_input_files(str(download.path()));page.wait_for_function("document.querySelector('#csvStatus').textContent.includes('no contiene productos')")
      assert not page.locator('#confirmImport').is_visible()
      for view in ['Dashboard','Productos','Inventario','Categorías','Importar CSV','Historial']:
       page.locator('#adminSidebar').get_by_role('button',name=view,exact=True).click()
       assert 'bat-cursor-v2.png' in page.locator('body').evaluate('(e)=>getComputedStyle(e).cursor')
      page.reload();page.wait_for_selector('#adminApp',state='visible');assert 'bat-cursor-v2.png' in page.locator('body').evaluate('(e)=>getComputedStyle(e).cursor')
      assert not errors,errors
      page.screenshot(path=str(ROOT/'artifacts/panel-dashboard-test.png'),full_page=True)
      print('PASS login con contraseña AAL1, formulario único, color, fotos, cantidad, inventario y publicación (API simulada)',flush=True)
     context.close()
    browser.close()
  finally:server.shutdown();server.server_close();thread.join()
if __name__=='__main__':main()
