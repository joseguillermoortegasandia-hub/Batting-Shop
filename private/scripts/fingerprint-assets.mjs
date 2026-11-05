import {readdir,readFile,writeFile} from 'node:fs/promises';
import {join,relative} from 'node:path';
import {createHash} from 'node:crypto';

// Una URL nueva cuando cambia el contenido evita CSS/JS antiguos entre builds.
export async function fingerprintAssets(root){
 const files=[];
 async function walk(directory){for(const entry of await readdir(directory,{withFileTypes:true})){const path=join(directory,entry.name);if(entry.isDirectory())await walk(path);else files.push(path)}}
 await walk(root);
 const cursor=files.find(path=>path.endsWith('bat-cursor-v2.png'));
 if(cursor){
  const version=createHash('sha256').update(await readFile(cursor)).digest('hex').slice(0,12);
  for(const path of files.filter(path=>path.endsWith('.css'))){
   const css=await readFile(path,'utf8');
   const revised=css.replace(/url\((['"]?)(\/assets\/icons\/bat-cursor-v2\.png)(?:\?v=[a-f0-9]+)?\1\)/g,(_match,quote,url)=>`url(${quote}${url}?v=${version}${quote})`);
   if(revised!==css)await writeFile(path,revised);
  }
 }
 const versions=new Map();
 for(const path of files.filter(path=>/\.(js|css)$/.test(path))){
  const url='/'+relative(root,path).replaceAll('\\','/');
  versions.set(url,createHash('sha256').update(await readFile(path)).digest('hex').slice(0,12));
 }
 for(const path of files.filter(path=>path.endsWith('.html'))){
  const source=await readFile(path,'utf8');
  const html=source.replace(/\b(src|href)="(\/assets\/[^"?]+\.(?:js|css))(?:\?v=[a-f0-9]+)?"/g,(match,attribute,url)=>versions.has(url)?`${attribute}="${url}?v=${versions.get(url)}"`:match);
  if(html!==source)await writeFile(path,html);
 }
}
