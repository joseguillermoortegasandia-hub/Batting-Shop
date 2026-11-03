from __future__ import annotations
from pathlib import Path
import json, os, re, shutil, subprocess, sys

ROOT=Path(__file__).resolve().parents[2]
DIST=ROOT/'dist'; VENDOR=ROOT/'node_modules/@supabase/supabase-js/dist/umd/supabase.js'

CATEGORY={
  'id':'10000000-0000-0000-0000-000000000001','slug':'prueba-dinamica','name':'Prueba dinámica','description':'Categoría creada desde datos, sin tocar código.','sortOrder':5,'showOnHome':True,'homeLimit':8,'variantMode':'option','optionLabel':'Presentación','searchKeywords':['prueba','entrenamiento','demo'],
  'attributes':[
    {'id':'a1','key':'material','label':'Material','type':'select','options':[{'value':'sintetico','label':'Sintético','sort_order':10},{'value':'cuero','label':'Cuero','sort_order':20}],'unit':None,'scope':'product','isFilterable':True,'isRequired':True,'showInCard':True,'sortOrder':10},
    {'id':'a2','key':'presentacion','label':'Presentación','type':'select','options':[{'value':'unidad','label':'Unidad','sort_order':10},{'value':'docena','label':'Docena','sort_order':20}],'unit':None,'scope':'variant','isFilterable':True,'isRequired':True,'showInCard':False,'sortOrder':20},
  ]
}
CAT2={'id':'10000000-0000-0000-0000-000000000002','slug':'eyeblack','name':'Eye Black','description':'Accesorios anti-reflejo.','sortOrder':30,'showOnHome':True,'homeLimit':6,'variantMode':'single','optionLabel':None,'searchKeywords':['eye black','antireflejo'],'attributes':[]}
P1={'id':'20000000-0000-0000-0000-000000000001','slug':'producto-prueba','name':'Producto de prueba','brand':'Marca Demo','description':'Producto dinámico para validar filtros, búsqueda y variantes.','price':None,'attributes':{'material':'sintetico'},'featured':True,'createdAt':'2026-10-06T00:00:00Z','category':CATEGORY,'colors':[],'variants':[{'id':'30000000-0000-0000-0000-000000000001','sizeLabel':None,'normalizedSize':None,'sizeSortOrder':500,'variantKey':'unidad','attributes':{'presentacion':'unidad'},'salePrice':12,'available':True,'sortOrder':0},{'id':'30000000-0000-0000-0000-000000000002','sizeLabel':None,'normalizedSize':None,'sizeSortOrder':500,'variantKey':'docena','attributes':{'presentacion':'docena'},'salePrice':20,'available':True,'sortOrder':1}],'images':[{'id':'i1','storagePath':'/assets/images/logo.webp','alt':'Producto de prueba','sortOrder':0,'isCover':True}]}
P2={'id':'20000000-0000-0000-0000-000000000002','slug':'producto-consultar','name':'Producto sin precio','brand':'Marca Demo','description':'Producto cuyo precio se confirma por WhatsApp.','price':None,'attributes':{},'featured':False,'createdAt':'2026-10-05T00:00:00Z','category':CAT2,'colors':[],'variants':[{'id':'30000000-0000-0000-0000-000000000003','sizeLabel':None,'normalizedSize':'ONE','sizeSortOrder':9999,'variantKey':'single','attributes':{},'salePrice':None,'available':True,'sortOrder':0}],'images':[{'id':'i2','storagePath':'/assets/images/logo.webp','alt':'Producto sin precio','sortOrder':0,'isCover':True}]}
CATALOG={'categories':[CATEGORY,CAT2],'products':[P1,P2]}

MOCK_JS=f'''(function(){{'use strict';const catalog={json.dumps(CATALOG,ensure_ascii=False)};const products=new Map(catalog.products.map(p=>[p.slug,p]));const sleep=v=>new Promise(r=>setTimeout(r,Number(window.__BS_MOCK_DELAY_MS||0))).then(()=>v);function state(ids){{const out=[];for(const id of ids||[])for(const p of catalog.products)for(const v of p.variants||[])if(v.id===id)out.push({{variantId:v.id,slug:p.slug,name:p.name,available:v.available,price:v.salePrice??p.price,sizeLabel:v.sizeLabel,normalizedSize:v.normalizedSize,imagePath:'/assets/images/logo.webp',options:(v.attributes?.presentacion?[{{label:'Presentación',value:v.attributes.presentacion==='unidad'?'Unidad':'Docena'}}]:[])}});return out}}window.supabase={{createClient:function(){{return{{rpc:function(name,args={{}}){{let data=null;if(name==='get_public_catalog')data=catalog;else if(name==='get_public_product')data=products.get(args.p_slug)||null;else if(name==='get_related_products')data=catalog.products.filter(p=>p.id!==args.p_product_id).slice(0,args.p_limit||4);else if(name==='get_public_cart_state')data=state(args.p_variant_ids||[]);return sleep({{data,error:null}})}}}}}}}};}})();'''

