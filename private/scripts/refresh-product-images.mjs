import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {spawnSync} from 'node:child_process';

const origin=String(process.env.SUPABASE_URL||'').replace(/\/+$/,'');
const key=String(process.env.SUPABASE_ANON_KEY||'');
if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(origin)||!key||key.startsWith('sb_secret_'))throw new Error('Configura SUPABASE_URL y la clave publicable SUPABASE_ANON_KEY.');
const directory='artifacts/product-image-refresh';await mkdir(directory+'/source',{recursive:true});
const existing=JSON.parse(await readFile('public/data/image-variants.json','utf8'));
const response=await fetch(origin+'/rest/v1/rpc/get_public_catalog',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(30000)});
if(!response.ok)throw new Error('Catálogo HTTP '+response.status);
const catalog=await response.json(),seen=new Set(),items=[];
for(const product of catalog.products||[])for(const image of [...(product.images||[]),...(product.colors||[]).flatMap(color=>color.images||[])]){
  if(!image.storagePath||seen.has(image.storagePath))continue;
  if(!/^[a-z0-9-]{1,80}$/i.test(image.id))throw new Error('Identificador de foto inválido.');
  seen.add(image.storagePath);items.push({...image});
}
for(let start=0;start<items.length;start+=6)await Promise.all(items.slice(start,start+6).map(async image=>{
  const urls=existing.responsive[existing.overrides[image.storagePath]];
  if(urls){
    try{await Promise.all(Object.values(urls).map(path=>access('public'+path)));image.urls=urls;image.file='public'+urls[1600];image.reuse=true;return}catch{}
  }
  if(image.storagePath.startsWith('/assets/images/')){
    const file=resolve('public'+image.storagePath);
    if(!file.startsWith(resolve('public/assets/images')+sep))throw new Error('Ruta local de foto no permitida.');
    image.file=file;return;
  }
  const url=origin+'/storage/v1/object/public/product-images/'+image.storagePath.split('/').map(encodeURIComponent).join('/');
  const download=await fetch(url,{signal:AbortSignal.timeout(30000)});
  if(!download.ok)throw new Error('Foto HTTP '+download.status);
  const buffer=new Uint8Array(await download.arrayBuffer());
  if(buffer.byteLength>10*1024*1024)throw new Error('Foto de entrada demasiado grande.');
  image.file=directory+'/source/'+image.id+'.webp';await writeFile(image.file,buffer);
}));
const manifest=directory+'/manifest.json';await writeFile(manifest,JSON.stringify(items,null,2));
const result=spawnSync(process.env.PYTHON||'python',['private/scripts/prepare-image-variants.py','--manifest',manifest],{stdio:'inherit'});
process.exit(result.status??1);
