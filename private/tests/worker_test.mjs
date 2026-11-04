import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(process.argv[2],'utf8');
const {default:worker}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
// Adaptador local del contrato HTMLRewriter: no sustituye Cloudflare real.
globalThis.HTMLRewriter=class {
 handlers=[];on(selector,handler){this.handlers.push([selector,handler]);return this}
 transform(response){const handlers=this.handlers;return new Response(new ReadableStream({async start(controller){let html=await response.text();for(const [selector,handler] of handlers){let value,attr;handler.element({setInnerContent(v){value=v},setAttribute(k,v){attr=k;value=v}});if(selector==='title')html=html.replace(/<title>.*?<\/title>/,`<title>${value}</title>`);else{const m=selector.match(/^(\w+)\[(\w+)="([^"]+)"\]$/);if(m){const pattern=new RegExp(`<${m[1]}[^>]*${m[2]}="${m[3]}"[^>]*>`);html=html.replace(pattern,tag=>tag.replace(new RegExp(`${attr}="[^"]*"`),`${attr}="${value}"`))}}}controller.enqueue(new TextEncoder().encode(html));controller.close()}}),response)}
};
const store=new Map();globalThis.caches={default:{async match(k){return store.get(k.url)?.clone()},async put(k,v){assert.match(v.headers.get('Cache-Control'),/max-age=60/);store.set(k.url,v)}}};
const html='<title>Producto</title><meta property="og:title" content="Producto"><meta property="og:url" content=""><meta property="og:image" content=""><meta name="description" content=""><link rel="canonical" href="">';
let calls=0,mode='ok',redirect=false;const assetPaths=[];
const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'test',ASSETS:{async fetch(req){const path=new URL(req.url).pathname;assetPaths.push(path);assert.notEqual(path,'/producto/index.html');if(redirect&&path==='/producto/')return Response.redirect('https://shop.example.com/template/',308);return new Response(html,{headers:{'Content-Type':'text/html'}})}}};
globalThis.fetch=async(_url,options)=>{calls++;if(mode==='fail')throw new Error('offline');if(mode==='timeout')return new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('timeout'))));return Response.json({slug:mode==='alias'?'canonical':'guante',name:'Guante Franklin',description:'Bateo',images:[{ogStoragePath:'photo.og.jpg'}]})};
const request=()=>new Request('https://shop.example.com/producto/guante/?color=Negro&utm_source=test');
let response=await worker.fetch(request(),env),body=await response.text();assert.equal(response.status,200);assert.match(body,/<title>Guante Franklin \| Batting Shop<\/title>/);assert.match(body,/property="og:title" content="Guante Franklin \| Batting Shop"/);assert.match(body,/og:url" content="https:\/\/shop.example.com\/producto\/guante\/"/);assert.match(body,/photo.og.jpg/);
await worker.fetch(request(),env);assert.equal(calls,1,'cache por slug independiente de query');
store.clear();redirect=true;response=await worker.fetch(request(),env);assert.equal(response.status,200);assert.ok(assetPaths.includes('/template/'));
redirect=false;store.clear();mode='fail';response=await worker.fetch(request(),env);assert.equal(response.status,200);assert.match(await response.text(),/<title>Producto<\/title>/);
mode='timeout';const start=Date.now();response=await worker.fetch(request(),env);assert.equal(response.status,200);assert.ok(Date.now()-start>=2400&&Date.now()-start<3500);
mode='alias';response=await worker.fetch(request(),env);assert.equal(response.status,301);assert.match(response.headers.get('Location'),/canonical/);
console.log('PASS Worker: 200, title/OG, redirect 308 seguido una vez, cache, timeout y fallback');
