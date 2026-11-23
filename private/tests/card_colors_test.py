"""Los colores de las tarjetas se pueden elegir sin navegar ni depender de hover."""
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import copy, json, os, subprocess, tempfile, threading
from playwright.sync_api import sync_playwright
from browser_smoke import CATALOG, uuid

ROOT=Path(__file__).resolve().parents[2]

def main():
 bundle=copy.deepcopy(CATALOG)
 bundle['categories'][0]['slug']='batgrips'
 product=bundle['products'][0]
 product['colors']=[dict(id=uuid(300+i),name=name,label=name,hex=hexcode,
  images=[dict(storagePath=f'/assets/images/logo.webp?color={name}',alt=name,width=1600,height=1600)],
  variants=[dict(id=uuid(400+i),available=i!=7,normalizedSize='M',sizeLabel='M',maxAvailableQuantity=2 if i!=7 else 0)])
  for i,(name,hexcode) in enumerate([('Azul','#2563eb'),('Rojo','#dc2626'),('Verde','#15803d'),('Blanco','#ffffff'),('Morado','#7e22ce'),('Amarillo','#facc15'),('Naranja','#ea580c'),('Negro','#111111')])]
 product['variants']=[]
 with tempfile.TemporaryDirectory(prefix='card_colors_',dir=ROOT/'artifacts') as directory:
  output=Path(directory)
  class Handler(SimpleHTTPRequestHandler):
   def __init__(self,*a,**kw):super().__init__(*a,directory=directory,**kw)
   def log_message(self,*a):pass
  server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
  thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
  origin=f'http://127.0.0.1:{server.server_port}'
  try:
   subprocess.run(['node','private/scripts/build-github.mjs'],cwd=ROOT,env={**os.environ,'SITE_URL':f'http://localhost:{server.server_port}',
    'SUPABASE_URL':'https://mock.supabase.co','SUPABASE_ANON_KEY':'mock-public-key','SKIP_SITEMAP_API':'1','BS_OUTPUT_DIR':output.relative_to(ROOT).as_posix()},check=True,capture_output=True)
   def rpc(route):
    name=route.request.url.rsplit('/',1)[-1];args=route.request.post_data_json or {}
    data=bundle if name=='get_public_catalog' else bundle['products'] if name=='get_related_products' else next((p for p in bundle['products'] if p['slug']==args.get('p_slug')),None)
    if name=='get_public_product' and data:data={**data,'category':next((c for c in bundle['categories'] if c['id']==data.get('category_id')),None)}
    route.fulfill(json=data)
   with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path=os.environ['PLAYWRIGHT_EXECUTABLE_PATH']) if os.environ.get('PLAYWRIGHT_EXECUTABLE_PATH') else pw.chromium.launch(channel='chrome')
    for width in [320,390,768,820,1023,1366]:
     context=browser.new_context(viewport={'width':width,'height':900},has_touch=True,reduced_motion='reduce')
     context.route('https://mock.supabase.co/rest/v1/rpc/*',rpc)
     page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
     for path,root in [('/','.home-category-section'),('/catalogo.html','#catalogGrid'),('/favoritos.html','#favoritesGrid'),('/producto/?slug=pelota-softball','#relatedGrid')]:
      page.goto(origin+path)
      if path=='/':
       page.wait_for_selector('.product-card')
       page.evaluate("BattingFavorites.toggle('guante-franklin')")
      card=page.locator(root+' .product-card').filter(has=page.locator('.product-card-link[href*="guante-franklin"]')).first
      card.wait_for()
      assert card.locator('.card-color').count()==8
      assert card.locator('a button').count()==0
      url=page.url
      red=card.get_by_role('button',name='Ver color Rojo',exact=True);red.click()
      assert page.url==url
      assert 'color=Rojo' in card.locator('.card-image img').get_attribute('src')
      assert red.get_attribute('aria-pressed')=='true'
      assert 'color=Rojo' in card.locator('.product-card-link').get_attribute('href')
      assert card.get_by_role('button',name='Ver color Negro (agotado)',exact=True).is_disabled()
      orange=card.get_by_role('button',name='Ver color Naranja',exact=True);orange.click()
      assert 'color=Naranja' in card.locator('.card-image img').get_attribute('src')
      assert orange.get_attribute('aria-pressed')=='true' and red.get_attribute('aria-pressed')=='false'
      assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
     page.goto(origin+'/producto/?slug=guante-franklin');page.wait_for_selector('#colorOptions button')
     assert page.locator('#sameModelSection').count()==0
     assert page.get_by_text('Otros colores de este modelo',exact=True).count()==0
     assert page.locator('#colorOptions').evaluate("e=>getComputedStyle(e).gridTemplateColumns.split(' ').length")==2
     chosen=page.locator('#colorOptions').get_by_role('button',name='Naranja disponible',exact=True)
     chosen.scroll_into_view_if_needed();chosen.click()
     page.wait_for_function("""()=>{const photo=document.querySelector('.gallery-main').getBoundingClientRect(),header=document.querySelector('.site-header').getBoundingClientRect();return photo.top>=header.bottom-1&&photo.bottom<=innerHeight+1}""")
     assert 'color=Naranja' in page.locator('#mainProductImage').get_attribute('src')
     assert 'color=Naranja' in page.url
     assert page.locator('#colorOptions .active').inner_text()=='Naranja'
     assert not errors,errors
     print(f'PASS {width}px: Inicio, Catálogo, Favoritos y relacionados; 8 colores, selección, stock y ficha con 2 columnas/autoscroll')
     context.close()
    browser.close()
  finally:server.shutdown();server.server_close();thread.join()

if __name__=='__main__':main()
