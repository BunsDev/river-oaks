const personal=id=>typeof id==='string'&&/^office-[a-f0-9]{64}$/.test(id);

/** Only server-resolved membership may enter the world's trusted context. */
export async function workspaceContext(store,userId,command){
  if(command.type!=='office'||command.action==='leave'||!personal(command.officeId))return null;
  const result=await store?.read(userId,command.officeId);
  return result?.ok?result.workspace:null;
}

/** Bounded by the world's player cap; no workspace scan or per-frame polling. */
export async function reconcileOfficeVisit(world,store,userId){
  const visit=world.officeVisit?.(userId);if(!personal(visit?.id))return;
  let allowed=false;
  try{allowed=(await store?.read(userId,visit.id))?.ok===true;}catch{/* Storage fails closed. */}
  if(!allowed&&world.officeVisit(userId)?.id===visit.id)world.endOfficeVisit(userId);
}

export async function reconcileOfficeVisits(world,store){
  await Promise.all([...world.players.keys()].map(userId=>reconcileOfficeVisit(world,store,userId)));
}
