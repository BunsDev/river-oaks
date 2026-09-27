import { Group } from 'three';

// Station animation already stops while its room is hidden. Skip the renderer's
// recursive transform walk as well, then refresh the entire branch on re-entry.
// Explicit updateWorldMatrix/getWorldPosition queries retain Three's behavior.
export class SuspendedStationGroup extends Group {
  updateMatrixWorld(force) {
    for(let ancestor=this;ancestor;ancestor=ancestor.parent) {
      if(ancestor.visible)continue;
      this.matrixWorldNeedsUpdate=true;
      return;
    }
    super.updateMatrixWorld(force);
  }
}