EMPTY_MOCK_JS="""(function(){'use strict';window.supabase={createClient:function(){return{rpc:async function(name){if(name==='get_public_catalog')return {data:{categories:[],products:[]},error:null};return {data:null,error:null}}}}};})();"""

def build(mock=MOCK_JS):
    VENDOR.parent.mkdir(parents=True,exist_ok=True); VENDOR.write_text(mock,encoding='utf-8')
    env=os.environ.copy();env.update({'SUPABASE_URL':'https://mock.supabase.co','SUPABASE_ANON_KEY':'mock-anon-key','CF_PAGES_BRANCH':'feature-stage2','CF_PAGES_URL':'https://preview.pages.dev','SKIP_SITEMAP_API':'1'});env.pop('SITE_URL',None)
    p=subprocess.run(['node','build.mjs'],cwd=ROOT,env=env,text=True,capture_output=True)
    if p.returncode: raise RuntimeError(p.stdout+p.stderr)

def cleanup():
    shutil.rmtree(ROOT/'node_modules',ignore_errors=True); shutil.rmtree(DIST,ignore_errors=True)

def inline_html(rel,delay=0,query_override=None,product_slug=None):
    src=(DIST/rel).read_text(encoding='utf-8'); css=(DIST/'assets/css/store.css').read_text(encoding='utf-8')
    src=re.sub(r'<link rel="stylesheet" href="/assets/css/store\.css">',lambda _:f'<style>{css}</style>',src)
    src=src.replace('<head>','<head><script>window.__BS_MOCK_DELAY_MS='+str(delay)+';</script>',1)
    pattern=re.compile(r'<script src="([^"]+)" defer></script>')
    def repl(m):
        path=m.group(1).split('?',1)[0].lstrip('/'); code=(DIST/path).read_text(encoding='utf-8')
        if query_override and path.endswith('/catalog.js'):
            code=code.replace("const params=new URLSearchParams(location.search);",f"const params=new URLSearchParams({json.dumps(query_override)});")
        if product_slug and path.endswith('/product.js'):
            code=code.replace("const requestedSlug=slugFromLocation();",f"const requestedSlug={json.dumps(product_slug)};")
            code=code.replace("const currentParams=new URLSearchParams(location.search),requestedColor=currentParams.get('color');", "const currentParams=new URLSearchParams(''),requestedColor=currentParams.get('color');")
            code=code.replace("if(requestedSlug!==p.slug||location.pathname!==`/producto/${encodeURIComponent(p.slug)}/`){const u=new URL(window.BattingData.productUrl(p.slug,requestedColor),location.origin);history.replaceState({},'',u.pathname+u.search)}","")
        return '<script>'+code+'</script>'
    return pattern.sub(repl,src)

