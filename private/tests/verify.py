from pathlib import Path
import json, math, os, re, shutil, subprocess, sys

ROOT=Path(__file__).resolve().parents[2]
PUBLIC=ROOT/'public'; PRIVATE=ROOT/'private'; DIST=ROOT/'dist'; MIG=PRIVATE/'supabase/migrations'
checks=[]; failures=[]
def text(p): return Path(p).read_text(encoding='utf-8')
def check(name,cond,detail=''):
    ok=bool(cond); checks.append((name,ok,detail))
    if not ok: failures.append((name,detail))

def lum(hexv):
    s=hexv.lstrip('#'); rgb=[int(s[i:i+2],16)/255 for i in (0,2,4)]
    vals=[x/12.92 if x<=0.04045 else ((x+0.055)/1.055)**2.4 for x in rgb]
    return .2126*vals[0]+.7152*vals[1]+.0722*vals[2]
def contrast(a,b):
    l1,l2=sorted((lum(a),lum(b)),reverse=True); return (l1+.05)/(l2+.05)

# Structure / stage boundaries
check('Migraciones 001, 002 y 003', sorted(p.name for p in MIG.glob('*.sql'))==['001_stage1_dynamic_catalog.sql','002_stage2_categories_pelotas.sql','003_stage3_slug_aliases.sql'])
all_text='\n'.join(text(p) for p in ROOT.rglob('*') if p.is_file() and p.suffix in {'.js','.sql','.html','.md'})
check('Alias de producto y categoría implementados', 'product_slug_aliases' in all_text and 'category_slug_aliases' in all_text and 'capture_product_slug_alias' in all_text and 'capture_category_slug_alias' in all_text)
adminjs=text(PUBLIC/'admin/assets/admin.js')
check('CSV attr: dinámico implementado', 'attr:' in adminjs and 'csvAttributesFor' in adminjs and 'parseCsvAttributeValue' in adminjs)
check('Plantilla CSV attr disponible', (PUBLIC/'admin/import-template.csv').exists() and 'attr:edad_nivel' in text(PUBLIC/'admin/import-template.csv'))

# Part A accumulated fixes
css=text(PUBLIC/'assets/css/store.css'); store=text(PUBLIC/'assets/js/catalog-store.js'); catalog=text(PUBLIC/'assets/js/catalog.js'); product=text(PUBLIC/'assets/js/product.js'); ui=text(PUBLIC/'assets/js/ui.js'); cart=text(PUBLIC/'assets/js/cart.js'); build=text(ROOT/'build.mjs')
check('Swatch 15x15 + flex none', all(x in css for x in ['width:15px','height:15px','flex:0 0 15px']))
check('Tallas usan sizeSortOrder', 'sizeSortOrder' in catalog and 'localeCompare' in catalog)
check('Código BS no se muestra en frontend público', not re.search(r'\b(product|p)\.code\b', '\n'.join([store,product,ui,catalog])))
check('Plantilla compartida en páginas', all('<!--BS_HEAD-->' in text(PUBLIC/p) and '<!--BS_CHROME-->' in text(PUBLIC/p) and '<!--BS_FOOTER-->' in text(PUBLIC/p) for p in ['index.html','catalogo.html','producto/index.html','tallas.html','favoritos.html','404.html']))
check('Catálogo por RPC', "rpc('get_public_catalog')" in store and "from('products')" not in store)
check('Ficha por RPC individual', "rpc('get_public_product'" in store and 'loadProduct' in product)
check('Relacionados por RPC', "rpc('get_related_products'" in store)
check('Cliente público sin persistir sesión', all(x in store for x in ['persistSession:false','autoRefreshToken:false','detectSessionInUrl:false']))
check('Carrito revalida por lote', "rpc('get_public_cart_state'" in store and 'revalidateItems' in cart)
check('Storage local protegido', 'try{store.setItem' in text(PUBLIC/'assets/js/storage.js') and 'catch{return false}' in text(PUBLIC/'assets/js/storage.js'))
check('Imagen carrito restringida', '/\\.supabase\\.co$/i' in cart and 'u.origin===location.origin' in cart)
check('Supabase self-hosted por build', 'cdn.jsdelivr.net' not in '\n'.join(text(p) for p in PUBLIC.rglob('*') if p.is_file() and p.suffix in {'.html','.js'}) and 'assets/vendor/supabase-' in build)
pkg=json.loads(text(ROOT/'package.json')); check('Supabase fijado 2.117.2', pkg['dependencies'].get('@supabase/supabase-js')=='2.117.2')
check('Producción distingue CF_PAGES_BRANCH', 'CF_PAGES_BRANCH' in build and 'isProduction' in build and 'falta SITE_URL' in build)
check('robots no revela /admin/', 'Disallow: /admin/' not in build)
check('CSP sin unsafe-inline', "'unsafe-inline'" not in text(PUBLIC/'_headers'))
check('HTML sin style inline', not any(re.search(r'\sstyle\s*=',text(p),re.I) for p in PUBLIC.rglob('*.html')))
check('Admin sin alert/confirm nativos', not re.search(r'\b(?:alert|confirm)\s*\(',adminjs))
check('Admin usa toasts/diálogo', 'notify(' in adminjs and 'askConfirm(' in adminjs)
check('Admin categoría dinámica', 'data-view-panel="categories"' in text(PUBLIC/'admin/index.html') and 'openCategoryEditor' in adminjs and "from('category_attributes')" in adminjs)
check('Admin avisa conservación de alias', 'quedará guardada como alias' in adminjs and 'quedará guardado como alias' in adminjs)

