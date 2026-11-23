"""Smoke real en Chromium/Chrome con RPC HTTP interceptadas y capturas reproducibles."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import copy,json,os,subprocess,sys,tempfile,threading,time
sys.stdout.reconfigure(encoding='utf-8',errors='replace')
from urllib.parse import urlparse
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'artifacts/screenshots';WIDTHS=[320,360,390,412,768,1024,1366,1920]
def uuid(n):return f'00000000-0000-4000-8000-{n:012d}'
CATEGORIES=[dict(id=uuid(i),slug=slug,name=name,searchKeywords=words,attributes=[],variantMode='single',showOnHome=True,homeLimit=8) for i,slug,name,words in [(1,'guantines','Guantines',['guante','guantes','guantines']),(2,'pelotas','Pelotas',['pelota','softball']),(3,'eyeblack','Eye Black',['antireflejo'])]]
PRODUCTS=[dict(id=uuid(10+i),slug=slug,name=name,brand='Franklin',description=description,price=price,category=CATEGORIES[i],attributes={},colors=[],variants=[dict(id=uuid(20+i),available=True,normalizedSize='ONE',sizeLabel=None,salePrice=None)],images=[dict(storagePath='/assets/images/logo.webp',alt=name,width=1000,height=1000)],featured=i==0) for i,slug,name,description,price in [(0,'guante-franklin','Franklin Youth CFX Pro','Guante de bateo negro',29.99),(1,'pelota-softball','Pelota de softball','Pelota amarilla',10),(2,'eye-black','Eye Black','Antireflejo',None)]]
CATALOG=dict(categories=CATEGORIES,products=[{**{k:v for k,v in p.items() if k!='category'},'category_id':p['category']['id']} for p in PRODUCTS])
ITEM=dict(variantId=uuid(20),slug=PRODUCTS[0]['slug'],name=PRODUCTS[0]['name'],options=[dict(label='Color',value='Negro')],price=29.99,image='/assets/images/logo.webp',qty=2)
checks=[]
def check(name,ok,detail=''):
 checks.append(bool(ok));print(('PASS' if ok else 'FAIL'),name,detail if not ok else '',flush=True)
def main():
 from playwright.sync_api import sync_playwright
 OUT.mkdir(parents=True,exist_ok=True)
 with tempfile.TemporaryDirectory(prefix='browser_',dir=ROOT/'artifacts') as td:
  env=os.environ.copy();env.update(SUPABASE_URL='https://mock.supabase.co',SUPABASE_ANON_KEY='mock-public-key',SKIP_SITEMAP_API='1',BS_OUTPUT_DIR=Path(td).relative_to(ROOT).as_posix()+'/store',SITE_URL='http://localhost:8080');env.pop('CF_PAGES_BRANCH',None);env.pop('CF_PAGES_URL',None)
  subprocess.run(['node','build.mjs'],cwd=ROOT,env=env,check=True)
  class Handler(SimpleHTTPRequestHandler):
   protocol_version='HTTP/1.1'
   def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(Path(td)/'store'),**kwargs)
   def do_GET(self):
    if urlparse(self.path).path.startswith('/producto/'):self.path='/producto/index.html'
    return super().do_GET()
   def log_message(self,*_):pass
  class Server(ThreadingHTTPServer):request_queue_size=128
  server=Server(('127.0.0.1',0),Handler);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start();origin=f'http://127.0.0.1:{server.server_port}'
  panel_dir=Path(td)/'panel'
  panel_env={**env,'BS_PANEL_OUTPUT_DIR':panel_dir.relative_to(ROOT).as_posix(),'PANEL_URL':'http://localhost:8081','STOREFRONT_URL':origin}
  subprocess.run(['node','build-panel.mjs'],cwd=ROOT,env=panel_env,check=True)
  for output in [Path(td)/'store',panel_dir]:
   check(f'{output.name} _headers y JS en LF',all(b'\r\n' not in path.read_bytes() for path in [output/'_headers',*output.rglob('*.js')]))
  class PanelHandler(SimpleHTTPRequestHandler):
   protocol_version='HTTP/1.1'
   def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(panel_dir),**kwargs)
   def log_message(self,*args):pass
  panel_server=Server(('127.0.0.1',0),PanelHandler);panel_thread=threading.Thread(target=panel_server.serve_forever,daemon=True);panel_thread.start();panel_origin=f'http://127.0.0.1:{panel_server.server_port}'
  state={'mode':'ok','price':29.99,'available':True,'calls':0,'limit':99,'stock':99}
  def route_rpc(route):
   state['calls']+=1;name=route.request.url.rsplit('/',1)[-1];args=route.request.post_data_json or {};data=None
   if state['mode']=='error':route.abort('namenotresolved');return
   if name=='get_public_catalog':data={'categories':[],'products':[]} if state['mode']=='empty' else CATALOG
   elif name=='get_public_product':
    found=next((p for p in PRODUCTS if p['slug']==args['p_slug']),None);data={**found,'maxQuantity':state['limit'],'variants':[{**variant,'maxAvailableQuantity':state['stock']} for variant in found['variants']]} if found else None
   elif name=='get_related_products':data=[p for p in PRODUCTS if p['id']!=args['p_product_id']]
   elif name=='get_public_cart_state':data=[dict(variantId=uuid(20),productId=PRODUCTS[0]['id'],maxQuantity=state['limit'],maxAvailableQuantity=state['stock'],slug=ITEM['slug'],name=ITEM['name'],available=state['available'],price=state['price'],options=ITEM['options'],imagePath=ITEM['image'])] if uuid(20) in args['p_variant_ids'] else []
   if name=='get_public_cart_state':
    for color in PRODUCTS[0].get('colors',[]):
     for variant in color['variants']:
      if variant['id'] in args['p_variant_ids']:data.append(dict(variantId=variant['id'],productId=PRODUCTS[0]['id'],maxQuantity=state['limit'],slug=PRODUCTS[0]['slug'],name=PRODUCTS[0]['name'],available=variant['available'],maxAvailableQuantity=variant['maxAvailableQuantity'],price=state['price'],options=[dict(label='Color',value=color['label']),dict(label='Talla',value=variant['sizeLabel'])],imagePath=color['images'][0]['storagePath']))
   route.fulfill(json=data,headers={'Access-Control-Allow-Origin':'*'})
  def inspect(page,label):
   result=page.evaluate('''()=>{const visible=e=>!!(e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'&&e.closest('[aria-hidden="true"]')===null);return {
     overflow:document.documentElement.scrollWidth>innerWidth+1,
     smallButtons:[...document.querySelectorAll('button,summary')].filter(visible).filter(e=>{const r=e.getBoundingClientRect();return r.height<40||r.width<40}).map(e=>e.outerHTML.slice(0,100)),
     smallText:[...document.querySelectorAll('body *')].filter(visible).filter(e=>[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())&&parseFloat(getComputedStyle(e).fontSize)<12).map(e=>e.outerHTML.slice(0,100)),
     favorites:[...document.querySelectorAll('.card-favorite')].filter(visible).map(e=>e.getBoundingClientRect().width)
   }}''')
   check(label+' cursor cargado','bat-cursor-v4.png' in page.locator('body').evaluate('(e)=>getComputedStyle(e).cursor'))
   check(label+' sin overflow',not result['overflow'])
   check(label+' tactiles >=40',not result['smallButtons'],str(result['smallButtons']))
   check(label+' texto >=12',not result['smallText'],str(result['smallText']))
   check(label+' favoritos <=48',all(40<=n<=48 for n in result['favorites']))
  def shot(page,width,name):
   if width in [320,390,768,1366]:page.screenshot(path=str(OUT/f'{name}-{width}.png'),full_page=True)
  try:
   with sync_playwright() as pw:
    executable=os.environ.get('PLAYWRIGHT_EXECUTABLE_PATH')
    browser=pw.chromium.launch(executable_path=executable) if executable else pw.chromium.launch(channel='chrome')
    for width in WIDTHS:
     context=browser.new_context(viewport={'width':width,'height':900});context.route('https://mock.supabase.co/rest/v1/rpc/*',route_rpc);page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda msg:print('CONSOLE',msg.text,flush=True) if msg.type=='error' else None)
     for name,path,selector in [('home','/','.product-card'),('catalogo','/catalogo.html','.product-card'),('ficha','/producto/guante-franklin/','#productName')]:
      page.goto(origin+path)
      try:page.wait_for_selector(selector)
      except Exception:
       page.screenshot(path=str(OUT/'failure.png'),full_page=True);print('DIAGNOSTICO',width,name,errors,page.locator('body').inner_text(),flush=True);raise
      inspect(page,f'{width} {name}');shot(page,width,name)
     page.evaluate('(item)=>{BattingCart.write([item]);BattingUI.openDrawer("#cartDrawer");return BattingCart.render({revalidate:true})}',ITEM)
     inspect(page,f'{width} carrito');shot(page,width,'carrito')
     tops=page.locator('.cart-item-info').evaluate('(e)=>[...e.children].map(n=>n.getBoundingClientRect().top)');check(f'{width} carrito tres lineas',len(tops)==3 and tops[0]<tops[1]<tops[2])
     href=page.locator('#cartWhatsapp').get_attribute('href');check(f'{width} enlace WhatsApp real',href.startswith('https://wa.me/') and not page.locator('#cartWhatsapp').get_attribute('target'))
     page.evaluate('BattingUI.closeDrawer("#cartDrawer");BattingFavorites.save(["guante-franklin"])');page.goto(origin+'/favoritos.html');page.wait_for_selector('.product-card');inspect(page,f'{width} favoritos');shot(page,width,'favoritos')
     page.evaluate('async()=>{await BattingUI.renderCategorySheet();BattingUI.openDrawer("#categorySheet")}');inspect(page,f'{width} categorias');shot(page,width,'categorias');page.keyboard.press('Escape')
     matches=page.evaluate('async()=>{const b=await BattingData.loadCatalogBundle();return b.products.filter(p=>BattingData.matchesSearch(p,"guante")).map(p=>p.category.slug)}');check(f'{width} guante solo guantines',matches==['guantines'],str(matches));check(f'{width} sin errores JS',not errors,str(errors));context.close()
    # Recommendations must use the catalogue sizing and overflow only inside their row.
    for width,touch in [(390,True),(768,True),(1366,False)]:
     context=browser.new_context(viewport={'width':width,'height':900},has_touch=touch)
     context.route('https://mock.supabase.co/rest/v1/rpc/*',route_rpc)
     context.route('**/rpc/get_related_products',lambda route:route.fulfill(json=[{**PRODUCTS[1],'slug':f'recomendado-{i}','name':f'Recomendado {i}'} for i in range(8)]))
     page=context.new_page()
     page.goto(origin+'/producto/guante-franklin/')
     page.wait_for_selector('#relatedGrid .product-card')
     card_width=page.locator('#relatedGrid .product-card').first.bounding_box()['width']
     grid_width=page.locator('#relatedGrid').bounding_box()['width']
     check(f'{width} recomendados compactos',card_width<=min(224,grid_width/(4 if width>=1180 else 3 if width>=760 else 2)))
     check(f'{width} sin desborde de página',page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
     check(f'{width} flechas según dispositivo',page.locator('#relatedNext').is_visible()==(not touch))
     if touch:page.locator('#relatedGrid').evaluate('(grid)=>{grid.scrollLeft=grid.scrollWidth}')
     else:page.locator('#relatedNext').click()
     page.wait_for_function("document.querySelector('#relatedGrid').scrollLeft>0")
     if width==390:
      state['available']=False
      page.evaluate('(item)=>{BattingCart.write([item]);BattingUI.openDrawer("#cartDrawer");return BattingCart.render({revalidate:true})}',ITEM)
      check('Carrito vacío conserva aviso de agotado',page.locator('#cartNotice').is_visible() and 'se agotó' in page.locator('#cartNotice').inner_text() and page.locator('#cartItems .empty-state').is_visible())
      state['available']=True
      page.goto(origin+'/favoritos.html')
      check('Favoritos vacío ocupa todo el ancho',abs(page.locator('#favoritesGrid .coming-soon').bounding_box()['width']-page.locator('#favoritesGrid').bounding_box()['width'])<1)
      check('Búsqueda acepta plurales y guantines',page.evaluate("""()=>['guante','guantes','guantin','guantines'].every(q=>BattingData.matchesSearch({name:'CFX Pro',category:{slug:'guantines',searchKeywords:[]}},q)) && BattingData.matchesSearch({name:'Protector'},'protectores') && !BattingData.matchesSearch({name:'Pelota'},'guantes')"""))
     context.close()
    # Guías de las cuatro marcas: tablas visibles, sin avisos ni enlaces externos.
    context=browser.new_context();context.route('https://mock.supabase.co/rest/v1/rpc/*',route_rpc);page=context.new_page()
    for width in [320,390,768,1366]:
     page.set_viewport_size({'width':width,'height':900});page.goto(origin+'/tallas.html?marca=Louisville');page.wait_for_selector('.size-table')
     for brand in ['Franklin','Nike','Under Armour','Louisville','Adidas']:
      page.get_by_role('button',name=brand,exact=True).click()
      check(f'{width} tabla {brand}',page.locator('.size-table tbody tr').count()>0)
      check(f'{width} {brand} sin avisos ni fuentes externas',page.locator('.guide-note, #guideContent a').count()==0)
      inspect(page,f'{width} tallas {brand}')
     page.get_by_role('button',name='Louisville',exact=True).click()
     check(f'{width} Louisville modelo identificado','TPX Pro' in page.locator('#guideContent').inner_text() and page.locator('.size-table tbody tr').count()==10)
     page.get_by_role('button',name='Louisville',exact=True).click()
     shot(page,width,'tallas-louisville')
     page.get_by_role('button',name='Adidas',exact=True).click();check(f'{width} Adidas Adizero tallas confirmadas','Adizero' in page.locator('#guideContent').inner_text() and page.locator('.size-table tbody tr').count()==6);shot(page,width,'tallas-adidas')
    context.close()
    context=browser.new_context();context.route('https://mock.supabase.co/rest/v1/rpc/*',route_rpc);page=context.new_page()
    page.goto(origin+'/producto/guante-franklin/');page.wait_for_selector('#productQuantity')
    page.locator('#productQuantity').fill('3');page.locator('#addOrder').click();page.wait_for_selector('.cart-item')
    page.wait_for_timeout(150);check('Ficha agrega tres unidades',page.evaluate('BattingCart.read()[0].qty')==3)
    check('WhatsApp incluye tres unidades','%C3%97%203' in page.locator('#cartWhatsapp').get_attribute('href'))
    check('Cursor de bate fuera de campos','bat-cursor-v4.png' in page.locator('#productName').evaluate('(e)=>getComputedStyle(e).cursor'))
    check('Cursor de escritura solo en campo',page.locator('#productQuantity').evaluate('(e)=>getComputedStyle(e).cursor')=='text')
    state['limit']=1;context.close();context=browser.new_context();context.route('https://mock.supabase.co/rest/v1/rpc/*',route_rpc);page=context.new_page()
    page.goto(origin+'/producto/guante-franklin/');page.wait_for_selector('#productQuantity');check('Producto de una unidad bloquea +',page.locator('#quantityPlus').is_disabled())
    page.locator('#productQuantity').fill('9');page.locator('#addOrder').click();page.wait_for_selector('.cart-item');page.wait_for_timeout(150)
    check('Limite de una unidad en ficha y carrito',page.evaluate('BattingCart.read()[0].qty')==1 and page.locator('.qty-control button').last.is_disabled())
    count=page.evaluate("()=>{const one=BattingCart.read()[0];BattingCart.write([one,{...one,variantId:'00000000-0000-4000-8000-000000000099'}]);return BattingCart.read().reduce((n,i)=>n+i.qty,0)}")
    check('Limite se comparte entre variantes del producto',count==1)
    state['limit']=99;context.close()
    context=browser.new_context(viewport={'width':390,'height':900});context.route('https://mock.supabase.co/rest/v1/rpc/*',route_rpc);page=context.new_page()
    for path in ['/','/catalogo.html','/favoritos.html','/tallas.html','/producto/guante-franklin/']:
     page.goto(origin+path,wait_until='networkidle')
     for phase in ['navegacion','recarga']:
      if phase=='recarga':page.reload(wait_until='networkidle')
      check(f'Cursor {phase} {path}','bat-cursor-v4.png' in page.locator('body').evaluate('(e)=>getComputedStyle(e).cursor'))
    cursor=page.evaluate("""async()=>{const response=await fetch('/assets/icons/bat-cursor-v4.png');const image=await createImageBitmap(await response.blob());const canvas=document.createElement('canvas');canvas.width=canvas.height=48;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);return {ok:response.ok,width:image.width,height:image.height,corner:ctx.getImageData(0,0,1,1).data[3],middle:ctx.getImageData(24,24,1,1).data[3]}}""")
    check('Cursor PNG 48px transparente',cursor['ok'] and cursor['width']==48 and cursor['height']==48 and cursor['corner']==0 and cursor['middle']>0)
    context.close()
    # Producto -> color -> tallas; cada color muestra exclusivamente sus fotos.
    original_product=copy.deepcopy(PRODUCTS[0])
    colors=[]
    for index,(name,hexcode,sizes) in enumerate([('Azul','#2563eb',[('M',True),('L',False)]),('Rojo','#dc2626',[('S',True),('M',True)]),('Negro','#111111',[('M',False)])]):
     colors.append(dict(id=uuid(70+index),name=name,label=name,hex=hexcode,images=[dict(storagePath=f'/assets/images/logo.webp?color={name}&foto={photo}',alt=f'{name} {photo}',width=3000,height=3000) for photo in [1,2]],variants=[dict(id=uuid(80+index*3+j),available=available,maxAvailableQuantity=(2 if available else 0),sizeLabel=size,normalizedSize=size) for j,(size,available) in enumerate(sizes)]))
    PRODUCTS[0]['colors']=colors;PRODUCTS[0]['variants']=[];PRODUCTS[0]['brand']='Adidas'
    long_name='Franklin Youth CFX Pro edición especial con protección adicional para bateo'
    hover_catalog={**CATALOG,'products':[{**CATALOG['products'][0],'name':long_name,'price':1234567.89,'colors':colors,'variants':[]},*CATALOG['products'][1:]]}
    context=browser.new_context(viewport={'width':1024,'height':900});page=context.new_page()
    context.route('**/rpc/get_public_catalog',lambda route:route.fulfill(json=hover_catalog,headers={'Access-Control-Allow-Origin':'*'}))
    page.goto(origin+'/catalogo.html');card=page.locator('.product-card').filter(has=page.locator('.product-card-link[href*="guante-franklin"]'))
    card.wait_for();photo=card.locator('.card-image img');cover_src=photo.get_attribute('src')
    check('Catálogo de escritorio usa tres tarjetas con foto enmarcada',page.locator('#catalogGrid').evaluate("grid=>getComputedStyle(grid).gridTemplateColumns.split(' ').length===3") and photo.evaluate("img=>parseFloat(getComputedStyle(img.parentElement).borderRadius)>0"))
    page.screenshot(path=str(OUT/'catalogo-tarjetas-1024.png'),full_page=True)
    card.hover();page.wait_for_function("document.querySelector('.card-image img[src*=\"color=Rojo\"]')",timeout=5000)
    page.wait_for_function("document.querySelector('.card-image img[src*=\"color=Negro\"]')",timeout=5000)
    check('Vista previa pasa por los colores con una foto por variante','foto=1' in photo.get_attribute('src') and 'color=Azul' in cover_src)
    page.mouse.move(1,1)
    check('Al salir de la tarjeta se recupera la foto original',photo.get_attribute('src')==cover_src)
    page.emulate_media(reduced_motion='reduce');card.hover(force=True);page.wait_for_timeout(900)
    check('Vista previa respeta movimiento reducido',photo.get_attribute('src')==cover_src)
    page.set_viewport_size({'width':320,'height':900});title=card.locator('.card-title');price=card.locator('.price')
    check('Nombre largo completo en móvil',title.inner_text()==long_name and title.evaluate('e=>e.scrollHeight<=e.clientHeight+1'))
    check('Precio completo dentro de la tarjeta móvil',price.inner_text()=='$1,234,567.89' and price.evaluate('e=>e.scrollWidth<=e.clientWidth+1'))
    page.set_viewport_size({'width':1264,'height':544});page.goto(origin+'/');page.wait_for_selector('.home-category-section .price')
    check('Barra fija deja ver el encabezado y el precio al llegar a la sección',page.evaluate("""()=>{
      const section=document.querySelector('.home-category-section');
      section.scrollIntoView({block:'start'});
      const header=document.querySelector('.site-header').getBoundingClientRect();
      const heading=section.querySelector('.section-head').getBoundingClientRect();
      const price=section.querySelector('.price').getBoundingClientRect();
      return heading.top>=header.bottom && price.bottom<=innerHeight;
    }"""))
    context.close()
    context=browser.new_context(viewport={'width':390,'height':900});context.route('https://mock.supabase.co/rest/v1/rpc/*',route_rpc);page=context.new_page();page.goto(origin+'/producto/guante-franklin/');page.wait_for_selector('#colorOptions button')
    check('Galería inicial azul y dos fotos','color=Azul' in page.locator('#mainProductImage').get_attribute('src') and page.locator('#thumbs button').count()==2)
    page.wait_for_selector('#productSizeGuide .size-table')
    check('Guía de la marca en la ficha','Adidas' in page.locator('#productGuideTitle').inner_text() and 'Adizero' in page.locator('#productGuideContent').inner_text())
    check('Descripción visible sin desplegable',page.locator('#productDescription').is_visible() and page.locator('#productDescription').locator('xpath=ancestor::details').count()==0)
    check('Sin envíos y pagos en la ficha',page.get_by_text('Envíos y pagos',exact=True).count()==0)
    check('Talla sin stock deshabilitada',page.locator('#sizeOptions').get_by_role('button',name='L agotado',exact=True).is_disabled())
    page.locator('#colorOptions').get_by_role('button',name='Rojo disponible',exact=True).click()
    check('Cambiar color cambia fotos y conserva talla M','color=Rojo' in page.locator('#mainProductImage').get_attribute('src') and page.locator('#sizeOptions .active').inner_text()=='M')
    page.locator('#thumbs button').last.click();check('Segunda foto del color seleccionado','foto=2' in page.locator('#mainProductImage').get_attribute('src'))
    page.locator('#productQuantity').fill('17')
    check('Ficha limita a dos unidades de la combinación',page.locator('#productQuantity').get_attribute('max')=='2')
    page.locator('#addOrder').click();page.wait_for_selector('.cart-item')
    check('Carrito limita al stock y bloquea sumar',page.evaluate('BattingCart.read()[0].qty')==2 and page.locator('.cart-item .qty-control button').last.is_disabled())
    check('Carrito conserva color y talla',page.evaluate("()=>{const item=BattingCart.read()[0];return item.options.some(o=>o.value==='Rojo')&&item.options.some(o=>o.value==='M')&&item.image.includes('color=Rojo')}") )
    page.locator('[data-close-cart]').click()
    page.locator('#colorOptions').get_by_role('button',name='Negro agotado',exact=True).click();check('Color agotado permite ver fotos sin comprar','color=Negro' in page.locator('#mainProductImage').get_attribute('src') and page.locator('#addOrder').is_disabled())
    page.screenshot(path=str(OUT/'ficha-colores-390.png'),full_page=True);context.close();PRODUCTS[0]=original_product
    # Una marca con guía de guantines también puede vender medias con talla.
    socks={**original_product,'slug':'medias-nike','name':'Medias Nike','brand':'Nike',
      'category':{'id':uuid(4),'slug':'medias','name':'Medias deportivas'},
      'variants':[{'id':uuid(90),'available':True,'sizeLabel':'M','normalizedSize':'M'}]}
    context=browser.new_context(viewport={'width':390,'height':900});context.route('https://mock.supabase.co/rest/v1/rpc/*',route_rpc)
    context.route('**/rpc/get_public_product',lambda route:route.fulfill(json=socks,headers={'Access-Control-Allow-Origin':'*'}))
    page=context.new_page();guide_requests=[]
    page.on('request',lambda request:guide_requests.append(request.url) if request.url.endswith('/data/size-guides.json') else None)
    page.goto(origin+'/producto/medias-nike/');page.wait_for_selector('#relatedGrid .product-card')
    check('Medias Nike muestran talla M sin cargar la guía de guantines',page.locator('#sizeOptions').get_by_role('button',name='M disponible',exact=True).is_visible() and page.locator('#productSizeGuide').is_hidden() and not guide_requests)
    context.close()
    # Un descenso de stock reduce el pedido y conserva la validación.
    state['stock']=3
    context=browser.new_context(viewport={'width':390,'height':900});context.route('https://mock.supabase.co/rest/v1/rpc/*',route_rpc);page=context.new_page();page.goto(origin+'/producto/guante-franklin/')
    page.wait_for_selector('#productQuantity')
    check('Ficha sin tallas oculta guía y selector',not page.locator('#productSizeGuide').is_visible() and not page.locator('#sizeOptionWrap').is_visible())
    page.locator('#productQuantity').fill('3');page.locator('#addOrder').click();page.wait_for_selector('.cart-item')
    state['stock']=1
    page.evaluate('BattingCart.render({revalidate:true})')
    check('Revalidación reduce cantidad al nuevo stock',page.evaluate('BattingCart.read()[0].qty')==1)
    state['stock']=99;context.close()
    # Rotación, enlaces y reutilización del catálogo de la sesión.
    CATALOG['products'][0]['showOnCover']=True;CATALOG['products'][1]['showOnCover']=True
    context=browser.new_context(viewport={'width':1366,'height':900});context.route('https://mock.supabase.co/rest/v1/rpc/*',route_rpc);page=context.new_page()
    page.goto(origin+'/');page.wait_for_selector('#heroVisual .cover-float');cover=page.locator('#heroVisual .cover-float')
    first=cover.get_attribute('href');page.wait_for_function("(first)=>document.querySelector('.cover-float').getAttribute('href')!==first",arg=first,timeout=5000)
    check('Portada rota a otro producto cada 3 segundos',cover.get_attribute('href')=='/producto/pelota-softball/')
    check('Portada flotante visible en escritorio',cover.is_visible() and cover.evaluate('(e)=>getComputedStyle(e).animationName')=='cover-hover')
    check('Portada sin botón de pausa',page.locator('.cover-control').count()==0)
    # La tarjeta flota continuamente: hacer clic sin esperar a que la animación se detenga.
    calls=state['calls'];cover.click(force=True);page.wait_for_selector('#addOrder')
    check('Portada abre el producto mostrado','/producto/pelota-softball/' in page.url)
    check('Ficha reutiliza catálogo sin llamadas RPC adicionales',state['calls']==calls)
    context.close()
    for row in CATALOG['products']:row.pop('showOnCover',None)
    # Estados y tiempos del loader sin tocar dependencias ni fuentes.
    context=browser.new_context(viewport={'width':390,'height':900});context.route('https://mock.supabase.co/rest/v1/rpc/*',route_rpc);page=context.new_page();page.goto(origin+'/');page.wait_for_selector('.product-card')
    page.wait_for_selector('#globalLoader',state='hidden')
    timing=page.evaluate("""async()=>{
      const root=document.querySelector('#globalLoader'),start=performance.now();let shown=null,leaving=null,earlyHidden=false,logo=false;
      const observer=new MutationObserver(()=>{if(!root.hidden&&shown===null){shown=performance.now();logo=!!root.querySelector('.loader-logo')?.checkVisibility()}if(root.classList.contains('leaving')&&leaving===null)leaving=performance.now()});
      observer.observe(root,{attributes:true,attributeFilter:['hidden','class']});
      const early=setTimeout(()=>earlyHidden=root.hidden,200);
      await BattingUI.withLoader(new Promise(resolve=>setTimeout(resolve,500)));
      clearTimeout(early);observer.disconnect();
      return {earlyHidden,delay:shown-start,minimum:leaving-shown,logo,hidden:root.hidden,ball:parseFloat(getComputedStyle(document.querySelector('.softball-track img')).width)};
    }""")
    check('Loader oculto antes de 350ms',timing['earlyHidden'] and timing['delay']>=349)
    check('Loader visible y logo',timing['logo'])
    check('Pelota 56px',timing['ball']==56)
    check('Loader minimo 400ms',timing['minimum']>=399,str(timing))
    check('Loader termina',timing['hidden'])
    page.evaluate('window.stalled=BattingUI.withLoader(new Promise(()=>{})).catch(()=>{})');page.wait_for_timeout(12100);check('Loader timeout con WhatsApp',page.locator('#loaderError').is_visible() and page.locator('#loaderError a').get_attribute('href').startswith('https://wa.me/'))
    context.close()
    context=browser.new_context();page=context.new_page()
    pending_catalog=[]
    page.route('**/rpc/get_public_catalog',lambda route:pending_catalog.append(route))
    page.goto(origin+'/',wait_until='domcontentloaded')
    page.wait_for_selector('#globalLoader')
    page.wait_for_function('performance.getEntriesByType("resource").some(entry=>entry.name.endsWith("/assets/icons/softball.svg"))')
    check('Inicio mantiene el cargador mientras espera el catálogo',page.locator('#loaderState').is_visible() and page.locator('#homeCategorySections .product-card').count()==0)
    pending_catalog[0].fulfill(json=CATALOG,headers={'Access-Control-Allow-Origin':'*'})
    page.wait_for_selector('#globalLoader',state='hidden')
    check('Inicio revela la tienda con productos y búsqueda disponibles',page.locator('#homeCategorySections .product-card').count()>0 and page.locator('#homeSearch').is_enabled())
    context.close()
    for mode in ['empty','error']:
     state['mode']=mode;context=browser.new_context();context.route('https://mock.supabase.co/rest/v1/rpc/*',route_rpc);page=context.new_page();page.goto(origin+'/')
     page.wait_for_selector('#homeCategorySections .coming-soon-home' if mode=='empty' else '#homeCatalogStatus .coming-soon-home')
     text=page.locator('#main').inner_text();check(f'Estado {mode}',('PRÓXIMAMENTE' in text) if mode=='empty' else ('PRÓXIMAMENTE' not in text and 'Reintentar' in text))
     if mode=='empty':
      for width in WIDTHS:
       page.set_viewport_size({'width':width,'height':900});inspect(page,f'{width} inicio vacio');shot(page,width,'home-empty')
     else:
      check('Inicio sin DNS conserva portada, guía y contacto',all(page.locator(selector).is_visible() for selector in ['#heroVisual .hero-brand','#main .size-guide-card','#contacto']))
      check('Fallo de catálogo muestra ayuda sin bloquear el inicio',page.locator('#globalLoader').is_hidden() and page.locator('#homeSearch').is_disabled() and page.locator('#homeCatalogStatus a').get_attribute('href').startswith('https://wa.me/'))
      state['mode']='ok';page.get_by_role('button',name='Reintentar').click();page.wait_for_selector('#homeCategorySections .product-card')
      check('Reintentar recupera catálogo y búsqueda',page.locator('#homeSearch').is_enabled() and not page.locator('#homeCatalogStatus').inner_text().strip())
     context.close()
    state['mode']='ok';context=browser.new_context();context.route('https://mock.supabase.co/rest/v1/rpc/*',route_rpc);page=context.new_page();page.goto(origin+'/');page.wait_for_selector('.product-card')
    invalid=page.evaluate('async()=>{try{await BattingData.revalidateCart(Array.from({length:51},(_,i)=>String(i)));return false}catch(e){return e.message.includes("50")}}');check('Rechaza >50 ids antes de red',invalid)
    page.evaluate('(item)=>{BattingCart.write([item]);return BattingCart.render({revalidate:true})}',ITEM);page.evaluate('BattingUI.openDrawer("#cartDrawer")');state['price']=35
    # Fuerza caducidad mediante cambio del carrito: firma distinta requiere validación.
    page.evaluate('()=>{const a=BattingCart.read();a[0].qty=3;BattingCart.write(a)}');page.locator('#cartWhatsapp').click();page.wait_for_timeout(300);check('Cambio de precio exige segundo clic',page.url.startswith(origin) and page.locator('#cartTotal').inner_text()=='$105.00')
    page.evaluate('localStorage.setItem("store-test-marker","store")');page.goto(panel_origin+'/');page.wait_for_function('!!window.BattingImages');check('Panel login separado visible',page.locator('#loginPanel').is_visible() and not page.locator('#adminApp').is_visible());check('Panel no comparte storage con tienda',page.evaluate('localStorage.getItem("store-test-marker")') is None);check('Ver tienda apunta a origen publico',page.get_by_role('link',name='Ver tienda',exact=True).get_attribute('href')==origin)
    converted=page.evaluate("""async()=>{const canvas=document.createElement('canvas');canvas.width=2400;canvas.height=1800;const ctx=canvas.getContext('2d');ctx.fillStyle='red';ctx.fillRect(0,0,2400,1800);const source=await new Promise(r=>canvas.toBlob(r,'image/png'));const result=await BattingImages.prepare(new File([source],'test.png',{type:'image/png'}));const thumb=await createImageBitmap(result.thumbnail);return {width:result.width,height:result.height,type:result.full.type,jpgType:result.jpg.type,jpgSize:result.jpg.size,thumb:thumb.width}}""")
    check('Foto WebP 1600px',converted['width']==1600 and converted['height']==1600 and converted['type']=='image/webp')
    check('Miniatura 480px y JPG <=300KB',converted['thumb']==480 and converted['jpgType']=='image/jpeg' and converted['jpgSize']<=300*1024)
    for w,h in [(800,800),(1000,1400)]:
     normalized=page.evaluate("""async([w,h])=>{const c=document.createElement('canvas');c.width=w;c.height=h;const b=await new Promise(r=>c.toBlob(r,'image/png'));const result=await BattingImages.prepare(new File([b],'upload.png',{type:'image/png'}));const full=await createImageBitmap(result.full);return [full.width,full.height]}""",[w,h]);check(f'Normaliza carga {w}x{h} a 1600x1600',normalized==[1600,1600])
    rejected=page.evaluate("""async()=>{const c=document.createElement('canvas');c.width=c.height=400;const b=await new Promise(r=>c.toBlob(r,'image/png'));try{await BattingImages.prepare(new File([b],'small.png',{type:'image/png'}));return false}catch{return true}}""");check('Rechaza foto menor a 800px',rejected)
    context.close();browser.close()
  finally:server.shutdown();server.server_close();thread.join();panel_server.shutdown();panel_server.server_close();panel_thread.join()
 print(f'{sum(checks)}/{len(checks)} comprobaciones de navegador correctas; capturas: {OUT}')
 return 0 if all(checks) else 1
if __name__=='__main__':sys.exit(main())
