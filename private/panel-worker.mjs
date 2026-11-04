import {createRemoteJWKSet,jwtVerify} from 'jose';
const CSP=__PANEL_CSP__;
const resolvers=new Map();
function remoteKeys(issuer){
 if(!resolvers.has(issuer))resolvers.set(issuer,createRemoteJWKSet(new URL('/cdn-cgi/access/certs',issuer),{timeoutDuration:2500,cacheMaxAge:300000,cooldownDuration:30000}));
 return resolvers.get(issuer);
}
function secured(response){
 const headers=new Headers(response.headers);
 for(const [name,value] of Object.entries({'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow, noarchive','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'same-origin','Strict-Transport-Security':'max-age=31536000','Permissions-Policy':'camera=(), microphone=(), geolocation=(), payment=()','Content-Security-Policy':CSP}))headers.set(name,value);
 return new Response(response.body,{status:response.status,headers});
}
export function createPanelHandler({getKeySet=remoteKeys}={}){
 return {async fetch(request,env){
  const team=String(env.CF_ACCESS_TEAM_DOMAIN||'').replace(/\/+$/,'');
  const audience=String(env.CF_ACCESS_AUD||'');
  const allowed=String(env.PANEL_ALLOWED_EMAILS||'').split(',').map(e=>e.trim().toLowerCase()).filter(Boolean);
  // No hay modo público ni bypass local en el Worker de producción.
  if(!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/i.test(team)||!audience||!allowed.length)return secured(new Response('Acceso privado pendiente de configuración.',{status:503}));
  const token=request.headers.get('Cf-Access-Jwt-Assertion');
  if(!token||token.length>16384)return secured(new Response('Acceso no autorizado.',{status:403}));
  try{
   const {payload}=await jwtVerify(token,getKeySet(team),{issuer:team,audience,algorithms:['RS256'],requiredClaims:['exp','iat','sub']});
   if(payload.iat>Date.now()/1000+5||typeof payload.email!=='string'||!allowed.includes(payload.email.toLowerCase()))return secured(new Response('Acceso no autorizado.',{status:403}));
   return secured(await env.ASSETS.fetch(request));
  }catch{return secured(new Response('Acceso no autorizado.',{status:403}))}
 }};
}
export default createPanelHandler();
