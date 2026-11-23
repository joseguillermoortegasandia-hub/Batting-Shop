import {fingerprintAssets} from './private/scripts/fingerprint-assets.mjs';
import {optimizeStore} from './private/scripts/optimize-store.mjs';
import {cp,rm,mkdir,readFile,writeFile,readdir,stat} from 'node:fs/promises';
import {join,extname,basename} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('.',import.meta.url));
const source=join(root,'public'),output=join(root,process.env.BS_OUTPUT_DIR||'dist');
if(process.env.BS_OUTPUT_DIR&&!/^artifacts[\\/][a-zA-Z0-9_\\/-]+$/.test(process.env.BS_OUTPUT_DIR))throw new Error('BS_OUTPUT_DIR debe estar dentro de artifacts/');
const siteUrlInput=String(process.env.SITE_URL||'').trim().replace(/\/+$/,'');
const cfPagesUrl=String(process.env.CF_PAGES_URL||'').trim().replace(/\/+$/,'');
const cfBranch=String(process.env.CF_PAGES_BRANCH||'').trim();
const productionBranch=String(process.env.PRODUCTION_BRANCH||'main').trim();
const isGitHubPages=process.env.BS_HOSTING==='github-pages';
const isCloudflare=Boolean(cfBranch||cfPagesUrl),isProduction=isCloudflare&&cfBranch===productionBranch;
const siteUrl=siteUrlInput||(cfPagesUrl||'http://localhost:8080');
const supabaseUrl=String(process.env.SUPABASE_URL||'').trim().replace(/\/+$/,'');
const supabaseAnonKey=String(process.env.SUPABASE_ANON_KEY||'').trim();
const noindex=process.env.NOINDEX==='1'||(isCloudflare&&!isProduction);
const imageVariants=JSON.parse(await readFile(join(source,'data/image-variants.json'),'utf8'));
const isRemote=/^https:\/\//i.test(siteUrl);

function fail(message){console.error(`Build bloqueado: ${message}`);process.exit(1)}
function warn(message){console.warn(`Aviso: ${message}`)}
function validSupabaseUrl(value){return /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(value)}
function isForbiddenFrontendKey(key){const value=String(key||'').trim();if(!value)return false;if(value.startsWith('sb_secret_'))return true;const parts=value.split('.');if(parts.length===3){try{const payload=JSON.parse(Buffer.from(parts[1].replace(/-/g,'+').replace(/_/g,'/'),'base64').toString('utf8'));if(payload?.role==='service_role')return true}catch{}}return false}
function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}
function safeReplacement(value){return String(value).replaceAll('\\','\\\\').replaceAll("'","\\'")}
function absolute(path){return `${siteUrl}${path.startsWith('/')?'':'/'}${path}`}
async function walk(dir){const out=[];for(const name of await readdir(dir)){const full=join(dir,name),s=await stat(full);if(s.isDirectory())out.push(...await walk(full));else out.push(full)}return out}

// La publicación remota requiere un origen HTTPS válido, sin rutas ni credenciales.
try{
 const origin=new URL(siteUrl);
 if(origin.username||origin.password||(!isGitHubPages&&origin.pathname!=='/')||origin.search||origin.hash)fail('SITE_URL debe contener únicamente el origen, sin ruta, parámetros ni credenciales (GitHub Pages admite la ruta del repositorio).');
 if(isGitHubPages&&!/^\/(?:[a-zA-Z0-9_-]+\/?)?$/.test(origin.pathname))fail('Ruta de repositorio inválida para GitHub Pages.');
 if(isCloudflare&&origin.protocol!=='https:')fail('Cloudflare Pages requiere SITE_URL/CF_PAGES_URL con HTTPS.');
 if(!isCloudflare&&origin.protocol!=='https:'&&!(origin.protocol==='http:'&&['localhost','127.0.0.1'].includes(origin.hostname)))fail('Usa HTTPS o localhost para SITE_URL.');
}catch{fail('SITE_URL/CF_PAGES_URL no es una URL válida.')}

