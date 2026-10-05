// Loopback-only browser acceptance fixture. Production uses server/start.js and WorkOS.
import { readFile } from 'node:fs/promises';
// The fixture supplies its own town and identities, and tests the sign-in gate.
process.env.VITE_MULTIPLAYER='required';process.env.RIVER_OAKS_DEV_TOWN='off';
import { createServer as createViteServer } from 'vite';
import { createGameServer } from '../app.js';
import { createSharedWorld } from '../world.js';
import { approvedWaitlist } from './waitlist-fixture.js';
import { createMemoryLandmarks } from '../landmarks.js';
import { createMemorySocial } from '../social.js';
import { createMemoryProfiles } from '../profiles.js';
const webPort=Number(process.env.RIVER_OAKS_TEST_WEB_PORT??5180),townPort=Number(process.env.RIVER_OAKS_DEV_TOWN_PORT??8788);
const origin=`http://127.0.0.1:${webPort}`;
const data=JSON.parse(await readFile(new URL('../../preview/public/data/district.json',import.meta.url)));
data.vegetation=JSON.parse(await readFile(new URL('../../preview/public/data/district-vegetation.json',import.meta.url)));
let app;
const identity=req=>{
  // Residents carry their GitHub username; the owner is a Jevica account. The
  // impostors are non-admin sessions that claim Jevica, as a stale or forged
  // record would, so journeys can prove no surface ever shows them as Jevica.
  const fixtureId=req.headers.cookie?.match(/(?:^|; )fixture_session=(alice|bob|guest|owner|impostor|lookalike)/)?.[1];
  const userId=fixtureId==='owner'?'user_01M40Y914S1H4EJCEHH91DKTAY':fixtureId;
  const name={owner:'Jevica',alice:'alice',bob:'bob',guest:'guest',impostor:'Jevica',lookalike:'J\u0435v1ca'}[fixtureId];
  return userId?{userId,name,sessionId:userId,csrfToken:'fixture-'+fixtureId,expiresAt:Date.now()+3600000}:null;
};
const auth={authenticate:async req=>identity(req),async handle(req,res){
  if(!req.url.startsWith('/auth/'))return false;
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
  const user=identity(req);
  if(req.url==='/auth/session'){res.end(JSON.stringify(user?{authenticated:true,user:{id:user.userId,name:user.name},csrfToken:user.csrfToken}:{authenticated:false}));return true;}
  if(req.url==='/auth/logout'&&req.method==='POST'&&user&&req.headers.origin===origin&&req.headers['x-csrf-token']===user.csrfToken){
    app.disconnectUser(user.userId);res.setHeader('Set-Cookie','fixture_session=; Path=/; Max-Age=0');res.end(JSON.stringify({url:'/'}));return true;
  }
  res.statusCode=404;res.end('{}');return true;
}};
app=createGameServer({auth,world:createSharedWorld(data,{isAdmin:id=>id==='alice'}),landmarks:createMemoryLandmarks(),social:createMemorySocial(),profiles:createMemoryProfiles(),waitlist:approvedWaitlist,origin});
await new Promise(resolve=>app.server.listen(townPort,'127.0.0.1',resolve));
const townHttp=`http://127.0.0.1:${townPort}`;
const vite=await createViteServer({configFile:'preview/vite.config.js',server:{host:'127.0.0.1',port:webPort,strictPort:true,proxy:{'/auth':townHttp,'/api/multiplayer':townHttp,'/api/landmarks':townHttp,'/api/social':townHttp,'/api/profile':townHttp,'/api/waitlist':townHttp,'/api/moderation':townHttp,'/multiplayer':{target:`ws://127.0.0.1:${townPort}`,ws:true}}}});
await vite.listen();
console.log('Multiplayer browser fixture: '+origin+' (test identities only; no live WorkOS acceptance)');
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await app.close();await vite.close();process.exit(0);});
