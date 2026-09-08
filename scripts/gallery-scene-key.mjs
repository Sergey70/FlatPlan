// V8/libm may differ in their final trigonometric bits across CPU architectures.
// Hash geometry at 0.1 micrometre / 0.0000001 degree precision for portable manifests.
export function gallerySceneKey(objects) {
  return JSON.stringify(objects, (_key, value) =>
    typeof value === 'number' ? Number(value.toFixed(7)) : value,
  );
}
