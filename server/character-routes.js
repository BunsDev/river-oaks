const MAX_BODY=16*1024;
const json=(res,status,value)=>{
  res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'private, no-store',Vary:'Cookie'});
  res.end(JSON.stringify(value));
};
const STATUS={invalid_character_definition:400,invalid_character_operation:400,
  character_conflict:409,character_request_reused:409,character_account_deleted:410,
  character_record_capacity:413,character_account_capacity:503};

async function readBody(req){
  const chunks=[];let size=0;
  for await(const chunk of req){
    size+=chunk.length;
    if(size>MAX_BODY){const error=new Error('character_request_too_large');error.status=413;throw error;}
    chunks.push(chunk);
  }
  const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(value===null||typeof value!=='object'||Array.isArray(value)
    ||Object.keys(value).length!==3||!['definition','expectedVersion','requestId'].every(key=>Object.hasOwn(value,key)))throw new Error('Invalid character request');
  return value;
}

// Only private draft reads/writes are mounted here. Publishing needs the world
// authority/cooldown integration; an immutable store revision alone is not it.
export function createCharacterRoutes({store,approvedIdentity,authorized,allowRead,allowWrite}){
  if(!store?.get||!store?.saveDraft||![approvedIdentity,authorized,allowRead,allowWrite].every(fn=>typeof fn==='function'))throw new TypeError('Invalid character routes');
  return async(req,res,path)=>{
    if(!['/api/character','/api/character/draft'].includes(path))return false;
    const reading=path==='/api/character',method=reading?'GET':'PUT';
    if(req.method!==method){json(res,405,{error:'character_method_not_allowed'});return true;}
    const identity=await (reading?approvedIdentity:authorized)(req,res);
    if(!identity)return true;
    const query=new URL(req.url,'http://localhost').searchParams;
    if([...query.keys()].some(key=>key!=='world')||query.getAll('world').length>1){json(res,400,{error:'invalid_character_request'});return true;}
    if(!await (reading?allowRead:allowWrite)(identity.userId)){json(res,429,{error:'character_rate_limited'});return true;}
    let body;
    if(!reading){
      if(req.headers['content-type']?.split(';')[0].trim().toLowerCase()!=='application/json'){json(res,415,{error:'character_json_required'});return true;}
      try{body=await readBody(req);}catch(error){json(res,error.status===413?413:400,{error:error.status===413?'character_request_too_large':'invalid_character_request'});return true;}
    }
    try{
      const result=reading?{character:await store.get(identity.userId)}
        :await store.saveDraft(identity.userId,body.definition,{expectedVersion:body.expectedVersion,requestId:body.requestId});
      json(res,200,result);
    }catch(error){
      const status=STATUS[error.code];
      json(res,status??503,{error:status?error.code:'character_unavailable'});
    }
    return true;
  };
}