# Design
check('Verde AA', contrast('#0b7a3e','#ffffff')>=4.5, f'{contrast("#0b7a3e","#ffffff"):.2f}')
check('Rojo sobre navy AA', contrast('#ff4d5e','#061626')>=4.5, f'{contrast("#ff4d5e","#061626"):.2f}')
check('Rojo botón/blanco AA', contrast('#d7192d','#ffffff')>=4.5, f'{contrast("#d7192d","#ffffff"):.2f}')
check('Táctiles >=44px presentes', 'min-height:44px' in css or 'height:44px' in css)
check('Filtro renombrado Edad / nivel', 'Edad / nivel' in adminjs or 'Edad / nivel' in text(MIG/'001_stage1_dynamic_catalog.sql'))

# Stage 2 B1/B2/B3
check('Barra móvil 5 items', all(x in build for x in ['Inicio</span>','Categorías</span>','Pedido</span>','Favoritos</span>','Tallas</span>']))
check('Favoritos implementados', (PUBLIC/'favoritos.html').exists() and (PUBLIC/'assets/js/favorites.js').exists() and (PUBLIC/'assets/js/favorites-page.js').exists())
check('Categorías móviles desde BD', 'renderCategorySheet' in ui and 'loadCatalogBundle' in ui)
check('aria-current móvil', "setAttribute('aria-current','page')" in ui)
check('WhatsApp flotante 56px', 'floating-whatsapp' in css and 'width:56px' in css and 'height:56px' in css)
check('WhatsApp usa config', 'cfg.whatsappE164' in ui and '584120354375' not in ui)
check('WhatsApp contextual ficha', 'setWhatsappContext' in product and 'setWhatsappContext' in ui)
soft=PUBLIC/'assets/icons/softball.svg'; check('Softball SVG <3KB', soft.exists() and soft.stat().st_size<3072)
check('Softball amarilla', soft.exists() and ('#f6e94b' in text(soft) or '#F6E94B' in text(soft)))
check('Loader 350ms / 400ms / 12s', all(x in ui for x in ['350','elapsed<400','12000']))
check('withLoader expuesto', 'window.BattingUI' in ui and 'withLoader' in ui)
check('Reduced motion loader', 'prefers-reduced-motion:reduce' in css and 'softball-pulse' in css)

# Stage 2 B4 / SQL
sql1=text(MIG/'001_stage1_dynamic_catalog.sql'); sql2=text(MIG/'002_stage2_categories_pelotas.sql'); sql3=text(MIG/'003_stage3_slug_aliases.sql'); schema=sql1+'\n'+sql2+'\n'+sql3
check('Pelotas sembrada inactiva', "values('pelotas'" in sql2 and '60,false,false' in sql2)
check('Pelotas atributos', all(k in sql2 for k in ["'tipo'","'tamano'","'material'","'presentacion'"]))
check('Presentación scope variant', "'variant',true,true,false,40" in sql2)
check('display_name color agregado', 'add column if not exists display_name' in sql2)
check('Validación categoría/atributos', 'validate_category_attribute_payload' in sql2 and 'validate_product_publication' in sql2)
check('Máximo 6 destacados', 'limit_featured_products' in sql2 and '>=6' in sql2)
check('RPC catálogo Stage2', 'create or replace function public.get_public_catalog()' in sql2)
check('RPC producto resuelve alias', 'create or replace function public.get_public_product' in sql3 and 'product_slug_aliases' in sql3)
check('RPC carrito por lote', 'create or replace function public.get_public_cart_state' in sql2)
check('Public RPC no expone code/cost/stock/SKU', all(t not in re.search(r'create or replace function public\.build_public_product.*?\$\$;',sql2,re.S|re.I).group(0).lower() for t in ["'code'","'cost'","'stock'","'provider_sku'"]))
check('Categorías dinámicas frontend', 'visibleCategories' in text(PUBLIC/'assets/js/index.js') and 'showOnHome' in text(PUBLIC/'assets/js/index.js'))
check('Filtros dinámicos catálogo', 'dynamicFilters' in catalog and 'category?.attributes' in catalog)
check('Búsqueda atributos/keywords', 'searchKeywords' in store and 'flattenAttributeValues(product.attributes)' in store)
check('URL limpia de producto', '/producto/${encodeURIComponent' in store and '/producto/?slug=' not in store)
check('Worker OG dinámico', 'HTMLRewriter' in build and 'productFromSupabase' in build and 'og:image' in build)
check('Worker fallback HTML si Supabase falla', 'catch{return secured(base' in build)
check('URL legacy ?slug redirige a limpia', "u.pathname==='/producto/'&&u.searchParams.get('slug')" in build)
check('Estado Próximamente', 'PRÓXIMAMENTE' in text(PUBLIC/'assets/js/index.js') and 'PRÓXIMAMENTE' in catalog)

