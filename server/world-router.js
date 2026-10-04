import { createServer } from 'node:http';
import { DEFAULT_WORLD_ID, validateWorldId } from '../preview/src/world-contract.js';

const json=(res,status,error)=>{
  res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});
  res.end(JSON.stringify({error}));
};

export function createWorldRouter({worldFor,configuredWorldId=DEFAULT_WORLD_ID}={}) {
  validateWorldId(configuredWorldId);
  function select(req) {
    const url=new URL(req.url,'http://localhost');
    if(url.pathname.startsWith('/auth/') || url.pathname.startsWith('/api/waitlist/') || url.pathname==='/api/worlds' || url.pathname.startsWith('/api/world-draft/') || url.pathname==='/api/world-data' || url.pathname==='/api/moderation/ban' || url.pathname==='/health')return configuredWorldId;
    const ids=url.searchParams.getAll('world');
    if(ids.length>1)throw new Error('Invalid world');
    return validateWorldId(ids[0]??DEFAULT_WORLD_ID);
  }
  const server=createServer(async(req,res)=>{
    try {
      const world=await worldFor(select(req));
      if(!world)return json(res,404,'World not found.');
      world.game.server.emit('request',req,res);
    } catch(error) {if(!res.headersSent)json(res,error.message==='Invalid world'||error.message==='Invalid world ID'?400:503,'World unavailable.');else res.destroy();}
  });
  server.on('upgrade',async(req,socket,head)=>{
    socket.on('error',()=>{});
    try {
      const world=await worldFor(select(req));
      if(!world)return socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
      world.game.server.emit('upgrade',req,socket,head);
    } catch {socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');}
  });
  server.requestTimeout=15_000;server.headersTimeout=10_000;
  return {server,async close(){await new Promise(resolve=>server.close(resolve));}};
}
