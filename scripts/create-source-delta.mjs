// Use anonymous canonical exports, never the user's edited scene or original .plan.
// node scripts/create-source-delta.mjs OLD.json NEW.json OUTPUT.json
import { readFileSync, writeFileSync } from 'node:fs';
const [beforePath, afterPath, output] = process.argv.slice(2);
const before = JSON.parse(readFileSync(beforePath, 'utf8'));
const after = JSON.parse(readFileSync(afterPath, 'utf8'));
const index = (project) => {
  const nodes = new Map();
  function walk(list, parentId = null) {
    for (const node of list) {
      nodes.set(node.id, { node, parentId });
      walk(node.children, node.id);
    }
  }
  for (const arrangement of project.arrangements)
    walk(arrangement.scene.objects);
  return nodes;
};
const oldNodes = index(before),
  newNodes = index(after);
const delta = {
  updates: {},
  added: [],
  removed: [],
  retired: before.arrangements.filter(
    (a) => !after.arrangements.some((b) => b.id === a.id),
  ),
};
function fields(a, b, path = []) {
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  if (
    a &&
    b &&
    typeof a === 'object' &&
    typeof b === 'object' &&
    !Array.isArray(a) &&
    !Array.isArray(b)
  )
    return [...new Set([...Object.keys(a), ...Object.keys(b)])]
      .filter((key) => key !== 'children')
      .flatMap((key) => fields(a[key], b[key], [...path, key]));
  return [{ path, before: a, after: b }];
}
for (const [id, { node, parentId }] of newNodes) {
  if (oldNodes.has(id)) {
    const changes = fields(oldNodes.get(id).node, node);
    if (changes.length) delta.updates[id] = changes;
  } else if (parentId && oldNodes.has(parentId))
    delta.added.push({ parentId, node });
}
for (const [id, { node, parentId }] of oldNodes)
  if (!newNodes.has(id) && parentId && newNodes.has(parentId))
    delta.removed.push({ parentId, node });
writeFileSync(output, JSON.stringify(delta, null, 2) + '\n');
console.log(
  `Source delta: ${Object.keys(delta.updates).length} changed nodes, ${delta.added.length} added, ${delta.removed.length} removed, ${delta.retired.length} retired arrangements`,
);
