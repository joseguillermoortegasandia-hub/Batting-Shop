import {readFile,writeFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {transform} from 'esbuild';

export async function optimizeStore(output){
  const directory=join(output,'assets/js');
  const common=['site-config','storage','catalog-store','favorites','ui','cart','bootstrap'];
  const source=(await Promise.all(common.map(name=>readFile(join(directory,name+'.js'),'utf8')))).join('\n;\n');
  const options={minify:true,target:'es2020',charset:'utf8',legalComments:'none'};
  await writeFile(join(directory,'storefront.js'),(await transform(source,options)).code);
  for(const name of await readdir(directory)){
    if(!name.endsWith('.js')||name==='storefront.js')continue;
    const path=join(directory,name);
    await writeFile(path,(await transform(await readFile(path,'utf8'),options)).code);
  }
  const css=join(output,'assets/css/store.css');
  await writeFile(css,(await transform(await readFile(css,'utf8'),{...options,loader:'css'})).code);
}
