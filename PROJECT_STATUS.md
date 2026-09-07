# FlatPlan status

Updated: 2026-09-07.

## Objective and current phase

Active iteration: **PLAN-004**, correct kitchen placement to the former TV location by the bathroom wall, with an independently resizable wall extension and a kitchen/room divider. Last completed: UI-003 switch-thumb fix; PLAN-002 supplied the first partition proposal and EDITOR-001 the full editor. Commits and pushes are explicitly authorized. Implementation and final local acceptance are complete; Pages publication is the remaining gate.

## Implemented

- Default `kitchen-by-bathroom-v2` has 222 editable objects/parts: kitchen in the lower zone, room 2 above, existing bedroom, common hall, bathroom with 170 × 75 cm bathtub and loggia. The open alternative keeps the corrected furniture placement without the new walls. Three material palettes remain available.
- Kitchen cabinets, sink, hob and oven occupy the former TV location along the bathroom wall. Three 60 cm modules share a 1.84 m worktop. A separate fridge stands at the bottom wall; a 90 cm dining table has two chairs and a 1.385 m working aisle. Sofa, TV, rug, coffee table and floor lamp have moved into the upper room; its TV does not block the hall door.
- Lower left window belongs to the kitchen; upper left window belongs to room 2. The original bedroom window and both inferred loggia openings remain unchanged. All five windows retain blue 2D symbols.
- «Продление стены санузла — кухня / холл» is a separate 1.00 × 2.80 × 0.11 m wall on X=4.205, Z=6.10…7.10, joining the column to the original bathroom wall. It includes an 80 cm door. The transverse kitchen/room divider remains 3.74 × 2.80 × 0.12 m; the upper room/hall partition retains a 90 cm doorway.
- Quick buttons «Размер стены у кухни» and «Стена между кухней и комнатой» select the corresponding wall. Its properties explicitly label length, height and thickness in metres. Resizing preserves the centre; position and opening are separately editable. Original bathroom wall and all other geometry remain independent.
- Proposed walls can be hidden/restored together or deleted individually. Restoration remains available after deleting all three; moved/recolored survivors retain their edits. A deleted wall restores the active arrangement's geometry and is explicitly made visible, including for older v1 arrangements saved with hidden walls.
- Ordinary page loads preserve saved browser projects. «Открыть кухню у санузла» or `?layout=kitchen-by-bathroom` explicitly applies v2 once with a complete previous-scene backup «До переноса кухни к санузлу» and all earlier arrangements retained. The previous `?layout=separate-kitchen` link remains an alias. Both open and v1 partitioned projects can upgrade. Failed upgrades retain the loaded project and pause autosave.
- Existing full editor capabilities remain: common 2D/3D document, nested geometry/dimensions/materials, validated wall openings and floor holes, desktop/touch manipulation, history, arrangements, JSON import/export, camera, lighting and local save recovery. UI-003's switch fix remains in place. No new dependencies.

## Verification

- `npm run verify`: passed, 29 tests, lint, TypeScript and production build. Updated window/room and kitchen-aisle assertions; new checks cover exact independent wall resizing, preservation of its opening/bathroom wall, and old-arrangement restoration including hidden snapshots.
- Final `npm run test:browser` passed against the final built `dist/`: delete/restore all three walls, independent wall length/height/thickness through the shortcut, desktop/mobile editing and JSON transfer/reload, old open and v1 upgrades by button/deep link with full backup, 3D gizmos, storage recovery, touch and widths 360/390/768. No page errors.
- Independent read-only geometry audit evaluated 136 furniture leaf meshes against 81 structure volumes/details: no real wall/column/furniture intersections; clear door approaches. A 2.5 cm grid with a 30 cm traveller radius finds paths from hall to kitchen, both rooms and bathroom. Split floors continuously cover 39.276 m²; all five window openings are preserved.
- A separate read-only migration/UI audit confirmed complete backup preservation and accessible v1 upgrades; its two restore findings were fixed and covered by unit/browser checks.
- Desktop default-plan and mobile screenshots inspected. Published visual verification remains pending. QA artifacts remain ignored under `.local/qa/`. Vite reports a nonblocking approximately 547 kB main chunk; renderer is lazy-loaded. Final source diff and `git diff --check` passed.

## Source assumptions and limits

Only the photographed technical passport is available. The user's latest correction determines the kitchen location. «Расширение стены» is interpreted as extending the bathroom west wall to the column; this remains an adjustable proposal. Reported areas are 58.1 m² inside and 60.5 m² accounted with loggia. Model large-zone area is 39.276 m² versus passport 39.4 m². Ceiling 2.8 m, exact window dimensions/sills, service enclosure, columns and furniture remain preliminary. The sofa has about 1 cm clearance to the proposed divider, so actual measurements must guide later refinement. See PLAN_ASSUMPTIONS.md for coordinates/history.

Photo and identifiers remain ignored under `.local/reference/`. Walls/floors are independently editable: moving/removing a wall does not rebuild room contours automatically. No automatic collision prevention, construction documentation, cloud sync or photorealistic rendering. Browser data is origin-specific; JSON is the portable backup. Mobile testing uses Chromium touch emulation, not real iOS/Android hardware.

## Publication

Repository: https://github.com/Sergey70/FlatPlan (public).
Live URL: https://sergey70.github.io/FlatPlan/.
New-layout URL: https://sergey70.github.io/FlatPlan/?layout=kitchen-by-bathroom.
Source: `.github/workflows/pages.yml`; full unit/static/build and browser acceptance gate deployment.

Previous published UI-003 application: `46864cc2c58636449790cc11a9b022dcfd730e18`, successful run https://github.com/Sergey70/FlatPlan/actions/runs/34163388090. PLAN-004 publication is pending. The existing local server remains available at http://127.0.0.1:5173/.

## Next

Publish PLAN-004 and verify public production files plus fresh desktop/mobile editor contexts. Then wait for a detailed measured plan and further interior preferences while preserving saved browser projects.
