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
  env=os.environ.copy();env.update(SUPABASE_URL='https://mock.supabase.co',SUPABASE_ANON_KEY='mock-public-key',SKIP_SITEMAP_API='1',BS_OUTPUT_DIR=Path(td).relative_to(ROOT).as_posix(),SITE_URL='http://localhost:8080');env.pop('CF_PAGES_BRANCH',None);env.pop('CF_PAGES_URL',None)
  subprocess.run(['node','build.mjs'],cwd=ROOT,env=env,check=True)
  class Handler(SimpleHTTPRequestHandler):
   protocol_version='HTTP/1.1'
   def __init__(self,*args,**kwargs):super().__init__(*args,directory=td,**kwargs)
   def do_GET(self):
    if urlparse(self.path).path.startswith('/producto/'):self.path='/producto/index.html'
    return super().do_GET()
   def log_message(self,*_):pass
  class Server(ThreadingHTTPServer):request_queue_size=128
  server=Server(('127.0.0.1',0),Handler);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start();origin=f'http://127.0.0.1:{server.server_port}'
  state={'mode':'ok','price':29.99,'available':True,'calls':0}
  def route_rpc(route):
   state['calls']+=1;name=route.request.url.rsplit('/',1)[-1];args=route.request.post_data_json or {};data=None
   if state['mode']=='error':route.fulfill(status=503,json={'message':'offline'},headers={'Access-Control-Allow-Origin':'*'});return
   if name=='get_public_catalog':data={'categories':[],'products':[]} if state['mode']=='empty' else CATALOG
   elif name=='get_public_product':data=next((p for p in PRODUCTS if p['slug']==args['p_slug']),None)
   elif name=='get_related_products':data=[p for p in PRODUCTS if p['id']!=args['p_product_id']]
   elif name=='get_public_cart_state':data=[dict(variantId=uuid(20),slug=ITEM['slug'],name=ITEM['name'],available=state['available'],price=state['price'],options=ITEM['options'],imagePath=ITEM['image'])] if uuid(20) in args['p_variant_ids'] else []
   route.fulfill(json=data,headers={'Access-Control-Allow-Origin':'*'})
  def inspect(page,label):
   result=page.evaluate('''()=>{const visible=e=>!!(e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'&&e.closest('[aria-hidden="true"]')===null);return {
     overflow:document.documentElement.scrollWidth>innerWidth+1,
     smallButtons:[...document.querySelectorAll('button,summary')].filter(visible).filter(e=>{const r=e.getBoundingClientRect();return r.height<40||r.width<40}).map(e=>e.outerHTML.slice(0,100)),
     smallText:[...document.querySelectorAll('body *')].filter(visible).filter(e=>[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())&&parseFloat(getComputedStyle(e).fontSize)<12).map(e=>e.outerHTML.slice(0,100)),
     favorites:[...document.querySelectorAll('.card-favorite')].filter(visible).map(e=>e.getBoundingClientRect().width)
   }}''')
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
    # Estados y tiempos del loader sin tocar dependencias ni fuentes.
    context=browser.new_context(viewport={'width':390,'height':900});context.route('https://mock.supabase.co/rest/v1/rpc/*',route_rpc);page=context.new_page();page.goto(origin+'/');page.wait_for_selector('.product-card')
    page.evaluate('''()=>{window.loaderStart=performance.now();window.loaderPromise=BattingUI.withLoader(new Promise(r=>setTimeout(r,500)));}''');page.wait_for_timeout(200);check('Loader oculto antes de 350ms',not page.locator('#globalLoader').is_visible());page.wait_for_timeout(180);check('Loader visible y logo',page.locator('#globalLoader').is_visible() and page.locator('.loader-logo').is_visible());ball=page.locator('.softball-track img').evaluate('(e)=>parseFloat(getComputedStyle(e).width)');check('Pelota 56px',ball==56);page.wait_for_timeout(400);check('Loader minimo 400ms',page.locator('#globalLoader').is_visible());page.wait_for_timeout(200);check('Loader termina',not page.locator('#globalLoader').is_visible())
    page.evaluate('window.stalled=BattingUI.withLoader(new Promise(()=>{})).catch(()=>{})');page.wait_for_timeout(12100);check('Loader timeout con WhatsApp',page.locator('#loaderError').is_visible() and page.locator('#loaderError a').get_attribute('href').startswith('https://wa.me/'))
    context.close()
    for mode in ['empty','error']:
     state['mode']=mode;context=browser.new_context();context.route('https://mock.supabase.co/rest/v1/rpc/*',route_rpc);page=context.new_page();page.goto(origin+'/');page.wait_for_timeout(700)
     text=page.locator('#main').inner_text();check(f'Estado {mode}',('PRÓXIMAMENTE' in text) if mode=='empty' else ('PRÓXIMAMENTE' not in text and 'Reintentar' in text));context.close()
    state['mode']='ok';context=browser.new_context();context.route('https://mock.supabase.co/rest/v1/rpc/*',route_rpc);page=context.new_page();page.goto(origin+'/');page.wait_for_selector('.product-card')
    invalid=page.evaluate('async()=>{try{await BattingData.revalidateCart(Array.from({length:51},(_,i)=>String(i)));return false}catch(e){return e.message.includes("50")}}');check('Rechaza >50 ids antes de red',invalid)
    page.evaluate('(item)=>{BattingCart.write([item]);return BattingCart.render({revalidate:true})}',ITEM);page.evaluate('BattingUI.openDrawer("#cartDrawer")');state['price']=35
    # Fuerza caducidad mediante cambio del carrito: firma distinta requiere validación.
    page.evaluate('()=>{const a=BattingCart.read();a[0].qty=3;BattingCart.write(a)}');page.locator('#cartWhatsapp').click();page.wait_for_timeout(300);check('Cambio de precio exige segundo clic',page.url.startswith(origin) and page.locator('#cartTotal').inner_text()=='$105.00')
    page.goto(origin+'/admin/');page.wait_for_function('!!window.BattingImages')
    converted=page.evaluate("""async()=>{const canvas=document.createElement('canvas');canvas.width=2400;canvas.height=1800;const ctx=canvas.getContext('2d');ctx.fillStyle='red';ctx.fillRect(0,0,2400,1800);const source=await new Promise(r=>canvas.toBlob(r,'image/png'));const result=await BattingImages.prepare(new File([source],'test.png',{type:'image/png'}));const thumb=await createImageBitmap(result.thumbnail);return {width:result.width,height:result.height,type:result.full.type,jpgType:result.jpg.type,jpgSize:result.jpg.size,thumb:thumb.width}}""")
    check('Foto WebP 1600px',converted['width']==1600 and converted['height']==1600 and converted['type']=='image/webp')
    check('Miniatura 480px y JPG <=300KB',converted['thumb']==480 and converted['jpgType']=='image/jpeg' and converted['jpgSize']<=300*1024)
    rejected=page.evaluate("""async()=>{const c=document.createElement('canvas');c.width=c.height=400;const b=await new Promise(r=>c.toBlob(r,'image/png'));try{await BattingImages.prepare(new File([b],'small.png',{type:'image/png'}));return false}catch{return true}}""");check('Rechaza foto menor a 800px',rejected)
    context.close();browser.close()
  finally:server.shutdown();server.server_close();thread.join()
 print(f'{sum(checks)}/{len(checks)} comprobaciones de navegador correctas; capturas: {OUT}')
 return 0 if all(checks) else 1
if __name__=='__main__':sys.exit(main())