if(isProduction&&!siteUrlInput)fail(`CF_PAGES_BRANCH=${cfBranch} coincide con la rama de producción (${productionBranch}) pero falta SITE_URL. Los previews pueden usar CF_PAGES_URL.`);
if(isCloudflare&&!isProduction&&!siteUrlInput)warn(`preview de Cloudflare: canonical/sitemap usarán temporalmente ${cfPagesUrl||siteUrl}. En producción define SITE_URL.`);
if(supabaseUrl&&!validSupabaseUrl(supabaseUrl))fail('SUPABASE_URL debe tener el formato https://<proyecto>.supabase.co.');
if(isRemote&&(!supabaseUrl||!supabaseAnonKey))fail('un despliegue remoto necesita SUPABASE_URL y SUPABASE_ANON_KEY.');
if(isForbiddenFrontendKey(supabaseAnonKey))fail('SUPABASE_ANON_KEY parece una clave secreta/service_role. Usa únicamente la anon/publishable key pública.');


const pages={
  'index.html':{title:'Batting Shop | Guantines y accesorios de béisbol',description:'Guantines de bateo y accesorios originales. Envíos a toda Venezuela y atención directa por WhatsApp.',canonical:'/',script:'/assets/js/index.js'},
  'catalogo.html':{title:'Catálogo | Batting Shop',description:'Explora los productos disponibles en Batting Shop.',canonical:'/catalogo.html',script:'/assets/js/catalog.js'},
  'producto/index.html':{title:'Producto | Batting Shop',description:'Consulta disponibilidad, variantes y detalles de productos Batting Shop.',canonical:'/producto/',script:'/assets/js/product.js'},
  'tallas.html':{title:'Guía de tallas | Batting Shop',description:'Guía de tallas por marca para guantines de bateo.',canonical:'/tallas.html',script:'/assets/js/sizeguide.js'},
  'favoritos.html':{title:'Favoritos | Batting Shop',description:'Tus productos favoritos de Batting Shop guardados en este dispositivo.',canonical:'/favoritos.html',script:'/assets/js/favorites-page.js'},
  '404.html':{title:'Página no encontrada | Batting Shop',description:'No encontramos la página solicitada.',canonical:'/404.html',script:null}
};
function sharedHead(meta){const canonical=absolute(meta.canonical),og=absolute('/assets/images/og-cover.jpg');return `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${escapeHtml(meta.title)}</title><meta name="description" content="${escapeHtml(meta.description)}"><meta name="theme-color" content="#061626"><meta name="robots" content="${noindex?'noindex,nofollow':'index,follow'}"><link rel="canonical" href="${escapeHtml(canonical)}"><meta property="og:type" content="website"><meta property="og:site_name" content="Batting Shop"><meta property="og:title" content="${escapeHtml(meta.title)}"><meta property="og:description" content="${escapeHtml(meta.description)}"><meta property="og:url" content="${escapeHtml(canonical)}"><meta property="og:image" content="${escapeHtml(og)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escapeHtml(meta.title)}"><meta name="twitter:description" content="${escapeHtml(meta.description)}"><meta name="twitter:image" content="${escapeHtml(og)}"><link rel="icon" type="image/png" sizes="32x32" href="/assets/images/favicon-32.png"><link rel="apple-touch-icon" href="/assets/images/apple-touch-icon.png"><link rel="manifest" href="/manifest.webmanifest">${supabaseUrl?`<link rel="preconnect" href="${escapeHtml(supabaseUrl)}" crossorigin>`:''}<link rel="stylesheet" href="/assets/css/store.css">`}

