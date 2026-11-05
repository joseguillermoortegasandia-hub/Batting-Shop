// Auditoría remota sin insertar productos, fotos, usuarios ni inventario.
import {mkdir,writeFile} from 'node:fs/promises';
const base=String(process.env.SUPABASE_URL||'').replace(/\/+$/,'');
const key=String(process.env.SUPABASE_ANON_KEY||'');
if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(base)||!key||key.startsWith('sb_secret_'))throw new Error('Configura URL y clave publicable de Supabase.');
if(key.split('.').length===3){const role=JSON.parse(Buffer.from(key.split('.')[1],'base64url')).role;if(role!=='anon')throw new Error('La auditoría requiere una clave anon/publicable; no se admiten tokens privilegiados.')}
const headers={apikey:key,'Content-Type':'application/json'};
const checks=[];
async function get(path,body){
 const response=await fetch(base+path,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000)});
 const text=await response.text();let data;try{data=JSON.parse(text)}catch{data=null}
 return {response,data};
}
function check(name,ok){checks.push({name,ok});console.log((ok?'PASS ':'FAIL ')+name)}
const catalog=await get('/rest/v1/rpc/get_public_catalog',{});
check('Catálogo real accesible como anon',catalog.response.ok&&Array.isArray(catalog.data?.products)&&Array.isArray(catalog.data?.categories));
const cart=await get('/rest/v1/rpc/get_public_cart_state',{p_variant_ids:[]});
check('Carrito real accesible como anon',cart.response.ok&&Array.isArray(cart.data));
const ids=Array.from({length:51},(_,i)=>'00000000-0000-4000-8000-'+String(i).padStart(12,'0'));
const limit=await get('/rest/v1/rpc/get_public_cart_state',{p_variant_ids:ids});
check('Carrito real rechaza más de 50 ids',!limit.response.ok&&String(limit.data?.message||'').includes('50'));
for(const table of ['products','product_variants','inventory_private','product_slug_aliases','audit_log']){
 const result=await get('/rest/v1/'+table+'?select=*&limit=1');
 check('Anon sin acceso directo a '+table,[401,403].includes(result.response.status));
}
const storage=await get('/storage/v1/object/list/product-images',{prefix:'',limit:1});
check('Anon no lista fotos del bucket',[401,403].includes(storage.response.status)||(storage.response.ok&&Array.isArray(storage.data)&&!storage.data.length));
const auth=await get('/auth/v1/settings');
const signupDisabled=auth.response.ok&&auth.data?.disable_signup===true;
console.log(signupDisabled?'PASS Registro público desactivado':'PENDIENTE Desactivar el registro público en Supabase Auth');
const report={date:new Date().toISOString(),checks,signupDisabled,pending:signupDisabled?[]:['Desactivar Allow new users to sign up en Supabase Auth'],productsInCatalog:catalog.data?.products?.length??null};
await mkdir(new URL('../../artifacts/',import.meta.url),{recursive:true});
await writeFile(new URL('../../artifacts/predeploy-live.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
if(checks.some(item=>!item.ok))process.exitCode=1;
