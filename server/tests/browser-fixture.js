// Browser acceptance fixture. Production uses server/start.js and WorkOS.
// The optional phone mode binds the web server to one private interface; the
// synthetic town and all provider-free identities remain fixture-only.
process.env.RIVER_OAKS_DEV_TOWN='off';
import { createServer as createViteServer } from 'vite';
import { configuredOfficeLayout } from '../offices.js';
import { configuredDistrictRevision } from '../../preview/src/garden-campus-district.js';
import { parseCampusOperators } from '../campus-leases.js';
import { parseScreeningHosts } from '../screenings.js';
import { createGameServer } from '../app.js';
import { createMemoryCharacterStore } from '../character-store.js';
import { createSharedWorld } from '../world.js';
import { loadDistrictData } from '../district-data.js';
import { approvedWaitlist } from './waitlist-fixture.js';
import { createMemoryLandmarks } from '../landmarks.js';
import { createMemorySocial } from '../social.js';
import { createMemoryBlocks } from '../blocks.js';
import { createMemoryProfiles } from '../profiles.js';
import { createMemoryEvents } from '../events.js';
import { createMemoryCyclingMiles } from '../cycling-miles.js';
import { createWorkplace } from '../workplace.js';
import { createVoiceService, createMemoryVoiceLeases } from '../voice.js';
import { createFakeLiveKit } from './livekit-fixture.js';
import { createLiveKitClient, livekitConfigured } from '../livekit-client.js';
import { randomUUID } from 'node:crypto';
import { phoneFixtureHost } from './phone-fixture-host.js';
import { phoneDecoderProbePlugin } from './phone-fixture-decoder.js';
import { isolatedFixturePlugin } from './isolated-fixture.js';
const webPort=Number(process.env.RIVER_OAKS_TEST_WEB_PORT??5180),townPort=Number(process.env.RIVER_OAKS_DEV_TOWN_PORT??8788);
const phoneHost=phoneFixtureHost(process.env.RIVER_OAKS_PHONE_FIXTURE_HOST);
const webHost=phoneHost??'127.0.0.1';
const origin=`http://${webHost}:${webPort}`;
// RIVER_OAKS_DISTRICT_REVISION=river-oaks-gardens-3 serves the Gardens campus (#507); unset keeps the garage.
const data=await loadDistrictData({districtRevision:configuredDistrictRevision(process.env.RIVER_OAKS_DISTRICT_REVISION)});
let app;
const identity=req=>{
  // Residents carry their GitHub username; the owner is a Jevica account. The
  // impostors are non-admin sessions that claim Jevica, as a stale or forged
  // record would, so journeys can prove no surface ever shows them as Jevica.
  const fixtureId=req.headers.cookie?.match(/(?:^|; )fixture_session=(alice|bob|guest|owner|impostor|lookalike|unnamed)/)?.[1];
  const userId=fixtureId==='owner'?'user_01M40Y914S1H4EJCEHH91DKTAY':fixtureId;
  const name={owner:'Jevica',alice:'alice',bob:'bob',guest:'guest',unnamed:'Resident',impostor:'Jevica',lookalike:'J\u0435v1ca'}[fixtureId];
  return userId?{userId,name,sessionId:userId,csrfToken:'fixture-'+fixtureId,expiresAt:Date.now()+3600000}:null;
};
const auth={authenticate:async req=>identity(req),async handle(req,res){
  if(!req.url.startsWith('/auth/'))return false;
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
  let user=identity(req);
  if(req.url==='/auth/session'){
    // One phone receives the fixture guest identity through the same session
    // endpoint as desktop journeys. No production auth or admin is involved.
    if(!user&&phoneHost){res.setHeader('Set-Cookie','fixture_session=guest; Path=/; HttpOnly; SameSite=Lax');user=identity({headers:{cookie:'fixture_session=guest'}});}
    res.end(JSON.stringify(user?{authenticated:true,user:{id:user.userId,name:user.name},csrfToken:user.csrfToken}:{authenticated:false}));return true;
  }
  if(req.url==='/auth/logout'&&req.method==='POST'&&user&&req.headers.origin===origin&&req.headers['x-csrf-token']===user.csrfToken){
    app.disconnectUser(user.userId);res.setHeader('Set-Cookie','fixture_session=; Path=/; Max-Age=0');res.end(JSON.stringify({url:'/'}));return true;
  }
  res.statusCode=404;res.end('{}');return true;
}};
// Creator acceptance uses the production Jevica allowlist. The older journeys
// retain their isolated Alice builder fixture.
// RIVER_OAKS_VOICE_FIXTURE=1: the real voice routes, leases and reconciler over
// a fake LiveKit (tokens are plain strings; nothing leaves the machine). The
// browser journey supplies its own fake transport, so no audio provider is needed.
// RIVER_OAKS_VOICE_FIXTURE=live uses the real LiveKit Cloud project named by the
// LIVEKIT_* settings in this process's environment (the live acceptance, voice PR
// 5b); rooms get a fresh namespace so two runs never share one. The settings are
// read here and only here, and never echoed.
const liveVoice=process.env.RIVER_OAKS_VOICE_FIXTURE==='live';
if(liveVoice && !livekitConfigured(process.env))throw new Error('RIVER_OAKS_VOICE_FIXTURE=live needs LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET in the environment');
const voice=liveVoice?createVoiceService({leases:createMemoryVoiceLeases(),livekit:createLiveKitClient({url:process.env.LIVEKIT_URL,apiKey:process.env.LIVEKIT_API_KEY,apiSecret:process.env.LIVEKIT_API_SECRET}),namespace:`river-oaks:fixture-live:${randomUUID().slice(0,8)}`,allow:async()=>true,log:{warn(){}}})
  :process.env.RIVER_OAKS_VOICE_FIXTURE==='1'?createVoiceService({leases:createMemoryVoiceLeases(),livekit:createFakeLiveKit(),namespace:'river-oaks:fixture:v1',allow:async()=>true,log:{warn(){}}}):null;
