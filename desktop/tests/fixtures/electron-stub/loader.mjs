// Resolves the bare `electron` specifier to the recording stub.
export async function resolve(specifier, context, next) {
  if (specifier === 'electron') return { url: new URL('./electron.mjs', import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
}