const chrome=`<header class="site-header"><div class="header-inner"><button class="icon-button menu-mobile" type="button" data-open-menu aria-label="Abrir menú"><img src="/assets/icons/menu.svg" alt=""></button><a href="/" aria-label="Batting Shop - Inicio"><img class="brand-logo" src="/assets/images/logo-small.webp" alt="Batting Shop"></a><nav class="desktop-nav" aria-label="Navegación principal"><a href="/tallas.html">Tallas</a><a href="/catalogo.html">Catálogo</a><a href="/">Inicio</a><a href="/favoritos.html">Favoritos</a><a href="/#contacto">Contacto</a></nav><div class="header-actions"><a class="icon-button header-search" href="/catalogo.html" aria-label="Buscar productos"><img src="/assets/icons/search.svg" alt=""></a><button class="icon-button header-cart-button" type="button" data-open-cart aria-label="Abrir pedido"><img src="/assets/icons/cart.svg" alt=""><span class="cart-count" data-cart-count hidden>0</span></button></div></div></header>
<div class="drawer" id="menuDrawer" aria-hidden="true"><div class="drawer-backdrop"></div><aside class="drawer-panel" aria-label="Menú principal"><div class="drawer-head"><img src="/assets/images/logo-small.webp" alt="Batting Shop"><button class="icon-button" type="button" data-close-menu aria-label="Cerrar menú"><img src="/assets/icons/close.svg" alt=""></button></div><nav><a href="/">Inicio</a><a href="/catalogo.html">Catálogo</a><button class="drawer-category-button" type="button" data-open-categories>Categorías</button><a href="/favoritos.html">Favoritos</a><a href="/tallas.html">Guía de tallas</a><a href="/#contacto">Contacto</a></nav><div class="drawer-contact"><a data-config-href="instagram" target="_blank" rel="noopener"><span data-config-text="instagram"></span></a><a data-config-href="whatsapp" target="_blank" rel="noopener"><span data-config-text="whatsapp"></span></a><span data-config-text="location"></span><span data-config-text="shipping"></span></div></aside></div>
<div class="category-sheet" id="categorySheet" aria-hidden="true"><div class="drawer-backdrop"></div><aside class="category-sheet-panel" aria-label="Categorías"><div class="cart-head"><strong>Categorías</strong><button class="icon-button light-on-white" type="button" data-close-categories aria-label="Cerrar categorías"><img src="/assets/icons/close.svg" alt=""></button></div><div class="mobile-category-list" id="mobileCategoryList"></div></aside></div>
<div class="cart-drawer" id="cartDrawer" aria-hidden="true"><div class="drawer-backdrop"></div><aside class="cart-panel" aria-label="Mi pedido"><div class="cart-head"><strong>Mi pedido</strong><button class="icon-button light-on-white" type="button" data-close-cart aria-label="Cerrar pedido"><img src="/assets/icons/close.svg" alt=""></button></div><p id="cartNotice" class="cart-notice" role="status" hidden></p><div class="cart-items" id="cartItems"></div><div class="cart-footer"><div class="cart-total"><span>Total</span><strong id="cartTotal">—</strong></div><a class="btn whatsapp cart-whatsapp" id="cartWhatsapp" href="#"><img src="/assets/icons/whatsapp.svg" alt="">Enviar pedido por WhatsApp</a></div></aside></div>
<nav class="mobile-tabbar" aria-label="Navegación móvil"><a href="/" data-mobile-nav="home"><img src="/assets/icons/home.svg" alt=""><span>Inicio</span></a><button type="button" data-open-categories data-mobile-nav="categories"><img src="/assets/icons/categories.svg" alt=""><span>Categorías</span></button><button class="mobile-order-button" type="button" data-open-cart data-mobile-nav="order" aria-label="Abrir pedido"><span class="mobile-order-circle"><img src="/assets/icons/order.svg" alt=""><span class="cart-count" data-cart-count hidden>0</span></span><span>Pedido</span></button><a href="/favoritos.html" data-mobile-nav="favorites"><img src="/assets/icons/heart.svg" alt=""><span>Favoritos</span><span class="favorite-count" data-favorite-count hidden>0</span></a><a href="/tallas.html" data-mobile-nav="sizes"><img src="/assets/icons/ruler.svg" alt=""><span>Tallas</span></a></nav>
<a class="floating-whatsapp" id="floatingWhatsapp" href="#" target="_blank" rel="noopener" aria-label="Contactar Batting Shop por WhatsApp"><img src="/assets/icons/whatsapp.svg" alt=""></a>
<div class="global-loader" id="globalLoader" role="status" aria-live="polite" aria-hidden="true" hidden><div class="loader-card"><img class="loader-logo" src="/assets/images/logo-small.webp" width="150" height="100" alt="Batting Shop"><div id="loaderState"><div class="softball-track"><img src="/assets/icons/softball.svg" alt=""></div><strong>Cargando…</strong></div><div id="loaderError" hidden><strong>No pudimos completar la carga</strong><p>Revisa tu conexión e inténtalo otra vez.</p><a class="btn whatsapp" href="https://wa.me/584120354375">Escríbenos por WhatsApp</a><button class="btn primary" id="loaderRetry" type="button">Reintentar</button></div></div></div>`;
const footer=`<footer class="site-footer" id="contacto"><div class="footer-inner"><div class="footer-brand"><img src="/assets/images/logo-small.webp" alt="Batting Shop"><p>Guantines de bateo y accesorios originales. Atención directa, delivery en Maracaibo y envíos a toda Venezuela.</p></div><div class="footer-links"><strong>Contacto</strong><a data-config-href="instagram" target="_blank" rel="noopener"><span data-config-text="instagram"></span></a><a data-config-href="whatsapp" target="_blank" rel="noopener"><span data-config-text="whatsapp"></span></a><span data-config-text="location"></span><span data-config-text="shipping"></span></div><div><strong>Métodos de pago</strong><div class="payments"><span class="pay-pill">Zelle</span><span class="pay-pill">Binance</span><span class="pay-pill">Pago Móvil</span></div></div><div class="footer-links"><strong>Explora</strong><a href="/catalogo.html">Catálogo</a><a href="/favoritos.html">Favoritos</a><a href="/tallas.html">Guía de tallas</a><a href="/#contacto">Contacto</a></div></div></footer>`;
function scripts(meta){const guides=['/assets/js/product.js','/assets/js/sizeguide.js'].includes(meta.script)?'<script src="/assets/js/size-guide-shared.js" defer></script>':'';return `<script src="/assets/js/config.js" defer></script><script src="/assets/js/storefront.js" defer></script>${guides}${meta.script?`<script src="${meta.script}" defer></script>`:''}`}

