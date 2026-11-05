import {readFile,writeFile} from 'node:fs/promises';
const target=process.argv[2];
if(!['store','panel'].includes(target))throw new Error('Indica store o panel. No se despliega ningún sitio con este comando.');
const root=new URL('../../',import.meta.url);
const config=JSON.parse(await readFile(new URL(`wrangler.${target}.jsonc`,root),'utf8'));
await writeFile(new URL('wrangler.jsonc',root),JSON.stringify(config,null,2)+'\n');
console.log(`Configuración local de Pages preparada para ${target}. No se ha desplegado.`);
