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
     db={'products':[],'product_variants':[],'inventory_private':[]};errors=[];requests=[];fail_publish=[True]
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
       if method=='POST' and '/sign/' in path:body={'signedURL':'/object/sign/purchase-invoices/test.png?token=test'}
       elif method=='DELETE':body=[]
       else:
        assert method=='POST';body={'Key':path.rsplit('/',1)[-1]}
      elif path.startswith('/rest/v1/'):
       table=path.rsplit('/',1)[-1]
       if table=='admin_users':rows=[{'user_id':user_id,'role':'owner'}] if authorized else []
       elif table=='categories':rows=[category,{**category,'id':'20000000-0000-4000-8000-000000000002','name':'Guantines','slug':'guantines','variant_mode':'color_size'}]
       else:rows=db.get(table,[])
       from urllib.parse import parse_qs
       query=parse_qs(url.query)
       if method in ['GET','PATCH','DELETE']:
        for key,values in query.items():
         value=values[0]
         if value.startswith('eq.'):rows=[row for row in rows if str(row.get(key)).lower()==value[3:].lower()]
         elif value.startswith('in.('):
          allowed=value[4:-1].split(',');rows=[row for row in rows if str(row.get(key)) in allowed]
       if method=='DELETE':
        ids={row.get('id') for row in rows};variant_ids={v['id'] for v in db.get('product_variants',[]) if v['product_id'] in ids}
        db[table]=[row for row in db.get(table,[]) if row not in rows]
        if table=='products':
         for related in ['product_colors','product_variants','product_images']:db[related]=[row for row in db.get(related,[]) if row['product_id'] not in ids]
         db['inventory_private']=[row for row in db['inventory_private'] if row['variant_id'] not in variant_ids]
        route.fulfill(json=rows);return
       if method=='PATCH' and table=='products' and data.get('status')=='published' and fail_publish[0]:
        fail_publish[0]=False;route.fulfill(status=503,json={'message':'Fallo simulado al publicar: vuelve a intentar.'});return
       if method=='POST':
        rows=data if isinstance(data,list) else [data]
        for row in rows:
         row.setdefault('id',str(uuid.uuid4()));row.setdefault('created_at','2026-11-03T00:00:00Z');row.setdefault('updated_at',row['created_at'])
         if table=='product_variants':row.setdefault('available',False)
        existing=db.setdefault(table,[])
        from urllib.parse import parse_qs
        keys=parse_qs(url.query).get('on_conflict',[''])[0].split(',')
        for row in rows:
         previous=next((old for old in existing if keys!=[''] and all(old.get(key)==row.get(key) for key in keys)),None)
         if previous is None:existing.append(row)
         else:previous.update(row)
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
      page.locator('#savePublish').click();page.wait_for_selector('#publishFeedback',state='visible');assert page.locator('#publishFeedback').evaluate("e=>e.closest('dialog').open && e.contains(document.elementFromPoint(e.getBoundingClientRect().x+10,e.getBoundingClientRect().y+10))");assert not db['products'];assert not errors,errors
      print('PASS formulario incompleto muestra error y no escribe productos',flush=True)
      page.locator('#fName').fill('Producto de prueba local');page.locator('#fBrand').fill('Marca de prueba');page.locator('#fPrice').fill('12.50');page.locator('#fDescription').fill('Solo fixture local, nunca se envía a la base real.')
      assert page.locator('.editor-tabs, #fStatus, #saveDraft').count()==0
      assert page.locator('#imageFiles').is_visible()
      page.locator('#fMaxQuantity').select_option('1')
      page.locator('#fShowOnCover').check()
      assert page.locator('.product-stock-fields').count()==1
      assert page.locator('#imageColor').is_disabled() and page.locator('#uploadImages').is_disabled()
      assert page.locator('#addVariant, .variant-help, .variant-heading, .variant-row').count()==0
      labels=page.locator('#variantRows label').all_text_contents()
      assert labels==['Color','Muestra de color','Stock','Costo USD'],labels
      page.locator('#variantRows .field').filter(has=page.locator('label',has_text='Color')).first.locator('input').fill('Blanco')
      assert page.locator('#imageColor').input_value()=='Blanco' and not page.locator('#imageColor').is_disabled()
      page.locator('#fCategory').select_option('20000000-0000-4000-8000-000000000002')
      assert page.locator('#variantRows label',has_text='Talla').count()==1
      page.locator('#variantRows .field').filter(has=page.locator('label',has_text='Talla')).locator('input').fill('M')
      page.locator('#fCategory').select_option(category_id)
      assert page.locator('#variantRows label',has_text='Talla').count()==0
      assert page.locator('.product-stock-fields').count()==1 and page.locator('#imageColor').input_value()=='Blanco'
      assert page.locator('#sessionPill').count()==0
      page.locator('#variantRows .field').filter(has=page.locator('label',has_text='Stock')).locator('input').fill('2')
      page.locator('#variantRows .field').filter(has=page.locator('label',has_text='Costo USD')).locator('input').fill('5')
      from PIL import Image
      photo=Path(td)/'test-photo.png';Image.new('RGB',(400,400),'navy').save(photo)
      page.locator('#imageFiles').set_input_files(str(photo));page.locator('#uploadImages').click();page.wait_for_selector('.admin-toast.error')
      assert page.locator('#adminToastRegion').evaluate("e=>e.closest('dialog').id==='productEditor'")
      toast=page.locator('.admin-toast.error').last
      assert toast.evaluate("e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}")
      page.locator('#imageFiles').set_input_files([]);Image.new('RGB',(1000,1000),'navy').save(photo)
      page.locator('#imageFiles').set_input_files(str(photo));page.locator('#uploadImages').click();page.wait_for_selector('.image-item')
      assert not db['products'] and not any(path.startswith('/storage/') for method,path in requests)
      assert page.locator('#editorPreview img').get_attribute('src').startswith('blob:')
      assert 'bat-cursor-v4.cur' in page.locator('#editorTitle').evaluate('(e)=>getComputedStyle(e).cursor')
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
      page.set_viewport_size({'width':320,'height':900})
      page.locator('#savePublish').click()
      page.wait_for_function("document.querySelector('#publishFeedback').textContent.includes('Fallo simulado')")
      page.wait_for_selector('#adminLoader',state='hidden')
      assert page.locator('#publishFeedback').evaluate("e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}")
      assert len(db['products'])==1 and len(db['product_variants'])==1
      page.screenshot(path=str(ROOT/'artifacts/panel-error-publicacion-320.png'),full_page=True)
      page.set_viewport_size({'width':1366,'height':900})
      page.locator('#savePublish').click()
      try:page.wait_for_selector('#productEditor',state='hidden',timeout=10000)
      except Exception:print('SAVE DIAGNOSTICO',page.locator('#adminToastRegion').inner_text(),requests,errors,db,flush=True);raise
      assert len(db['products'])==1 and db['products'][0]['status']=='published' and db['products'][0]['max_order_quantity']==1;assert len(db['product_variants'])==1 and len(db['inventory_private'])==1
      assert db['product_variants'][0]['sale_price'] is None
      assert 'provider_sku' not in db['inventory_private'][0] and 'provider_source_url' not in db['inventory_private'][0]
      assert len(db['product_images'])==1 and len(db['product_colors'])==1
      assert sum(method=='POST' and path.startswith('/storage/') for method,path in requests)==3
      assert page.locator('#metricPublished').inner_text()=='1'
      assert page.locator('#metricValue').inner_text()=='$10.00'
      assert db['product_colors'][0]['name']=='Blanco'
      page.get_by_role('button',name='Productos',exact=True).click();page.get_by_role('button',name='Editar',exact=True).click();page.wait_for_selector('#productEditor[open]')
      assert page.locator('#fShowOnCover').is_checked() and db['products'][0]['show_on_cover'] is True
      assert page.locator('#fMaxQuantity').input_value()=='1';page.locator('#closeEditor').click()
      # Compatibilidad: las presentaciones antiguas no se borran al simplificar el editor.
      color2={**db['product_colors'][0],'id':str(uuid.uuid4()),'name':'Negro','display_name':'Negro'}
      variant2={**db['product_variants'][0],'id':str(uuid.uuid4()),'color_id':color2['id'],'sale_price':15}
      db['product_colors'].append(color2);db['product_variants'].append(variant2)
      db['inventory_private'].append({'variant_id':variant2['id'],'stock':0,'cost':None,'provider_sku':'legacy-sku','provider_source_url':'https://supplier.example/item'})
      page.get_by_role('button',name='Editar',exact=True).click();page.wait_for_selector('#productEditor[open]')
      assert page.locator('.color-editor').count()==2
      assert page.locator('.color-editor').last.locator('input[type=text]').first.input_value()=='Negro'
      page.locator('#savePublish').click();page.wait_for_selector('#productEditor',state='hidden')
      assert len(db['product_variants'])==2 and len(db['inventory_private'])==2
      assert db['inventory_private'][1]['provider_sku']=='legacy-sku'
      assert not any(method=='DELETE' for method,path in requests)
      assert all(row['sale_price'] is None for row in db['product_variants'])
      db['inventory_private'][0]['cost']=None;page.reload();page.wait_for_function("document.querySelector('#metricValue').textContent==='Por calcular'")
      db['products'].append({**db['products'][0],'id':str(uuid.uuid4()),'status':'draft','name':'Otro fixture local'})
      db['inventory_private'][0].update(stock=3,cost=7)
      page.reload();page.wait_for_selector('#adminApp',state='visible');page.wait_for_function("document.querySelector('#metricDrafts').textContent==='1'")
      assert page.locator('#metricPublished').inner_text()=='1' and page.locator('#metricValue').inner_text()=='$21.00'
      # Varias tallas por color; detección de tono y foto asociada.
      page.get_by_role('button',name='Productos',exact=True).click();page.get_by_role('button',name='Editar',exact=True).first.click();page.wait_for_selector('#productEditor[open]')
      page.locator('#fCategory').select_option('20000000-0000-4000-8000-000000000002')
      for group in page.locator('.color-editor').all():group.locator('.size-stock-row input[type=text]').fill('M')
      page.locator('.color-editor').first.get_by_role('button',name='Agregar talla',exact=True).click()
      page.locator('.color-editor').first.locator('.size-stock-row').last.locator('input[type=text]').fill('L')
      page.locator('#addProductColor').click();group=page.locator('.color-editor').last
      group.locator('.product-stock-fields input[type=text]').fill('Azul')
      assert group.locator('input[type=color]').input_value()=='#2563eb'
      group.locator('input[type=color]').fill('#123abc');assert group.locator('input[type=color]').input_value()=='#123abc'
      group.locator('.size-stock-row input[type=text]').fill('S')
      group.locator('.size-stock-row .field').filter(has=page.locator('label',has_text='Stock')).locator('input').fill('2')
      page.locator('#imageColor').select_option('Azul');page.locator('#imageFiles').set_input_files(str(photo));page.locator('#uploadImages').click();page.wait_for_function("document.querySelectorAll('.image-item').length===2")
      page.locator('#savePublish').click();page.wait_for_selector('#productEditor',state='hidden')
      assert len(db['product_variants'])==4 and len(db['product_colors'])==3
      # Duplicar conserva todos los datos de negocio, salvo identidades y URL únicas.
      original=db['products'][0].copy();page.get_by_role('button',name='Duplicar',exact=True).first.click()
      page.wait_for_function("document.querySelectorAll('#productList .product-row').length===3")
      duplicate=db['products'][-1]
      assert duplicate['name']==original['name'] and duplicate['code']!=original['code'] and duplicate['slug']!=original['slug']
      for table in ['product_colors','product_variants','product_images']:
       assert len([row for row in db[table] if row['product_id']==duplicate['id']])==len([row for row in db[table] if row['product_id']==original['id']])
      assert duplicate['max_order_quantity']==original['max_order_quantity'] and duplicate['status']==original['status'] and duplicate['show_on_cover']==original['show_on_cover']
      def stock_signature(product_id):
       return sorted((next(c['name'] for c in db['product_colors'] if c['id']==v['color_id']),v.get('size_label') or '',next(i['stock'] for i in db['inventory_private'] if i['variant_id']==v['id']),next(i.get('cost') for i in db['inventory_private'] if i['variant_id']==v['id'])) for v in db['product_variants'] if v['product_id']==product_id)
      assert stock_signature(duplicate['id'])==stock_signature(original['id'])
      original_photos={r['storage_path'] for r in db['product_images'] if r['product_id']==original['id']}
      assert original_photos=={r['storage_path'] for r in db['product_images'] if r['product_id']==duplicate['id']}
      assert page.locator('.product-row-info').first.evaluate("(info)=>{const [name,meta,state]=info.children;return name.offsetTop<meta.offsetTop&&meta.offsetTop<state.offsetTop}")
      page.locator('#adminSidebar').get_by_role('button',name='Categorías',exact=True).click()
      assert page.locator('.category-row-info').first.evaluate("(info)=>info.children[0].offsetTop<info.children[1].offsetTop")
      assert all(mode not in page.locator('#categoryList').inner_text() for mode in ['color_only','color_size','single','size_only'])
      assert page.locator('.category-order').first.bounding_box()['height']>=44
      page.locator('#adminSidebar').get_by_role('button',name='Productos',exact=True).click()
      # Selección real, cancelar y confirmar eliminación individual y múltiple.
      page.locator('#productList input[type=checkbox]').first.check();assert page.locator('#selectedCount').inner_text()=='1 seleccionados'
      page.get_by_role('button',name='Eliminar',exact=True).last.click();page.get_by_role('button',name='Cancelar',exact=True).click();assert len(db['products'])==3
      page.get_by_role('button',name='Eliminar',exact=True).last.click();page.locator('#confirmAccept').click();page.wait_for_function("document.querySelectorAll('#productList .product-row').length===2")
      page.locator('#selectAllProducts').check();assert page.locator('#selectedCount').inner_text()=='2 seleccionados'
      page.locator('#deleteSelectedProducts').click();page.locator('#confirmAccept').click();page.wait_for_function("document.querySelectorAll('#productList .product-row').length===0")
      assert not db['products'] and not db['product_variants']
      assert not any(method=='DELETE' and '/product-images' in path for method,path in requests)
      # Facturas privadas: imagen, número y nombre, persistencia tras recargar.
      page.locator('#adminSidebar').get_by_role('button',name='Facturas',exact=True).click()
      assert page.get_by_text('Importar CSV',exact=True).count()==0
      for width in [320,390]:
       page.set_viewport_size({'width':width,'height':800})
       assert page.locator('#pickInvoiceFile').is_visible()
       assert page.locator('#pickInvoiceFile').inner_text()=='Seleccionar archivo'
       assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
      page.set_viewport_size({'width':1366,'height':900})
      page.locator('#invoiceName').fill('Compra de prueba');page.locator('#invoiceNumber').fill('LOCAL-001');page.locator('#invoiceFile').set_input_files(str(photo));page.locator('#saveInvoice').click()
      page.wait_for_selector('.invoice-card');assert len(db['purchase_invoices'])==1
      assert db['purchase_invoices'][0]['name']=='Compra de prueba' and db['purchase_invoices'][0]['invoice_number']=='LOCAL-001'
      assert '/object/sign/purchase-invoices/' in page.locator('.invoice-card a').get_attribute('href')
      page.reload();page.wait_for_selector('#adminApp',state='visible');page.locator('#adminSidebar').get_by_role('button',name='Facturas',exact=True).click();page.wait_for_selector('.invoice-card')
      for view in ['Dashboard','Productos','Inventario','Categorías','Facturas','Historial']:
       page.locator('#adminSidebar').get_by_role('button',name=view,exact=True).click()
       assert 'bat-cursor-v4.cur' in page.locator('body').evaluate('(e)=>getComputedStyle(e).cursor')
      page.reload();page.wait_for_selector('#adminApp',state='visible');assert 'bat-cursor-v4.cur' in page.locator('body').evaluate('(e)=>getComputedStyle(e).cursor')
      assert not errors,errors
      page.screenshot(path=str(ROOT/'artifacts/panel-dashboard-test.png'),full_page=True)
      print('PASS panel: colores/tallas/fotos, tono automático, publicación y reintento, duplicación completa, selección, eliminación individual/múltiple y facturas privadas (API simulada)',flush=True)
     context.close()
    browser.close()
  finally:server.shutdown();server.server_close();thread.join()
if __name__=='__main__':main()