await rm(output,{recursive:true,force:true});await mkdir(output,{recursive:true});await cp(source,output,{recursive:true});
for(const [rel,meta] of Object.entries(pages)){const file=join(output,rel);let html=await readFile(file,'utf8');html=html.replace('<!--BS_HEAD-->',sharedHead(meta)).replace('<!--BS_CHROME-->',chrome).replace('<!--BS_FOOTER-->',footer).replace('<!--BS_SCRIPTS-->',scripts(meta));await writeFile(file,html)}
const textExts=new Set(['.html','.js','.css','.json','.webmanifest','.txt','.xml','.svg']);for(const file of await walk(output)){const ext=extname(file).toLowerCase();if(!textExts.has(ext)&&basename(file)!=='_headers')continue;let content=await readFile(file,'utf8');content=content.replaceAll('__IMAGE_OVERRIDES__',JSON.stringify(imageVariants.overrides)).replaceAll('__RESPONSIVE_IMAGES__',JSON.stringify(imageVariants.responsive)).replaceAll('__SITE_URL__',siteUrl).replaceAll('__SUPABASE_URL__',safeReplacement(supabaseUrl)).replaceAll('__SUPABASE_ANON_KEY__',safeReplacement(supabaseAnonKey));await writeFile(file,content)}

async function publicSitemapEntries(){const entries=new Set(['/','/catalogo.html','/tallas.html','/favoritos.html']);if(process.env.SKIP_SITEMAP_API==='1'||!supabaseUrl||!supabaseAnonKey)return entries;try{const res=await fetch(`${supabaseUrl}/rest/v1/rpc/get_public_catalog`,{method:'POST',headers:{apikey:supabaseAnonKey,...(supabaseAnonKey.startsWith('eyJ')?{Authorization:`Bearer ${supabaseAnonKey}`}:{ }),'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(6000)});if(!res.ok)throw new Error(`HTTP ${res.status}`);const data=await res.json();for(const c of Array.isArray(data?.categories)?data.categories:[])if(c?.slug)entries.add(`/catalogo.html?categoria=${encodeURIComponent(c.slug)}`);for(const p of Array.isArray(data?.products)?data.products:[])if(p?.slug)entries.add(`/producto/${encodeURIComponent(p.slug)}/`)}catch(error){warn(`no se pudo enriquecer el sitemap desde Supabase (${error.message}). Se generó el sitemap base.`)}return entries}
const robots=noindex?`User-agent: *\nDisallow: /\n`:`User-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap.xml\n`;await writeFile(join(output,'robots.txt'),robots);const sitemapEntries=await publicSitemapEntries();const sitemap=`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...sitemapEntries].map(path=>`  <url><loc>${escapeHtml(absolute(path))}</loc></url>`).join('\n')}\n</urlset>\n`;await writeFile(join(output,'sitemap.xml'),sitemap);

const cspOrigin=supabaseUrl?new URL(supabaseUrl).origin:'';
const csp=`default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob: ${cspOrigin}; connect-src 'self' ${cspOrigin}; font-src 'self'; manifest-src 'self'; upgrade-insecure-requests`;
const worker=(await readFile(join(root,'private/worker.mjs'),'utf8')).replace('__BUILD_CSP__',JSON.stringify(csp)).replace('__BUILD_NOINDEX__',String(noindex));
const headersFile=join(output,'_headers');await writeFile(headersFile,(await readFile(headersFile,'utf8')).replaceAll('__SUPABASE_ORIGIN__',cspOrigin));
await writeFile(join(output,'_worker.js'),worker);

const forbiddenBasenames=new Set(['private-seed.csv','seed.sql','schema.sql','TEST_REPORT.md','SECURITY.md','IMPLEMENTED.md','IMAGE_ASSETS.md','verify.py']);const deployed=await walk(output);const leaks=deployed.filter(file=>forbiddenBasenames.has(basename(file))||file.includes('/private/')||file.includes('/tests/')||file.endsWith('.sql'));if(leaks.length)fail(`se detectaron archivos privados en dist: ${leaks.join(', ')}`);
if(deployed.some(file=>/\/(?:admin|panel)\//i.test(file.slice(output.length).replaceAll('\\','/'))))fail('Archivos privados fuera de su salida separada.');
for(const file of deployed){if(!textExts.has(extname(file).toLowerCase())&&basename(file)!=='_headers'&&basename(file)!=='_worker.js')continue;const content=await readFile(file,'utf8');if(/(?:\badmin\b|supabase-js|createClient|admin_users)/i.test(content))fail('Referencia privada en la salida pública: '+file);if(/__(SITE_URL|SUPABASE_URL|SUPABASE_ANON_KEY)__/.test(content))fail(`placeholder sin reemplazar en ${file}`);if(/https:\/\/battingshop\.ve(?:\/|\b)/i.test(content))fail(`dominio hardcodeado en ${file}`);if(/\sstyle\s*=\s*["']/i.test(content))fail(`CSP estricta: todavía existe style= inline en ${file}`);if(/cdn\.jsdelivr\.net/i.test(content))fail(`dependencia CDN detectada en ${file}`)}
console.log(`Batting Shop V4 Final listo en dist/ para ${siteUrl}`);console.log(`Rama: ${cfBranch||'local'} · producción: ${isProduction?'sí':'no'} · noindex: ${noindex?'sí':'no'}`);console.log('La salida pública contiene únicamente la tienda.');

if(isGitHubPages){
  // Pages sirve archivos: no ejecuta el Worker ni aplica _headers/_routes.json.
  for(const name of ['_worker.js','_headers','_routes.json'])await rm(join(output,name),{force:true});
  await writeFile(join(output,'.nojekyll'),'');
  const basePath=new URL(siteUrl).pathname.replace(/\/$/,'');
  const rootPaths=/(["'`])\/(assets\/|data\/|producto\/|catalogo\.html|favoritos\.html|tallas\.html|manifest\.webmanifest)/g;
  for(const file of await walk(output)){
    if(!textExts.has(extname(file).toLowerCase()))continue;
    let content=await readFile(file,'utf8');
    if(file===join(output,'assets/js/config.js'))content=content.replace('staticHosting: false','staticHosting: true');
    if(file.endsWith('.html')){
      const metaCsp=csp.replace(/frame-ancestors 'none'; /,'');
      content=content.replace('<meta charset="utf-8">',`<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${escapeHtml(metaCsp)}">`);
      content=content.replace(/href="\/(#?[^"]*)"/g,(match,tail)=>tail===''||tail.startsWith('#')?`href="${basePath}/${tail}"`:match);
    }
    content=content.replace(rootPaths,(_,quote,path)=>`${quote}${basePath}/${path}`);
    if(file.endsWith('.webmanifest'))content=content.replace('"start_url": "/"',`"start_url": "${basePath}/"`);
    // El sitemap debe abrir fichas existentes en un host sin reescrituras.
    if(file.endsWith('sitemap.xml'))content=content.replace(/\/producto\/([a-z0-9-]+)\//g,'/producto/?slug=$1');
    await writeFile(file,content);
  }
  console.log(`Salida estática para GitHub Pages: ${siteUrl}/ (fichas por ?slug=).`);
}
await optimizeStore(output);
await fingerprintAssets(output,isGitHubPages?new URL(siteUrl).pathname.replace(/\/$/,''):'');
