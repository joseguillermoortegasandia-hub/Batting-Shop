import {cp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';

const root=process.cwd(),destination=resolve(root,'artifacts/battingshop-admin');
await mkdir(destination,{recursive:true});
const files=['panel','build-panel.mjs','pnpm-lock.yaml','pnpm-workspace.yaml','.node-version','.npmrc','.gitattributes','private/panel-worker.mjs','private/scripts/fingerprint-assets.mjs','private/scripts/check-package-manager.mjs','private/tests/admin_workflow_test.py'];
for(const file of files){await mkdir(resolve(destination,file,'..'),{recursive:true});await cp(resolve(root,file),resolve(destination,file),{recursive:true});}
for(const file of ['images/logo.webp','images/favicon-32.png','icons/softball.svg','icons/bat-cursor-v4.png','icons/bat-cursor-v4.cur']){
  const target=join(destination,'public/assets',file);await mkdir(resolve(target,'..'),{recursive:true});await cp(join(root,'public/assets',file),target);
}
const pkg=JSON.parse(await readFile('package.json','utf8'));
pkg.name='battingshop-admin';pkg.description='Panel privado de Batting Shop';
pkg.scripts={build:'node build-panel.mjs','build:local':'node --env-file=.env.local build-panel.mjs',test:'python private/tests/admin_workflow_test.py',preinstall:'node private/scripts/check-package-manager.mjs'};
await writeFile(join(destination,'package.json'),JSON.stringify(pkg,null,2)+'\n');
await writeFile(join(destination,'.gitignore'),'node_modules/\ndist-panel/\nartifacts/\n.env*\n!.env.example\n.wrangler/\n');
await writeFile(join(destination,'.env.example'),'SUPABASE_URL=https://iacpoemfzvfcvpqwhsgw.supabase.co\nSUPABASE_ANON_KEY=CLAVE_PUBLICABLE\nPANEL_URL=https://TU-PANEL.pages.dev\nSTOREFRONT_URL=https://joseguillermoortegasandia-hub.github.io/Batting-Shop/\n');
await writeFile(join(destination,'README.md'),'# Batting Shop Admin\n\nPanel separado de la tienda. El repositorio es privado. No contiene inventario, costos, facturas, SQL ni contraseñas.\n\n## Cloudflare Pages\n\nRama `main`, framework None, Node 24, pnpm 11.5.1, build `pnpm run build`, salida `dist-panel`. Configurar las cuatro variables de `.env.example` usando la clave pública del proyecto.\n\nEl Worker requiere Cloudflare Access y las variables de runtime `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD` y `PANEL_ALLOWED_EMAILS=battingshop.ve@gmail.com`. Configurar una política limitada al propietario. El login de Supabase y sus permisos siguen siendo obligatorios. Sin Access configurado responde 503; sin sesión válida, 403.\n\nEl plan actual de GitHub no permite Pages para este repositorio privado. Publicar en Cloudflare conserva la privacidad del repositorio.\n\n`pnpm test` verifica acceso, productos, fotos, inventario y facturas con una API simulada, sin escribir en la base real.\n');
console.log('Panel exportado mediante lista explícita de archivos: '+destination);
