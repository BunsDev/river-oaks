// Transient expressions use only targets proven by the pinned fixture contract.
// Blink and speech morphs are driven by their existing owners.
export function createCharacterExpressions(model, contract) {
  const targets = contract?.expressionTargets ?? {neutral:[]}, bindings = new Map();
  for (const name of new Set(Object.values(targets).flat())) bindings.set(name, []);
  model.traverse(mesh => {
    for (const [name, list] of bindings) {
      const index = mesh.morphTargetDictionary?.[name];
      if (index !== undefined) list.push({mesh, index, initial:mesh.morphTargetInfluences[index]});
    }
  });
  const supported = Object.keys(targets).filter(name => targets[name].every(target => bindings.get(target).length));
  let disposed = false;
  return {
    get supported() { return [...supported]; },
    set(name, weight = 1) {
      if (disposed || !supported.includes(name) || !Number.isFinite(weight) || weight < 0 || weight > 1) throw new TypeError('Unsupported character expression');
      for (const list of bindings.values()) for (const {mesh,index} of list) mesh.morphTargetInfluences[index] = 0;
      for (const target of targets[name]) for (const {mesh,index} of bindings.get(target)) mesh.morphTargetInfluences[index] = weight;
    },
    dispose() {
      if (disposed) return; disposed = true;
      for (const list of bindings.values()) for (const {mesh,index,initial} of list) mesh.morphTargetInfluences[index] = initial;
    },
  };
}
