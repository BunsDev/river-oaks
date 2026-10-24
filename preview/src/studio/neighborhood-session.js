export function createNeighborhoodRunner() {
  let pending=null;
  const cancel=()=>pending?.finish(new Error('Neighborhood preview cancelled.'));
  return {cancel,compile(request){
    cancel();
    return new Promise((resolve,reject)=>{
      const worker=new Worker(new URL('./neighborhood-worker.js',import.meta.url),{type:'module'});
      let timer, finished=false;
      const finish=(error,artifact)=>{if(finished)return;finished=true;clearTimeout(timer);worker.terminate();pending=null;error?reject(error):resolve(artifact);};
      pending={finish};timer=setTimeout(()=>finish(Error('Preview exceeded its time budget. Reduce the reference crop.')),10000);
      worker.onmessage=({data})=>finish(data.error?Object.assign(Error(data.error),{diagnostics:data.diagnostics}):null,data.artifact);
      worker.onerror=()=>finish(Error('Preview worker failed. Your draft is unchanged; retry the preview.'));
      worker.postMessage(request);
    });
  }};
}

export function createNeighborhoodSession(doc, runner=createNeighborhoodRunner()) {
  let generation=0, candidate=null, baseRevision=null;
  const cancel=()=>{generation++;candidate=null;baseRevision=null;runner.cancel();};
  const check=(token,revision)=>{
    if(token!==generation)throw Error('Neighborhood preview cancelled.');
    if(revision!==doc.revision)throw Error('The document changed; preview again before applying or exporting.');
  };
  return {
    cancel,
    get candidate(){return candidate?structuredClone(candidate):null;},
    async preview(input,{approve=[],seed}={}){
      cancel();const token=generation, revision=doc.revision;
      const previous=doc.neighborhood;
      const recipe=seed===undefined?input:{...input,seed};
      const request=input.generator_version ? {artifact:input,seed} : {recipe,options:previous&&input.id===previous.recipe.id
        ? {previous,edited:doc.value,approve} : {approve}};
      const result=await runner.compile(request);check(token,revision);
      candidate=result;baseRevision=revision;return structuredClone(result);
    },
    apply(){
      if(!candidate)throw Error('Preview a candidate before applying it.');
      if(doc.revision!==baseRevision)throw Error('The document changed; preview again before applying.');
      const changed=doc.openNeighborhood(candidate,{baseRevision});cancel();return changed;
    },
    async exportArtifact(){
      const previous=doc.neighborhood;if(!previous)throw Error('Apply or open an authoring candidate first.');
      cancel();const token=generation, revision=doc.revision;
      const result=await runner.compile({recipe:previous.recipe,options:{previous,edited:doc.value}});
      check(token,revision);return result;
    },
  };
}
