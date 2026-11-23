// El build inserta solo el origen público y la política CSP; nunca credenciales secretas.
const CSP = __BUILD_CSP__;
const NOINDEX = __BUILD_NOINDEX__;
function secured(response) {
  const headers = new Headers(response.headers);
  headers.set('Content-Security-Policy', CSP);
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Strict-Transport-Security', 'max-age=31536000');
  if (NOINDEX) headers.set('X-Robots-Tag', 'noindex, nofollow');
  return new Response(response.body, {status: response.status, headers});
}
async function productFromSupabase(env, slug, origin) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return null;
  const cache = globalThis.caches?.default;
  const key = new Request(`${origin}/__product-cache/${encodeURIComponent(env.SUPABASE_URL)}/${encodeURIComponent(slug)}`);
  const hit = await cache?.match(key);
  if (hit) return hit.json();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(`${env.SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/rpc/get_public_product`, {
      method: 'POST', signal: controller.signal,
      headers: {apikey: env.SUPABASE_ANON_KEY, ...(env.SUPABASE_ANON_KEY.startsWith('eyJ')?{Authorization:`Bearer ${env.SUPABASE_ANON_KEY}`}:{ }), 'Content-Type': 'application/json'},
      body: JSON.stringify({p_slug: slug})
    });
    if (!response.ok) throw new Error(`Supabase ${response.status}`);
    const product = await response.json();
    if (product) await cache?.put(key, new Response(JSON.stringify(product), {headers: {'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60'}}));
    return product;
  } finally { clearTimeout(timeout); }
}
async function productHtml(request, env, slug) {
  const url = new URL(request.url);
  let base = await env.ASSETS.fetch(new Request(new URL('/producto/', url), {method:'GET'}));
  if (base.status >= 300 && base.status < 400) {
    const next = new URL(base.headers.get('Location') || '/producto/', url);
    if (next.origin !== url.origin) return secured(new Response('Redirección de asset inválida', {status:502}));
    base = await env.ASSETS.fetch(new Request(next, {method:'GET'}));
  }
  if (base.status >= 300 && base.status < 400) return secured(new Response('No se pudo cargar la ficha', {status:502}));
  let product;
  try { product = await productFromSupabase(env, slug, url.origin); }
  catch { return secured(base); }
  if (!product) return secured(base);
  const canonical = new URL(`/producto/${encodeURIComponent(product.slug)}/`, url.origin).href;
  if (product.slug !== slug) {
    const target = new URL(canonical);
    if (url.searchParams.get('color')) target.searchParams.set('color', url.searchParams.get('color'));
    return secured(Response.redirect(target.href, 301));
  }
  const title = `${product.name} | Batting Shop`;
  const description = String(product.description || 'Consulta disponibilidad en Batting Shop.').slice(0, 220);
  const images = [...(product.images || []), ...(product.colors || []).flatMap(c => c.images || [])];
  const image = images.find(i => i.ogStoragePath)?.ogStoragePath;
  // Imágenes legacy sin JPG confirmado usan la portada JPG; nunca se inventa una URL.
  const ogImage = image ? `${env.SUPABASE_URL}/storage/v1/object/public/product-images/${image.split('/').map(encodeURIComponent).join('/')}` : new URL('/assets/images/og-cover-v2.jpg', url.origin).href;
  const values = {'og:title':title, 'og:description':description, 'og:url':canonical, 'og:image':ogImage};
  let rewriter = new HTMLRewriter().on('title', {element(e){e.setInnerContent(title)}})
    .on('meta[name="description"]', {element(e){e.setAttribute('content',description)}})
    .on('link[rel="canonical"]', {element(e){e.setAttribute('href',canonical)}});
  for (const [name,value] of Object.entries(values)) rewriter = rewriter.on(`meta[property="${name}"]`, {element(e){e.setAttribute('content',value)}});
  for (const [name,value] of [['title',title],['description',description],['image',ogImage]]) rewriter = rewriter.on(`meta[name="twitter:${name}"]`, {element(e){e.setAttribute('content',value)}});
  return secured(rewriter.transform(base));
}
export default {async fetch(request, env) {
  const url = new URL(request.url);
  if (url.pathname === '/producto/' && url.searchParams.get('slug')) {
    const target = new URL(`/producto/${encodeURIComponent(url.searchParams.get('slug'))}/`, url.origin);
    if (url.searchParams.get('color')) target.searchParams.set('color',url.searchParams.get('color'));
    return secured(Response.redirect(target.href,301));
  }
  const match = url.pathname.match(/^\/producto\/([^/]+)\/?$/);
  if (match && match[1] !== 'index.html') {
    let slug;try {slug=decodeURIComponent(match[1]);}catch{return new Response('Slug inválido',{status:400})}
    if (!/^[a-z0-9-]{1,160}$/.test(slug)) return new Response('Slug inválido',{status:400});
    return productHtml(request,env,slug);
  }
  return secured(await env.ASSETS.fetch(request));
}};
