"""Valida archivos, descarga por tamaño y textos sin recortes en pantallas pequeñas."""
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import copy,json,os,subprocess,tempfile,threading
from PIL import Image
from playwright.sync_api import sync_playwright
from browser_smoke import CATALOG,uuid

ROOT=Path(__file__).resolve().parents[2]

def main():
 registry=json.loads((ROOT/'public/data/image-variants.json').read_text(encoding='utf-8'))
 totals={width:0 for width in ['320','480','960','1280','1600']}
 for variants in registry['responsive'].values():
  for width,path in variants.items():
   file=ROOT/'public'/path.lstrip('/')
   with Image.open(file) as image:assert image.size==(int(width),int(width)),file
   totals[width]+=file.stat().st_size
 assert totals['320']<totals['1600']*.15,totals
 assert (ROOT/'public/assets/images/logo-small.webp').stat().st_size<(ROOT/'public/assets/images/logo.webp').stat().st_size*.3
 print(f'PASS {len(registry["responsive"])} fotos: cinco tamaños reales y miniaturas ligeras')
 bundle=copy.deepcopy(CATALOG)
 category=bundle['categories'][0]
 category['attributes']=[dict(key='edad_nivel',label='Edad / nivel',scope='product',type='select',options=[dict(value='adulto',label='Adulto')])]
 product=bundle['products'][0];product['attributes']={'edad_nivel':'adulto'};product['brand']='Nike';product['variants']=[]
 paths=[path for path in registry['overrides'] if not path.startswith('/') and not path.endswith('.thumb.webp')][:2]
 product['colors']=[dict(id=uuid(800+i),sortOrder=i,name=name,label=name,hex=hexcode,
  images=[dict(storagePath=path,thumbnailPath=path.replace('.webp','.thumb.webp'),width=1600,height=1600)],
  variants=[dict(id=uuid(810+i),available=True,normalizedSize='M',sizeLabel='M',maxAvailableQuantity=1)])
  for i,(name,hexcode,path) in enumerate(zip(['Rojo','Azul'],['#dc2626','#2563eb'],paths))]
 with tempfile.TemporaryDirectory(prefix='media_',dir=ROOT/'artifacts') as directory:
  output=Path(directory)
  class Handler(SimpleHTTPRequestHandler):
   def __init__(self,*a,**kw):super().__init__(*a,directory=directory,**kw)
   def log_message(self,*a):pass
  server=ThreadingHTTPServer(('127.0.0.1',0),Handler);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
  origin=f'http://127.0.0.1:{server.server_port}'
  try:
   subprocess.run(['node','private/scripts/build-github.mjs'],cwd=ROOT,env={**os.environ,'SITE_URL':f'http://localhost:{server.server_port}','SUPABASE_URL':'https://mock.supabase.co','SUPABASE_ANON_KEY':'mock-public-key','SKIP_SITEMAP_API':'1','BS_OUTPUT_DIR':output.relative_to(ROOT).as_posix()},check=True,capture_output=True)
   def rpc(route):
    name=route.request.url.rsplit('/',1)[-1]
    data=bundle if name=='get_public_catalog' else {**product,'category':category} if name=='get_public_product' else []
    route.fulfill(json=data)
   with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path=os.environ['PLAYWRIGHT_EXECUTABLE_PATH']) if os.environ.get('PLAYWRIGHT_EXECUTABLE_PATH') else pw.chromium.launch(channel='chrome')
    for width,density in [(320,1),(390,2),(820,1),(1366,1)]:
     context=browser.new_context(viewport={'width':width,'height':900},device_scale_factor=density,reduced_motion='reduce')
     context.route('https://mock.supabase.co/rest/v1/rpc/*',rpc)
     page=context.new_page();errors=[];images=[]
     page.on('pageerror',lambda error:errors.append(str(error)))
     page.on('request',lambda request:images.append(request.url) if '/assets/images/catalog/' in request.url else None)
     page.goto(origin+'/');photo=page.locator('.product-card[data-product-slug="guante-franklin"] .card-image img').first
     photo.wait_for();photo.scroll_into_view_if_needed();photo.evaluate('(image)=>image.decode()')
     assert photo.evaluate('(image)=>image.currentSrc').endswith('-'+('320' if density==1 else '480')+'.webp'),photo.evaluate('(image)=>({src:image.src,current:image.currentSrc,sizes:image.sizes,srcset:image.srcset,dpr:devicePixelRatio})')
     assert not any(url.endswith(('-960.webp','-1280.webp','-1600.webp')) for url in images),images
     page.goto(origin+'/producto/?slug=guante-franklin');page.wait_for_selector('#colorOptions button')
     main=page.locator('#mainProductImage');main.evaluate('(image)=>image.decode()')
     assert main.evaluate('(image)=>image.currentSrc').endswith('-'+('960' if density==2 else '320' if width<1024 else '480')+'.webp')
     inside=page.locator('#colorOptions .color-option').first
     assert inside.evaluate('(button)=>parseFloat(getComputedStyle(button).borderRadius)')>=22
     label=page.locator('#productAttributes dt').bounding_box();value=page.locator('#productAttributes dd').bounding_box()
     assert abs(label['y']-value['y'])<1 and value['x']>label['x']+label['width'],(width,label,value)
     assert page.locator('#productAttributes dd').inner_text()=='Adulto'
     page.goto(origin+'/tallas.html');page.wait_for_selector('#guideTabs button')
     for brand in ['Franklin','Nike','Under Armour','Louisville','Adidas']:
      button=page.get_by_role('button',name=brand,exact=True);button.click()
      assert button.evaluate('(b)=>b.scrollWidth<=b.clientWidth+1'),brand
      rect=button.bounding_box();assert rect['x']>=0 and rect['x']+rect['width']<=width,rect
     assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
     page.goto(origin+'/assets/images/hand-measure.svg')
     assert page.locator('text').evaluate_all('texts=>texts.every(text=>{const b=text.getBBox();return b.x>=0&&b.y>=0&&b.x+b.width<=360&&b.y+b.height<=260})')
     assert not errors,errors
     print(f'PASS {width}px/{density}x: imágenes adecuadas, círculos, características alineadas y marcas completas')
     context.close()
    browser.close()
  finally:server.shutdown();server.server_close();thread.join()

if __name__=='__main__':main()
