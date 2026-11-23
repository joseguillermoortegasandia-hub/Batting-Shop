import {spawnSync} from 'node:child_process';

if(!process.env.SITE_URL)throw new Error('Define SITE_URL con la URL completa de GitHub Pages, incluida la ruta del repositorio.');
const site=new URL(process.env.SITE_URL);
// Pages puede devolver http cuando Enforce HTTPS aún no está activado.
if(site.hostname.endsWith('.github.io'))site.protocol='https:';
const result=spawnSync(process.execPath,['build.mjs'],{
  stdio:'inherit',env:{...process.env,SITE_URL:site.href.replace(/\/$/,''),BS_HOSTING:'github-pages',CF_PAGES_BRANCH:'',CF_PAGES_URL:''}
});
process.exit(result.status??1);
