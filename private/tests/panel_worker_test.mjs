import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {generateKeyPair,exportJWK,SignJWT,createLocalJWKSet} from 'jose';
const {createPanelHandler}=await import(pathToFileURL(process.argv[2]));
const {publicKey,privateKey}=await generateKeyPair('RS256');
const jwk=await exportJWK(publicKey);jwk.kid='test-key';jwk.alg='RS256';
const handler=createPanelHandler({getKeySet:()=>createLocalJWKSet({keys:[jwk]})});
let reads=0;
const env={CF_ACCESS_TEAM_DOMAIN:'https://test-team.cloudflareaccess.com',CF_ACCESS_AUD:'test-audience',PANEL_ALLOWED_EMAILS:'owner@example.invalid',ASSETS:{async fetch(){reads++;return new Response('private-file')}}};
const request=(path='/',token)=>new Request(`https://panel.example.invalid${path}`,{headers:token?{'Cf-Access-Jwt-Assertion':token}:{}});
async function token({audience='test-audience',issuer=env.CF_ACCESS_TEAM_DOMAIN,email='owner@example.invalid',expiration='2h',key=privateKey}={}){return new SignJWT({email}).setProtectedHeader({alg:'RS256',kid:'test-key'}).setSubject('owner').setIssuer(issuer).setAudience(audience).setIssuedAt().setExpirationTime(expiration).sign(key)}
assert.equal((await handler.fetch(request(),{})).status,503,'Sin configuración, cerrado');
for(const path of ['/','/index.html','/assets/admin.js','/assets/config.js','/assets/vendor/supabase-2.117.2.js'])assert.equal((await handler.fetch(request(path),env)).status,403);
const spoof=new Request('https://panel.example.invalid/',{headers:{'Cf-Access-Authenticated-User-Email':'owner@example.invalid'}});assert.equal((await handler.fetch(spoof,env)).status,403,'Un correo en header no autentica');
for(const bad of ['not-a-jwt',await token({audience:'other'}),await token({issuer:'https://other.cloudflareaccess.com'}),await token({email:'stranger@example.invalid'}),await token({expiration:Math.floor(Date.now()/1000)-60})])assert.equal((await handler.fetch(request('/',bad),env)).status,403);
const other=await generateKeyPair('RS256');assert.equal((await handler.fetch(request('/',await token({key:other.privateKey})),env)).status,403,'Firma ajena rechazada');
assert.equal(reads,0,'No se leen assets al rechazar acceso');
const allowed=await handler.fetch(request('/',await token()),env);assert.equal(allowed.status,200);assert.equal(await allowed.text(),'private-file');assert.equal(allowed.headers.get('Cache-Control'),'no-store');assert.match(allowed.headers.get('X-Robots-Tag'),/noindex/);assert.equal(allowed.headers.get('X-Frame-Options'),'DENY');assert.equal(reads,1);
console.log('PASS panel: configuración ausente, acceso anónimo, spoof, firma/emisor/audiencia/correo/caducidad y acceso válido');
