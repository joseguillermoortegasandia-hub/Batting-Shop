import {spawnSync} from 'node:child_process';

if(!process.env.SITE_URL)throw new Error('Define SITE_URL con la URL completa de GitHub Pages, incluida la ruta del repositorio.');
const result=spawnSync(process.execPath,['build.mjs'],{
  stdio:'inherit',env:{...process.env,BS_HOSTING:'github-pages',CF_PAGES_BRANCH:'',CF_PAGES_URL:''}
});
process.exit(result.status??1);
