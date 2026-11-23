import {fingerprintAssets} from './private/scripts/fingerprint-assets.mjs';
import {cp,rm,mkdir,readFile,writeFile,access} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const root=fileURLToPath(new URL('.',import.meta.url));
const relative=process.env.BS_PANEL_OUTPUT_DIR||'dist-panel';
if(relative!=='dist-panel'&&!/^artifacts[\\/][a-zA-Z0-9_\\/-]+$/.test(relative))throw new Error('Salida del panel no permitida.');
const output=resolve(root,relative);
if(!output.startsWith(resolve(root)+'/')&&!output.startsWith(resolve(root)+'\\'))throw new Error('Salida fuera del proyecto.');
const panelUrl=String(process.env.PANEL_URL||process.env.CF_PAGES_URL||'http://localhost:8081').trim().replace(/\/+$/,'');
const storeUrl=String(process.env.STOREFRONT_URL||'http://localhost:8080').trim().replace(/\/+$/,'');
const supabaseUrl=String(process.env.SUPABASE_URL||'').trim().replace(/\/+$/,'');
const key=String(process.env.SUPABASE_ANON_KEY||'').trim();
function validOrigin(value,allowPath=false){const u=new URL(value);if((!allowPath&&u.pathname!=='/')||(allowPath&&!/^\/(?:[a-zA-Z0-9_-]+\/?)?$/.test(u.pathname))||u.search||u.hash||u.username||u.password)throw new Error('Usa únicamente el origen, sin rutas ni credenciales.');if(u.protocol!=='https:'&&!(u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)))throw new Error('El panel requiere HTTPS o localhost.');return u}
const panel=validOrigin(panelUrl),store=validOrigin(storeUrl,true);
if(panel.origin===store.origin)throw new Error('El panel y la tienda deben tener orígenes distintos.');
if((process.env.CF_PAGES_URL||process.env.CF_PAGES_BRANCH)&&(panel.protocol!=='https:'||store.protocol!=='https:'))throw new Error('En Pages los dos orígenes deben usar HTTPS.');
if(panel.protocol==='https:'&&(!process.env.STOREFRONT_URL||store.protocol!=='https:'))throw new Error('Configura STOREFRONT_URL con el origen HTTPS de la tienda.');
if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(supabaseUrl))throw new Error('SUPABASE_URL inválida o ausente.');
if(!key||key.startsWith('sb_secret_'))throw new Error('Usa una clave publicable de Supabase.');
if(key.split('.').length===3){try{if(JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString()).role==='service_role')throw new Error('La clave service_role nunca debe llegar al navegador.')}catch(e){throw new Error('Clave JWT pública inválida: '+e.message)}}
const version='2.117.2',vendor=join(root,'node_modules/@supabase/supabase-js/dist/umd/supabase.js');
await access(vendor);
// Destino comprobado dentro del workspace; solo elimina la salida generada del panel.
await rm(output,{recursive:true,force:true});await mkdir(output,{recursive:true});
await cp(join(root,'panel'),output,{recursive:true});
await mkdir(join(output,'assets/images'),{recursive:true});await mkdir(join(output,'assets/icons'),{recursive:true});await mkdir(join(output,'assets/vendor'),{recursive:true});
for(const name of ['logo.webp','favicon-32.png'])await cp(join(root,'public/assets/images',name),join(output,'assets/images',name));
for(const name of ['softball.svg','bat-cursor-v4.png','bat-cursor-v4.cur'])await cp(join(root,'public/assets/icons',name),join(output,'assets/icons',name));
await cp(vendor,join(output,`assets/vendor/supabase-${version}.js`));
const replacements={'__SUPABASE_URL__':supabaseUrl,'__SUPABASE_ANON_KEY__':key,'__PANEL_URL__':panelUrl,'__STOREFRONT_URL__':storeUrl,'__SUPABASE_ORIGIN__':new URL(supabaseUrl).origin};
const escaped=value=>value.replaceAll('\\','\\\\').replaceAll("'","\\'").replaceAll('\r','\\r').replaceAll('\n','\\n').replaceAll('<','\\x3c');
const htmlEscape=value=>value.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
for(const path of ['index.html','assets/config.js','_headers']){
 const file=join(output,path);let text=await readFile(file,'utf8');
 for(const [marker,value] of Object.entries(replacements))text=text.replaceAll(marker,path.endsWith('.js')?escaped(value):path.endsWith('.html')?htmlEscape(value):value);
 if(/__[A-Z_]+__/.test(text))throw new Error('Placeholder sin reemplazar en '+path);
 await writeFile(file,text);
}
const policy=(await readFile(join(output,'_headers'),'utf8')).match(/Content-Security-Policy: (.+)/)[1];
const source=(await readFile(join(root,'private/panel-worker.mjs'),'utf8')).replace('__PANEL_CSP__',JSON.stringify(policy));
await build({stdin:{contents:source,resolveDir:root,sourcefile:'panel-worker.mjs'},outfile:join(output,'_worker.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,sourcemap:false});
console.log(`Panel separado generado en ${relative}/ para ${panelUrl}. Tienda: ${storeUrl}`);
console.log('El Worker del panel bloquea acceso remoto sin Cloudflare Access y correo autorizado.');

await fingerprintAssets(output);
