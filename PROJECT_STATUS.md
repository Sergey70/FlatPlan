# FlatPlan status

Updated: 2026-09-08.

## Current iteration

**PLAN-008** — replace the preliminary passport model with the user's supplied Plan v3 file, update the gallery and publish. Implementation is complete; final verification/publication is in progress. User authorized project changes and publication.

Default: right-hand apartment (Plan 2, bathtub). Six editable arrangements: both apartments, three detached bathroom studies and eight loose objects. Source file and project identifiers remain local; only anonymous numeric geometry is published.

## Implemented

- `scripts/import-plan-source.py` extracts all 106 wall segments, 20 openings, 37 room/service polygons and 122 items once into `lib/plan-source.json`. Units are centimetres; coordinates normalize per drawing, then convert to metres.
- `lib/plan-project.ts` builds scenes preserving wall centrelines and mitred profiles, wall thickness/height, opening spans and sill levels, room polygons, item positions/dimensions/angles/mirrors and recorded vertical levels. All walls are 2.70 m. Each apartment contains four window/French openings; the previously inferred fifth window is removed.
- `lib/plan-furniture.ts` creates editable semantic primitives. Catalog mesh details/materials are absent from the source and remain illustrative. Missing vertical heights have documented fallbacks. Ceiling fixtures hide in cutaway, remain at their source/fallback level in full 3D and remain represented in 2D.
- Normalized wall profiles are part of version-1 JSON and work in common 2D/3D geometry, bounds, opening subtraction and independent wall resizing. Legacy rectangular walls remain compatible.
- One-time source-revision migration on ordinary load adds six arrangements, preserves every prior arrangement/name and backs up the complete current scene as «До обновления по файлу .plan». It opens Plan 2. Subsequent refreshes retain edits, including deletion of starter arrangements. Exceeding the 30-variant limit fails atomically and pauses autosave. Explicit source reopen and layout deep links remain available.
- Source card, file/new-project/reset copy, room camera presets and default added-wall height updated. Existing editor controls, detailed object editing, history, JSON, touch handling and DATA-007 permanent reset remain available. Legacy proposal shortcuts only appear when reopening a legacy scene.
- Gallery now shows 15 renders of these five actual layouts with three editor palettes, plus five deterministic SVGs. Old 12 AI concept images and three obsolete diagrams are removed from current assets. PNG exports are checked against canonical geometry; the manifest checks image hashes and numerically normalized scene hashes across platforms.
- README, PLAN_ASSUMPTIONS and GALLERY_ASSETS document current source, migration, editing, local setup/start/test/stop, regeneration and limitations. Historical passport assumptions remain explicitly marked as history. No new dependencies.

## Verification

- Independent comparison against the original local file checked **3011 numeric values**, with maximum extraction rounding error **4.99998e-9 cm**; every wall, polygon and item accounted for exactly once.
- `npm run verify` passed **40 tests**, lint, TypeScript and production build. Six new source tests cover every wall corner/centreline/opening/sill, all item dimensions/transforms, all room areas, profiled wall resizing/JSON and safe migration. The final gate is repeated after manifest/documentation updates before publication.
- The complete `npm run test:browser` passed: six source scenes and windows, wall edits/addition, persistent refresh, deliberate variant deletion and mobile widths, plus all retained desktop/3D/JSON/storage/reset/upgrade/touch regressions. No page errors. Cross-engine comparisons tolerate 1e-8 numeric round-off while all other values remain exact.
- New gallery render pipeline completed all 15 images at 1470 × 1205 with browser-to-source numeric comparison. Manifest numbers round to seven decimal places solely for portable hashing; model coordinates remain unchanged.
- Desktop 3D, exact 2D and mobile editor screenshots inspected; full-size apartment/bath render samples and all 15 renders reviewed in a contact sheet. Desktop/mobile gallery review and final source diff completed, including storage migration and geometry changes. `git diff --check` passed.
- QA files remain ignored under `.local/qa/`. Isolated browser contexts never modify the user's live storage.

## Limits

The file is authoritative for this revision and supersedes the earlier photographed passport. It does not prove real-world construction measurements. Furniture detail geometry, materials and missing heights are illustrative. Door opening direction codes are retained in anonymous source data; leaves/swing arcs are not visualized. Rooms, walls and furniture remain independent; moving walls does not regenerate floors or check collisions. No engineering networks, cloud sync or live regeneration of gallery images from visitor edits. Mobile QA uses Chromium touch emulation, not physical devices.

## Publication

Repository: https://github.com/Sergey70/FlatPlan
Editor: https://sergey70.github.io/FlatPlan/
Default deep link: https://sergey70.github.io/FlatPlan/?layout=plan-2
Gallery: https://sergey70.github.io/FlatPlan/?view=gallery

PLAN-008 publication pending. Workflow `.github/workflows/pages.yml` gates deployment with unit/static/build and complete browser checks.

Last published application before PLAN-008: DATA-007 `7adbca220b225b9da8140669acb1d55d7dfe1c9b`, successful run https://github.com/Sergey70/FlatPlan/actions/runs/34220689856. It added scoped permanent browser-data reset, history/import clearing and other-tab protection; public acceptance and asset hashes passed. Repository started clean at completion-record commit `36a8068`.

Earlier work: GALLERY-006 formal gallery copy; GALLERY-005 separate concept gallery; PLAN-004 kitchen location and adjustable partitions; UI-003 switches; PLAN-002 windows/partition proposal; EDITOR-001 editor. Their old assumptions do not override the current .plan.
