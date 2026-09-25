// Loopback-only browser acceptance fixture. Production uses server/start.js and WorkOS.
import { readFile } from 'node:fs/promises';
<<<<<<< Updated upstream
// The fixture supplies its own town and identities, and tests the sign-in gate.
process.env.VITE_MULTIPLAYER='required';process.env.RIVER_OAKS_DEV_TOWN='off';
=======
>>>>>>> Stashed changes
import { createServer as createViteServer } from 'vite';
import { createGameServer } from '../app.js';
import { createSharedWorld } from '../world.js';
const origin='http://127.0.0.1:5180';
const data=JSON.parse(await readFile(new URL('../../preview/public/data/district.json',import.meta.url)));
data.vegetation=JSON.parse(await readFile(new URL('../../preview/public/data/district-vegetation.json',import.meta.url)));
let app;
const identity=req=>{
  const userId=req.headers.cookie?.match(/(?:^|; )fixture_session=(alice|bob)/)?.[1];
  return userId?{userId,name:userId==='alice'?'Alice':'Bob',sessionId:userId,csrfToken:'fixture-'+userId,expiresAt:Date.now()+3600000}:null;
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
app=createGameServer({auth,world:createSharedWorld(data),origin});
await new Promise(resolve=>app.server.listen(8788,'127.0.0.1',resolve));
const vite=await createViteServer({configFile:'preview/vite.config.js',server:{host:'127.0.0.1',port:5180,strictPort:true,proxy:{'/auth':'http://127.0.0.1:8788','/api/multiplayer':'http://127.0.0.1:8788','/api/moderation':'http://127.0.0.1:8788','/multiplayer':{target:'ws://127.0.0.1:8788',ws:true}}}});
await vite.listen();
console.log('Multiplayer browser fixture: '+origin+' (test identities only; no live WorkOS acceptance)');
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await app.close();await vite.close();process.exit(0);});