// The office layout for penthouse journeys only (RIVER_OAKS_OFFICE_LAYOUT=office-penthouse-1); unset keeps the legacy room.
const officeLayout=configuredOfficeLayout(process.env.RIVER_OAKS_OFFICE_LAYOUT);
// Synthetic venue-host grants for screening journeys only (e.g. RIVER_OAKS_SCREENING_HOSTS=ipic:alice).
const screeningHosts=parseScreeningHosts(process.env.RIVER_OAKS_SCREENING_HOSTS);
app=createGameServer({characterStudioEnabled:process.env.RIVER_OAKS_CHARACTER_STUDIO==='1',auth,characters:createMemoryCharacterStore(),world:createSharedWorld(data,{...(process.env.RIVER_OAKS_TEST_CREATOR==='1'?{}:{isAdmin:id=>id==='alice'}),officeLayout,screeningHosts,campusOperators:parseCampusOperators(process.env.RIVER_OAKS_CAMPUS_OPERATOR_IDS)}),landmarks:createMemoryLandmarks(),social:createMemorySocial(),blocks:createMemoryBlocks(),profiles:createMemoryProfiles(),events:createMemoryEvents(),cyclingMiles:createMemoryCyclingMiles(),cyclingFlushMs:1000,workplace:process.env.RIVER_OAKS_WORKPLACE==='1'?createWorkplace():null,waitlist:approvedWaitlist,origin,...(voice?{voice,voiceReconcileMs:200}:{}),
  // Connection-continuity journeys retire sockets quickly, as the hosted town does every few minutes.
  ...(Number(process.env.RIVER_OAKS_TEST_CONNECTION_LIFETIME_MS)>0?{connectionLifetime:Number(process.env.RIVER_OAKS_TEST_CONNECTION_LIFETIME_MS),rotateNoticeMs:Number(process.env.RIVER_OAKS_TEST_ROTATE_NOTICE_MS??5000)}:{})});
await new Promise(resolve=>app.server.listen(townPort,'127.0.0.1',resolve));
const townHttp=`http://127.0.0.1:${townPort}`;
const vite=await createViteServer({configFile:'preview/vite.config.js',envDir:false,plugins:[isolatedFixturePlugin(),...(phoneHost?[phoneDecoderProbePlugin()]:[])],server:{host:webHost,port:webPort,strictPort:true,proxy:{'/auth':townHttp,'/api/multiplayer':townHttp,'/api/landmarks':townHttp,'/api/social':townHttp,'/api/workplace':townHttp,'/api/profile':townHttp,'/api/character':townHttp,'/api/waitlist':townHttp,'/api/debug-reports':townHttp,'/api/moderation':townHttp,'/api/voice':townHttp,'/multiplayer':{target:`ws://127.0.0.1:${townPort}`,ws:true}}}});
await vite.listen();
console.log('Multiplayer browser fixture: '+origin+' (test identities only; no live WorkOS acceptance)');
if(phoneHost)console.log('Phone GPU fixture: '+origin+'/?render-audit=1&motion-debug=1 (one synthetic guest; stop after review)');
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await app.close();await vite.close();process.exit(0);});