def main():
    from playwright.sync_api import sync_playwright
    checks=[]; failures=[]
    def check(name,cond,detail=''):
        checks.append((name,bool(cond),detail));
        if not cond: failures.append(f'{name}: {detail}')
    try:
      build()
      with sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
        context=browser.new_context(viewport={'width':390,'height':844},reduced_motion='no-preference')
        page=context.new_page(); console_errors=[]; page_errors=[]
        page.on('console',lambda msg: console_errors.append(msg.text) if msg.type=='error' else None); page.on('pageerror',lambda err: page_errors.append(str(err)))
        page.set_content(inline_html('index.html',delay=1500),wait_until='domcontentloaded')
        page.wait_for_timeout(500); check('Loader aparece con latencia 1.5s',page.locator('#globalLoader').is_visible())
        page.wait_for_selector('text=Prueba dinámica',timeout=5000); page.wait_for_timeout(500)
        check('Loader se oculta al terminar',not page.locator('#globalLoader').is_visible())
        check('Categoría dinámica aparece home',page.locator('text=Prueba dinámica').count()>0)
        check('Sin scroll horizontal móvil',page.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1'))
        check('Barra inferior visible',page.locator('.mobile-tabbar').is_visible())
        check('Barra inferior tiene 5 items',page.locator('.mobile-tabbar > *').count()==5)
        wa=page.locator('#floatingWhatsapp').bounding_box(); bar=page.locator('.mobile-tabbar').bounding_box(); check('WhatsApp sobre barra',bool(wa and bar and wa['y']+wa['height']<=bar['y']+2),f'wa={wa}, bar={bar}')
        page.locator('[data-mobile-nav="categories"]').click(); page.wait_for_timeout(100); check('Hoja categorías usa BD',page.locator('#mobileCategoryList').get_by_text('Prueba dinámica').count()==1); page.keyboard.press('Escape'); page.wait_for_timeout(60); check('Escape cierra categorías',page.locator('#categorySheet').get_attribute('aria-hidden')=='true')
        page.locator('#homeSearch').fill('sintético'); page.wait_for_timeout(100); check('Búsqueda por atributo',page.locator('#searchResults').get_by_text('Producto de prueba').count()>0)
        page.set_content(inline_html('catalogo.html',query_override='?categoria=prueba-dinamica'),wait_until='domcontentloaded'); page.wait_for_selector('.product-card',timeout=3000)
        check('Filtro Material dinámico',page.locator('#dynamicFilters').get_by_text('Material').count()>0); check('Filtro Presentación dinámico',page.locator('#dynamicFilters').get_by_text('Presentación').count()>0); check('Catálogo sin scroll horizontal',page.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1'))
        page.set_content(inline_html('producto/index.html',product_slug='producto-prueba'),wait_until='domcontentloaded'); page.wait_for_selector('#productName',timeout=3000)
        check('Ficha individual carga',page.locator('#productName').inner_text()=='Producto de prueba'); check('Atributo variante renderiza',page.locator('#variantAttributeOptions').get_by_text('Presentación').count()>0)
        page.locator('#addOrder').scroll_into_view_if_needed(); page.wait_for_timeout(150); check('WhatsApp no tapa CTA',page.evaluate("getComputedStyle(document.querySelector('#floatingWhatsapp')).pointerEvents==='none'"))
        page.evaluate("""async()=>{BattingCart.write([{variantId:'30000000-0000-0000-0000-000000000001',slug:'producto-prueba',name:'Producto de prueba',options:[{label:'Presentación',value:'Unidad'}],price:12,image:'/assets/images/logo.webp',qty:1},{variantId:'30000000-0000-0000-0000-000000000003',slug:'producto-consultar',name:'Producto sin precio',options:[],price:null,image:'/assets/images/logo.webp',qty:1}]);await BattingCart.render({revalidate:true});}""")
        total=page.locator('#cartTotal').inner_text(); href=page.locator('#cartWhatsapp').get_attribute('href') or ''
        from urllib.parse import unquote
        decoded=unquote(href); check('Carrito mixto total Por confirmar',total=='Por confirmar',total); check('WhatsApp sin $0.00','precio por confirmar' in decoded and '$0.00' not in decoded,decoded)
        check('Badge 0 oculto',page.evaluate("()=>{BattingCart.write([]);BattingCart.updateCount();return [...document.querySelectorAll('[data-cart-count]')].every(n=>n.hidden)}"))
        check('Sin errores JS móvil',not console_errors and not page_errors,' | '.join(console_errors+page_errors)); context.close()
        context=browser.new_context(viewport={'width':390,'height':844},reduced_motion='reduce'); page=context.new_page(); page.set_content(inline_html('index.html',delay=1500),wait_until='domcontentloaded'); page.wait_for_timeout(500); anim=page.locator('.softball-track img').evaluate('el=>getComputedStyle(el).animationName'); check('Reduced motion evita rodar',anim!='softball-roll',anim); context.close()
        context=browser.new_context(viewport={'width':1366,'height':800}); page=context.new_page(); desktop_errors=[]; page.on('console',lambda msg: desktop_errors.append(msg.text) if msg.type=='error' else None); page.set_content(inline_html('index.html'),wait_until='domcontentloaded'); page.wait_for_selector('text=Prueba dinámica',timeout=3000); check('Desktop sin scroll horizontal',page.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1')); check('Barra móvil oculta desktop',not page.locator('.mobile-tabbar').is_visible()); check('Carrito header visible desktop',page.locator('.header-cart-button').is_visible()); check('Footer común',page.locator('#contacto').count()==1); check('Sin errores JS desktop',not desktop_errors,' | '.join(desktop_errors)); context.close(); browser.close()
      # Estado próximamente with empty mock build
      cleanup(); build(EMPTY_MOCK_JS)
      with sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox']); context=browser.new_context(viewport={'width':390,'height':844}); page=context.new_page(); page.set_content(inline_html('index.html'),wait_until='domcontentloaded'); page.wait_for_timeout(300); check('Home sin publicados muestra Próximamente',page.get_by_text('PRÓXIMAMENTE').count()>0); context.close(); browser.close()
    finally:
      cleanup()
    print('Batting Shop V4 Stage 3 — browser smoke')
    print('='*52)
    for name,passed,detail in checks: print(('PASS' if passed else 'FAIL'),name,(f'— {detail}' if detail and not passed else ''))
    print(f'\n{sum(1 for _,p,_ in checks if p)}/{len(checks)} checks passed')
    if failures:
        print('\nFallos:'); [print('-',x) for x in failures]; return 1
    return 0

if __name__=='__main__': sys.exit(main())