# Stage 3
check('Alias de categoría incluidos en catálogo', "'aliases'" in sql3 and 'category_slug_aliases' in sql3)
check('Catálogo normaliza alias de categoría', 'c.aliases.includes(requestedCategory)' in catalog)
check('CSV valida atributos contra categoría', 'attrsForCategory(cat.id' in adminjs and 'no existe en la categoría' in adminjs)
check('CSV importa siempre borrador', "status:'draft'" in adminjs)
check('CSV soporta precio por variante', 'sale_price' in adminjs and 'salePrice' in sql2)
check('Plantilla dinámica generada desde atributos', 'downloadCsvTemplate' in adminjs and 'csvAttributeColumns' in adminjs)

# JS syntax
for js in sorted(PUBLIC.rglob('*.js'))+[ROOT/'build.mjs']:
    proc=subprocess.run(['node','--check',str(js)],capture_output=True,text=True)
    check(f'JS syntax {js.relative_to(ROOT)}',proc.returncode==0,proc.stderr.strip())

# Build behavior with local vendor fixture (no network dependency in test runtime)
vendor=ROOT/'node_modules/@supabase/supabase-js/dist/umd/supabase.js'; vendor.parent.mkdir(parents=True,exist_ok=True); vendor.write_text("window.supabase={createClient:function(){return {}}};\n",encoding='utf-8')
base=os.environ.copy(); base.update({'SUPABASE_URL':'https://example.supabase.co','SUPABASE_ANON_KEY':'public-test-key','SKIP_SITEMAP_API':'1'})
preview=base.copy(); preview.update({'CF_PAGES_BRANCH':'feature-stage3','CF_PAGES_URL':'https://stage3.pages.dev'}); preview.pop('SITE_URL',None)
p=subprocess.run(['node','build.mjs'],cwd=ROOT,env=preview,capture_output=True,text=True)
check('Preview build sin SITE_URL',p.returncode==0,(p.stdout+p.stderr).strip())
if p.returncode==0:
    files=[x for x in DIST.rglob('*') if x.is_file()]
    check('dist sin privados',not any(x.suffix=='.sql' or '/private/' in x.as_posix() or '/tests/' in x.as_posix() or x.name=='private-seed.csv' for x in files))
    check('Vendor local en dist',(DIST/'assets/vendor/supabase-2.117.2.js').exists())
    check('Cloudflare worker generado',(DIST/'_worker.js').exists() and 'HTMLRewriter' in text(DIST/'_worker.js'))
    check('Footer/manifest en páginas',all('id="contacto"' in text(DIST/q) and 'rel="manifest"' in text(DIST/q) for q in ['index.html','catalogo.html','producto/index.html','tallas.html','favoritos.html']))
    check('Preview noindex','Disallow: /' in text(DIST/'robots.txt'))
    check('Build no style inline',not any(re.search(r'\sstyle\s*=',text(x),re.I) for x in DIST.rglob('*.html')))
prod=base.copy(); prod.update({'CF_PAGES_BRANCH':'main','CF_PAGES_URL':'https://shop.pages.dev'}); prod.pop('SITE_URL',None)
p2=subprocess.run(['node','build.mjs'],cwd=ROOT,env=prod,capture_output=True,text=True)
check('Producción bloquea SITE_URL faltante',p2.returncode!=0 and 'falta SITE_URL' in (p2.stdout+p2.stderr))
prod['SITE_URL']='https://shop.example.com'; p3=subprocess.run(['node','build.mjs'],cwd=ROOT,env=prod,capture_output=True,text=True)
check('Producción con SITE_URL construye',p3.returncode==0,(p3.stdout+p3.stderr).strip())
if p3.returncode==0:
    check('robots producción no revela admin','/admin/' not in text(DIST/'robots.txt'))
    check('sitemap dominio final','https://shop.example.com/' in text(DIST/'sitemap.xml'))
    check('sitemap base contiene favoritos','/favoritos.html' in text(DIST/'sitemap.xml'))
bad=base.copy(); bad.update({'SITE_URL':'https://shop.example.com','SUPABASE_URL':'https://evil.example.com'})
p4=subprocess.run(['node','build.mjs'],cwd=ROOT,env=bad,capture_output=True,text=True)
check('Build rechaza SUPABASE_URL externo',p4.returncode!=0 and 'SUPABASE_URL' in (p4.stdout+p4.stderr))

shutil.rmtree(ROOT/'node_modules',ignore_errors=True); shutil.rmtree(DIST,ignore_errors=True)
print('Batting Shop V4 Stage 3 — verificación estática/build')
print('='*58)
for name,passed,detail in checks: print(('PASS' if passed else 'FAIL'),name,(f'— {detail}' if detail and not passed else ''))
print(f'\n{sum(1 for _,p,_ in checks if p)}/{len(checks)} checks passed')
if failures:
    print('\nFallos:')
    for name,detail in failures: print('-',name,detail)
    sys.exit(1)
