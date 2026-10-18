import {observeCharacterResponse} from './character-metrics-http.js';
const MAX_BODY=16*1024;
const json=(res,status,value)=>{
  res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'private, no-store',Vary:'Cookie'});
  res.end(JSON.stringify(value));
};
const STATUS={invalid_character_definition:400,invalid_character_operation:400,
  character_conflict:409,character_request_reused:409,character_account_deleted:410,
  character_record_capacity:413,character_account_capacity:503,character_draft_missing:409,character_revision_missing:404,character_revision_capacity:409,character_version_capacity:409};

async function readBody(req,fields){
  const chunks=[];let size=0;
  for await(const chunk of req){
    size+=chunk.length;
    if(size>MAX_BODY){const error=new Error('character_request_too_large');error.status=413;throw error;}
    chunks.push(chunk);
  }
  const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(value===null||typeof value!=='object'||Array.isArray(value)
    ||Object.keys(value).length!==fields.length||!fields.every(key=>Object.hasOwn(value,key)))throw new Error('Invalid character request');
  return value;
}

// Publication creates immutable owner revisions without equipping them. Selection
// remains a connection-authorized world command with its own version and receipt.
export function createCharacterRoutes({enabled=true,metrics=null,store,approvedIdentity,authorized,allowRead,allowWrite}){
  if(!store?.get||!store?.saveDraft||![approvedIdentity,authorized,allowRead,allowWrite].every(fn=>typeof fn==='function'))throw new TypeError('Invalid character routes');
  return async(req,res,path)=>{
    const routes={'/api/character':{method:'GET',operation:'read'},'/api/character/draft':{method:'PUT',operation:'save',fields:['definition','expectedVersion','requestId']},
      '/api/character/publish':{method:'POST',operation:'publish',fields:['expectedVersion','requestId']},'/api/character/rollback':{method:'POST',operation:'rollback',fields:['revision','expectedVersion','requestId']}};
    const route=routes[path];if(!route)return false;
    const observation=metrics?observeCharacterResponse(res,route.operation,metrics):null;
    const reading=path==='/api/character',method=route.method;
    if(req.method!==method){json(res,405,{error:'character_method_not_allowed'});return true;}
    const identity=await (reading?approvedIdentity:authorized)(req,res);
    if(!identity)return true;
    const query=new URL(req.url,'http://localhost').searchParams;
    if([...query.keys()].some(key=>key!=='world')||query.getAll('world').length>1){json(res,400,{error:'invalid_character_request'});return true;}
    if(!await (reading?allowRead:allowWrite)(identity.userId)){json(res,429,{error:'character_rate_limited'});return true;}
    if(!reading&&enabled!==true){observation?.outcome('paused');json(res,503,{error:'character_studio_disabled'});return true;}
    let body;
    if(!reading){
      if(req.headers['content-type']?.split(';')[0].trim().toLowerCase()!=='application/json'){json(res,415,{error:'character_json_required'});return true;}
      try{body=await readBody(req,route.fields);}catch(error){json(res,error.status===413?413:400,{error:error.status===413?'character_request_too_large':'invalid_character_request'});return true;}
    }
    try{
      let result;
      if(reading)result={character:await store.get(identity.userId),selection:store.getSelection?await store.getSelection(identity.userId):null};
      else{
        const options={expectedVersion:body.expectedVersion,requestId:body.requestId};
        result=path.endsWith('/publish')?await store.publish(identity.userId,options)
          :path.endsWith('/rollback')?await store.rollback(identity.userId,body.revision,options)
          :await store.saveDraft(identity.userId,body.definition,options);
      }
      json(res,200,result);
    }catch(error){
      const status=STATUS[error.code];
      json(res,status??503,{error:status?error.code:'character_unavailable'});
    }
    return true;
  };
}
