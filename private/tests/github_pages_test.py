"""GitHub Pages sin Worker ni reescrituras, en raíz y ruta de repositorio."""
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
import copy,json,os,subprocess,tempfile,threading
from playwright.sync_api import sync_playwright
from browser_smoke import CATALOG

ROOT=Path(__file__).resolve().parents[2]

def main():
 (ROOT/'artifacts').mkdir(exist_ok=True)
 with tempfile.TemporaryDirectory(prefix='github_',dir=ROOT/'artifacts') as td:
  base=Path(td)
  class Handler(SimpleHTTPRequestHandler):
   def __init__(self,*args,**kwargs):super().__init__(*args,directory=td,**kwargs)
   def log_message(self,*args):pass
  server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
  thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
  origin=f'http://127.0.0.1:{server.server_port}'
  bundle=copy.deepcopy(CATALOG)
  bundle['categories'][0]['name']='Guantines de bateo'
  bundle['categories'][1]['name']='Mangas de compresión'
  template={**bundle['products'][0],'images':[]}
  bundle['products']=[{**template,'id':f'00000000-0000-4000-8000-{i:012d}',
    'category_id':bundle['categories'][i%3]['id'],'slug':f'producto-{i}','name':f'Producto {i}','showOnCover':True} for i in range(120)]
  def rpc(route):
   name=route.request.url.rsplit('/',1)[-1];args=route.request.post_data_json or {}
   data=bundle if name=='get_public_catalog' else next((p for p in bundle['products'] if p['slug']==args.get('p_slug')),None)
   route.fulfill(status=200,content_type='application/json',body=json.dumps(data))
  try:
   checkdir=(base/'https-check').relative_to(ROOT).as_posix()
   subprocess.run(['node','private/scripts/build-github.mjs'],cwd=ROOT,env={**os.environ,'SITE_URL':'http://example.github.io/Batting-Shop','SUPABASE_URL':'https://mock.supabase.co','SUPABASE_ANON_KEY':'mock-public-key','SKIP_SITEMAP_API':'1','BS_OUTPUT_DIR':checkdir},check=True,capture_output=True)
   assert 'https://example.github.io/Batting-Shop/' in (ROOT/checkdir/'index.html').read_text(encoding='utf-8')
   print('PASS URL github.io normalizada a HTTPS')
   with sync_playwright() as pw:
    executable=os.environ.get('PLAYWRIGHT_EXECUTABLE_PATH')
    browser=pw.chromium.launch(executable_path=executable) if executable else pw.chromium.launch(channel='chrome')
    for prefix in ['/Batting-Shop','']:
     dest=base/prefix.strip('/') if prefix else base
     env={**os.environ,'SITE_URL':f'http://localhost:{server.server_port}{prefix}',
       'SUPABASE_URL':'https://mock.supabase.co','SUPABASE_ANON_KEY':'mock-public-key',
       'SKIP_SITEMAP_API':'1','BS_OUTPUT_DIR':dest.relative_to(ROOT).as_posix()}
     subprocess.run(['node','private/scripts/build-github.mjs'],cwd=ROOT,env=env,check=True,capture_output=True)
     assert (dest/'.nojekyll').exists()
     assert not any((dest/name).exists() for name in ['_worker.js','_headers','_routes.json','panel','private'])
     context=browser.new_context(viewport={'width':1366,'height':900},reduced_motion='reduce')
     context.route('https://mock.supabase.co/rest/v1/rpc/*',rpc)
     page=context.new_page();errors=[];failed=[]
     page.on('pageerror',lambda error:errors.append(str(error)))
     page.on('response',lambda response:failed.append(response.url) if response.status>=400 else None)
     page.clock.install()
     page.goto(origin+prefix+'/');page.wait_for_selector('.cover-float')
     assert page.locator('.cover-control').count()==0
     assert page.locator('#heroVisual img').count()==1
     for width in [320,375,390,768,820,980,1023,1024,1366,1920,2560]:
      page.set_viewport_size({'width':width,'height':900})
      assert page.locator('.desktop-hero').is_visible()==(width>=1024),width
      assert not page.locator('.mobile-intro').is_visible(),width
      assert page.locator('.site-header').is_visible(),width
      if width<1024:
       logo=page.locator('.site-header .brand-logo').bounding_box()
       assert abs(logo['x']+logo['width']/2-width/2)<1,(width,logo)
       header=page.locator('.site-header').bounding_box();search=page.locator('.search-wrap').bounding_box()
       assert search['y']>=header['y']+header['height']-1 and search['y']<header['y']+header['height']+40,(width,header,search)
      cards=page.locator('.visual-category').evaluate_all("""nodes=>nodes.map(n=>{const r=n.getBoundingClientRect(),i=n.querySelector('img').getBoundingClientRect(),s=n.querySelector('small').getBoundingClientRect();return {top:r.top,imgTop:i.top,imgWidth:i.width,imgHeight:i.height,countTop:s.top}})""")
      for a in cards:
       assert abs(a['imgWidth']-a['imgHeight'])<1,(width,a)
       for b in cards:
        if abs(a['top']-b['top'])<1:assert abs(a['imgTop']-b['imgTop'])<1 and abs(a['countTop']-b['countTop'])<1,(width,a,b)
      assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),width
     page.set_viewport_size({'width':1366,'height':900})
     sleeve=page.evaluate("BattingData.storageUrl('ec686421-e5b1-456c-a1eb-2534866f2d44/6f13a647-7575-4fa1-867d-7360a5d5183e.webp')")
     assert sleeve.startswith(prefix+'/assets/images/white-products/') and sleeve.endswith('.webp'),sleeve
     assert page.request.get(origin+sleeve).ok
     for code in ['kl2391','kl1766']:
      photo=page.evaluate('(code)=>BattingData.storageUrl("/assets/images/adidas-phnm-"+code+".webp")',code)
      assert photo.startswith(prefix+'/assets/images/white-products/'),photo
      assert page.request.get(origin+photo).ok
     print(f'PASS {prefix or "/"}: fotos cuadradas y alineadas en 11 anchos, manga HD disponible')
     cover=page.locator('.cover-float');cover.hover();cover.focus()
     for i in range(1,121):
      page.clock.fast_forward(3000)
      actual=cover.get_attribute('href')
      assert actual==f'{prefix}/producto/?slug=producto-{i%120}',(i,actual)
     assert page.locator('#heroVisual img').count()==1
     print(f'PASS {prefix or "/"}: rotación completa de 120 productos, con foco/cursor y movimiento reducido')
     page.clock.resume()
     cover.click();page.wait_for_selector('#productName')
     assert page.locator('#productName').inner_text()=='Producto 0'
     page.reload()
     try:page.wait_for_selector('#addOrder')
     except Exception:
      print('DEBUG',errors,page.locator('#productRoot').inner_text(),flush=True)
      raise
     assert '?slug=producto-0' in page.url
     assert page.locator('link[rel="stylesheet"]').get_attribute('href').startswith(prefix+'/assets/')
     assert '?v=' in page.locator('link[rel="stylesheet"]').get_attribute('href')
     # Acceso directo en sesión nueva: la ficha no depende del catálogo en caché.
     page.evaluate('sessionStorage.clear()');page.reload();page.wait_for_selector('#addOrder')
     page.goto(origin+prefix+'/catalogo.html');page.wait_for_selector('.product-card')
     assert page.evaluate('(async()=> (await BattingData.loadCatalogBundle()).products.length)()')==120
     page.goto(origin+prefix+'/tallas.html');page.wait_for_selector('#main')
     page.wait_for_load_state('networkidle')
     assert not errors,errors
     assert not failed,failed
     print(f'PASS {prefix or "/"}: fichas, recarga, acceso directo, catálogo, guías y recursos sin errores')
     context.close()
    browser.close()
  finally:
   server.shutdown();server.server_close();thread.join()

if __name__=='__main__':main()
