import {buildNeighborhood, validateAuthoringArtifact} from '../../../shared/neighborhood/preserve.js';
self.onmessage = ({data}) => {
  try {
    let artifact;
    if(data.artifact){
      const previous=validateAuthoringArtifact(data.artifact);
      artifact=data.seed===undefined?previous:buildNeighborhood({...previous.recipe,seed:data.seed},{previous});
    }else artifact=buildNeighborhood(data.recipe, data.options);
    self.postMessage({artifact});
  } catch(error) {self.postMessage({error:error.message,diagnostics:error.diagnostics});}
};
