<<<<<<< Updated upstream
import { createTown } from './town.js';

// `npm start` serves the built frontend and the town from this one process.
// `npm run server -- --dev` pairs it with a separate Vite dev server instead.
const dev = process.argv.includes('--dev');
// In --dev, a production PUBLIC_ORIGIN copied from .env.example never points
// the local town at the live site; only a loopback origin is honoured.
const configured = process.env.PUBLIC_ORIGIN;
const loopback = value => { try { return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(value).hostname); } catch { return false; } };
const origin = dev ? (loopback(configured) ? configured : 'http://127.0.0.1:5173') : configured ?? 'http://localhost:8787';
const town = await createTown({ origin });
const port = Number(process.env.PORT ?? 8787);
town.server.listen(port, process.env.HOST ?? '127.0.0.1', () => {
  const signIn = town.auth === 'local' ? 'local development identities (no WorkOS)' : 'WorkOS';
  console.log(`River Oaks multiplayer listening on port ${port}; public origin ${origin}; sign-in: ${signIn}`);
});
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => town.close().then(() => process.exit(0)));
=======
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createAuth } from './auth.js';
import { createSharedWorld } from './world.js';
import { createModeration } from './moderation.js';
import { createGameServer } from './app.js';

const origin=process.env.PUBLIC_ORIGIN ?? 'http://localhost:8787';
const publicURL=new URL(origin);
if(publicURL.origin!==origin || (publicURL.protocol!=='https:' && !(publicURL.protocol==='http:' && ['localhost','127.0.0.1','[::1]'].includes(publicURL.hostname))))throw new Error('PUBLIC_ORIGIN must be an HTTPS origin, or localhost for development.');
const data=JSON.parse(await readFile(new URL('../preview/public/data/district.json',import.meta.url),'utf8'));
const vegetation=JSON.parse(await readFile(new URL('../preview/public/data/district-vegetation.json',import.meta.url),'utf8'));
data.vegetation=vegetation;
const world=createSharedWorld(data);
const moderation=await createModeration(resolve(process.env.MODERATION_FILE ?? '.runtime/moderation.json'));
let game;
const auth=createAuth({apiKey:process.env.WORKOS_API_KEY,clientId:process.env.WORKOS_CLIENT_ID,cookiePassword:process.env.WORKOS_COOKIE_PASSWORD,origin,onLogout:userId=>game?.disconnectUser(userId)});
game=createGameServer({auth,world,moderation,origin,staticRoot:resolve('dist/preview'),moderators:(process.env.MODERATOR_USER_IDS??'').split(',').map(id=>id.trim()).filter(Boolean),trustedProxyIPs:(process.env.TRUSTED_PROXY_IPS??'').split(',').map(ip=>ip.trim()).filter(Boolean)});
const port=Number(process.env.PORT??8787);
game.server.listen(port,process.env.HOST??'127.0.0.1',()=>console.log(`River Oaks multiplayer listening on port ${port}; public origin ${origin}`));
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>game.close().then(()=>process.exit(0)));
>>>>>>> Stashed changes
