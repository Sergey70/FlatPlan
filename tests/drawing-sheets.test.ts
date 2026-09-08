import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { baseNode, makeOpening } from '../lib/editor-seed.ts';
import { clone, defaultView, type Arrangement } from '../lib/editor-model.ts';
import { buildElevations, buildDrawingSet } from '../lib/drawing-sheets.ts';
import { imagePagesPdf } from '../lib/drawing-pdf.ts';
import { nodeMatrix } from '../lib/editor-geometry.ts';
import { createElectricalPoint } from '../lib/electrical.ts';
import { createPlanProject } from '../lib/plan-project.ts';
import { defaultFinish } from '../lib/design-types.ts';
const near = (a: number, b: number, epsilon = 1e-6) =>
  assert.ok(Math.abs(a - b) < epsilon, `${a} != ${b}`);
export function drawingFixture(): Arrangement {
  const floor = baseNode(
    'drawing-floor',
    'Пол — Кухня',
    {
      kind: 'floor',
      size: [6, 0.04, 4],
      polygon: [
        [-3, 0.1],
        [3, 0.1],
        [3, 4],
        [-3, 4],
      ],
    },
    'structure',
  );
  floor.position[1] = -0.04;
  const wall = baseNode(
    'drawing-wall',
    'Стена с окном',
    { kind: 'wall', size: [6, 2.7, 0.2] },
    'structure',
  );
  wall.surfaces = {
    front: {
      ...defaultFinish('tile'),
      color: '#ede0cd',
      width: 0.6,
      height: 0.3,
    },
  };
  const window = makeOpening(1.2, 1.4, 0.2, 'window');
  window.position = [1.2, 0.8, 0];
  window.id = 'drawing-window';
  wall.children = [window];
  const table = baseNode('drawing-cabinet', 'Шкаф <кухня> & стол', {
    kind: 'box',
    size: [1.2, 0.9, 0.6],
  });
  table.position = [-1, 0.45, 0.45];
  const point = createElectricalPoint('socket', [-0.5, 0.9, 0.11], 'Кухня');
  point.id = 'drawing-point';
  return { objects: [floor, wall, table, point], view: defaultView() };
}
test('R17-5 elevations use exact face/opening/furniture/electrical coordinates and physical finish', () => {
  const scene = drawingFixture(),
    before = clone(scene),
    [e] = buildElevations(scene);
  assert.ok(e);
  near(e.max[0] - e.min[0], 6);
  near(e.max[1] - e.min[1], 2.7);
  const window = e.parts.find((p) => p.id === 'drawing-window')!;
  near(
    Math.max(...window.points.map((p) => p[0])) -
      Math.min(...window.points.map((p) => p[0])),
    1.2,
  );
  near(Math.min(...window.points.map((p) => p[1])) - e.min[1], 0.8);
  near(Math.min(...window.points.map((p) => p[0])) - e.min[0], 3.6);
  const table = e.parts.find((p) => p.id === 'drawing-cabinet')!;
  assert.ok(table);
  near(
    Math.max(...table.points.map((p) => p[0])) -
      Math.min(...table.points.map((p) => p[0])),
    1.2,
  );
  near(e.points[0].height, 0.9);
  near(e.points[0].position[0] - e.min[0], 2.5);
  assert.equal(e.parts[0].finish?.kind, 'tile');
  assert.deepEqual(scene, before);
});
test('R17-5 world transforms and split-room faces remain independent of source camera', () => {
  const scene = drawingFixture(),
    original = buildElevations(scene)[0];
  const group = baseNode(
    'drawing-parent',
    'Группа',
    { kind: 'group', size: [1, 1, 1] },
    'structure',
  );
  group.children = scene.objects;
  group.rotation = [0, 35, 0];
  group.scale = [1.5, 1.2, 0.8];
  group.position = [7, 1, -4];
  scene.objects = [group];
  const e = buildElevations(scene)[0];
  near(e.max[0] - e.min[0], 9);
  near(e.max[1] - e.min[1], 3.24);
  near(e.points[0].height, 1.08);
  const expected = new Vector3(
    ...drawingFixture().objects[2].position,
  ).applyMatrix4(nodeMatrix(group));
  const p = expected.clone().sub(e.origin);
  const u = p.dot(e.u);
  const table = e.parts.find((p) => p.id === 'drawing-cabinet')!;
  near(
    (Math.max(...table.points.map((p) => p[0])) +
      Math.min(...table.points.map((p) => p[0]))) /
      2,
    u,
  );
  scene.view.camera = { position: [100, 200, 300], target: [0, 0, 0] };
  assert.deepEqual(buildElevations(scene), [e]);
  assert.equal(original.parts[0].kind, 'wall');
});
test('R17-5 nearby real meshes, hidden objects and room selection control the exported geometry', () => {
  const scene = drawingFixture();
  scene.objects[2].position[2] = 3;
  assert.ok(
    !buildElevations(scene)[0].parts.some((p) => p.id === 'drawing-cabinet'),
  );
  scene.objects[1].children[0].visible = false;
  assert.ok(!buildElevations(scene)[0].parts.some((p) => p.kind === 'opening'));
  assert.equal(buildElevations(scene, []).length, 0);
  const sheets = buildDrawingSet(
    drawingFixture(),
    'Квартира <тест> & отделка',
    ['drawing-floor'],
  );
  assert.deepEqual(
    sheets.slice(0, 3).map((s) => s.kind),
    ['plan', 'furniture', 'electrical'],
  );
  assert.ok(
    sheets.some((s) => s.svg.includes('Квартира &lt;тест&gt; &amp; отделка')),
  );
  assert.ok(
    sheets.every((s) => !s.svg.includes('NaN') && !s.svg.includes('undefined')),
  );
  assert.ok(
    sheets.some(
      (s) => s.svg.includes('220') === false && s.svg.includes('60 × 30'),
    ),
  );
});
test('R17-5 all actual kitchen and bathroom wall faces have sheets and current edits change their exports', () => {
  const project = createPlanProject(),
    before = clone(project),
    ids = ['plan-floor-room-036', 'plan-floor-room-037'];
  const elevations = buildElevations(project.scene, ids),
    sheets = buildDrawingSet(project.scene, project.name, ids);
  assert.ok(elevations.length > 12);
  assert.equal(
    sheets.filter((s) => s.kind === 'elevation').length,
    elevations.length,
  );
  assert.ok(
    sheets.every(
      (s) =>
        s.widthMm === 297 &&
        s.heightMm === 210 &&
        s.svg.includes('font-family="Arial, sans-serif"'),
    ),
  );
  assert.deepEqual(project, before);
  const scene = drawingFixture(),
    first = buildDrawingSet(scene, 'Тест', ['drawing-floor']);
  scene.objects[2].position[0] += 0.4;
  scene.objects[1].surfaces!.front!.color = '#ff9933';
  const second = buildDrawingSet(scene, 'Тест', ['drawing-floor']);
  assert.notEqual(
    first.find((s) => s.kind === 'elevation')!.svg,
    second.find((s) => s.kind === 'elevation')!.svg,
  );
});
test('R17-5 PDF has exact A4 media boxes, correct byte offsets and rejects invalid pages', () => {
  const bytes = imagePagesPdf([
      {
        jpeg: new Uint8Array([255, 216, 255, 217]),
        width: 200,
        height: 100,
        widthMm: 297,
        heightMm: 210,
      },
      {
        jpeg: new Uint8Array([255, 216, 255, 217]),
        width: 200,
        height: 100,
        widthMm: 297,
        heightMm: 210,
      },
    ]),
    text = new TextDecoder('latin1').decode(bytes);
  assert.ok(text.startsWith('%PDF-1.4'));
  assert.ok(text.includes('/Count 2'));
  assert.ok(text.includes('/MediaBox [0 0 841.889764 595.275591]'));
  const start = Number(text.match(/startxref\n(\d+)/)![1]);
  assert.equal(new TextDecoder().decode(bytes.slice(start, start + 4)), 'xref');
  const xref = text.slice(text.indexOf('xref\n')).split('\n').slice(3, 11);
  xref.forEach((row, i) => {
    const offset = Number(row.slice(0, 10));
    assert.ok(
      new TextDecoder()
        .decode(bytes.slice(offset, offset + 20))
        .startsWith(`${i + 1} 0 obj\n`),
    );
  });
  assert.throws(() => imagePagesPdf([]));
  assert.throws(() =>
    imagePagesPdf([
      {
        jpeg: new Uint8Array(),
        width: 0,
        height: 100,
        widthMm: 297,
        heightMm: 210,
      },
    ]),
  );
});
