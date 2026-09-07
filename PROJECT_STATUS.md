# FlatPlan status

Updated: 2026-09-08.

## Objective and current phase

Last completed and published iteration: **GALLERY-005**, separate interior concept gallery. Local acceptance, GitHub Actions and public-site checks are complete; no implementation iteration is active. PLAN-004 placed the kitchen at the bathroom wall with independently resizable partitions. UI-003 fixed switch thumbs, PLAN-002 supplied the first partition proposal and EDITOR-001 the full editor. Commits and pushes are explicitly authorized.

## Completed iteration: GALLERY-005

User requests a separate collection of visual renovation/layout concepts. Implemented a query-routed gallery at `?view=gallery`: 12 generated images crossing three layouts (separate kitchen, glass divider, open living/kitchen) with four styles (Scandinavian, warm minimalism, modern classic, soft loft). Keep the corrected kitchen at the bathroom wall and show independently generated SVG diagrams from the model with all existing windows. Gallery filters, accessible detail/compare dialogs and a return link must not read or mutate the editor project. Generated images are illustrative and can deviate in dimensions/furniture; diagrams describe the proposed wall scheme. No new dependencies or automatic application of photo concepts to the model.

Acceptance: `npm run verify`, `npm run test:browser` including gallery filters/details/comparison/mobile and editor-storage preservation; independent source/geometry review, visual review of all generated images and desktop/mobile gallery. Publish through existing GitHub Pages workflow and verify the live gallery and assets.

## Implemented

- GALLERY-005 adds `?view=gallery` and a new-tab link in editor **Варианты → Галерея интерьеров**. Twelve full apartment concept images cross three layouts (closed, glass, open) with four styles (Scandinavian, warm minimalism, modern classic, soft loft). The separate lazy-loaded page has layout/style filters, detail dialogs with materials and exact base-model diagrams, and comparison of any two concepts. Comparison choices survive filter changes; mobile comparison is stacked. Gallery navigation, reload and even a combined gallery/layout query never read or change editor storage.
- All 12 PNGs were visually inspected and copied unchanged to `public/gallery/images/`; total gallery assets about 24 MiB. Images load lazily, support retry and full-image viewing. The gallery itself needs no WebGL, service, API key or new dependency. Original project geometry and presets remain unchanged.
- Three deterministic SVG diagrams under `public/gallery/plans/` use `createInitialProject()` and `planDrawing()`. They preserve all five exact window footprints and original structures; glass changes only the transverse divider symbol, open removes only the three proposed walls. The schematics represent the base model, not saved visitor edits. The diagram export script and geometry/asset regression checks are committed.
- AI images remain conceptual: some contain a short residual wall or a changed column/door/cabinet detail. Specific discrepancies are noted in detail and comparison views. Broad geometry drift in early attempts was corrected; the selected glass Scandinavian image has no extra bathroom window. `GALLERY_ASSETS.md` records public asset provenance. Automatic review rejected publishing the full prompt payload; all actual prompts/reference paths/discarded attempts remain only in ignored `.local/imagegen/`, including `GALLERY_PROMPTS.md` and `gallery-manifest.json`.

- Default `kitchen-by-bathroom-v2` has 222 editable objects/parts: kitchen in the lower zone, room 2 above, existing bedroom, common hall, bathroom with 170 × 75 cm bathtub and loggia. The open alternative keeps the corrected furniture placement without the new walls. Three material palettes remain available.
- Kitchen cabinets, sink, hob and oven occupy the former TV location along the bathroom wall. Three 60 cm modules share a 1.84 m worktop. A separate fridge stands at the bottom wall; a 90 cm dining table has two chairs and a 1.385 m working aisle. Sofa, TV, rug, coffee table and floor lamp have moved into the upper room; its TV does not block the hall door.
- Lower left window belongs to the kitchen; upper left window belongs to room 2. The original bedroom window and both inferred loggia openings remain unchanged. All five windows retain blue 2D symbols.
- «Продление стены санузла — кухня / холл» is a separate 1.00 × 2.80 × 0.11 m wall on X=4.205, Z=6.10…7.10, joining the column to the original bathroom wall. It includes an 80 cm door. The transverse kitchen/room divider remains 3.74 × 2.80 × 0.12 m; the upper room/hall partition retains a 90 cm doorway.
- Quick buttons «Размер стены у кухни» and «Стена между кухней и комнатой» select the corresponding wall. Its properties explicitly label length, height and thickness in metres. Resizing preserves the centre; position and opening are separately editable. Original bathroom wall and all other geometry remain independent.
- Proposed walls can be hidden/restored together or deleted individually. Restoration remains available after deleting all three; moved/recolored survivors retain their edits. A deleted wall restores the active arrangement's geometry and is explicitly made visible, including for older v1 arrangements saved with hidden walls.
- Ordinary page loads preserve saved browser projects. «Открыть кухню у санузла» or `?layout=kitchen-by-bathroom` explicitly applies v2 once with a complete previous-scene backup «До переноса кухни к санузлу» and all earlier arrangements retained. The previous `?layout=separate-kitchen` link remains an alias. Both open and v1 partitioned projects can upgrade. Failed upgrades retain the loaded project and pause autosave.
- Existing full editor capabilities remain: common 2D/3D document, nested geometry/dimensions/materials, validated wall openings and floor holes, desktop/touch manipulation, history, arrangements, JSON import/export, camera, lighting and local save recovery. UI-003's switch fix remains in place. No new dependencies.

## Verification

- GALLERY-005: `npm run verify` passed all **33 tests**, lint, TypeScript and production build. Four gallery checks cover all 12 asset/layout pairs, exact preservation of five windows and original structures, the intended wall differences and deterministic SVG exports.
- `npm run test:browser` passed gallery and the entire existing editor suite against the production build: 12 image decodes, three diagrams, both filters, detail/compare/clear, two-selection limit, keyboard Escape/focus restoration, 360/390/768 widths, mobile dialogs, byte-for-byte storage preservation and reload. Existing desktop/touch editing, JSON transfer, 3D manipulation, save recovery and both old-project upgrades still pass; no page errors.
- Inspected desktop/mobile gallery, detail and comparison screenshots and every chosen illustration. A separate source review found one wording issue (static diagrams called current model); changed to base model. Three-plan geometry implementation was separately reviewed and its tests independently rerun. Final diff and ignored prompt storage checked. Artifacts under `.local/qa/`; entry/gallery/editor/renderer are separate chunks, largest approximately 396 kB.

### Earlier editor acceptance

- `npm run verify`: passed, 29 tests, lint, TypeScript and production build. Updated window/room and kitchen-aisle assertions; new checks cover exact independent wall resizing, preservation of its opening/bathroom wall, and old-arrangement restoration including hidden snapshots.
- Final `npm run test:browser` passed against the final built `dist/`: delete/restore all three walls, independent wall length/height/thickness through the shortcut, desktop/mobile editing and JSON transfer/reload, old open and v1 upgrades by button/deep link with full backup, 3D gizmos, storage recovery, touch and widths 360/390/768. No page errors.
- Independent read-only geometry audit evaluated 136 furniture leaf meshes against 81 structure volumes/details: no real wall/column/furniture intersections; clear door approaches. A 2.5 cm grid with a 30 cm traveller radius finds paths from hall to kitchen, both rooms and bathroom. Split floors continuously cover 39.276 m²; all five window openings are preserved.
- A separate read-only migration/UI audit confirmed complete backup preservation and accessible v1 upgrades; its two restore findings were fixed and covered by unit/browser checks.
- Desktop default-plan and mobile screenshots inspected, followed by fresh published desktop 3D and desktop/mobile 2D screenshots. QA artifacts remain ignored under `.local/qa/`. Vite reports a nonblocking approximately 547 kB main chunk; renderer is lazy-loaded. Final source diff and `git diff --check` passed.

## Source assumptions and limits

Only the photographed technical passport is available. The user's latest correction determines the kitchen location. «Расширение стены» is interpreted as extending the bathroom west wall to the column; this remains an adjustable proposal. Reported areas are 58.1 m² inside and 60.5 m² accounted with loggia. Model large-zone area is 39.276 m² versus passport 39.4 m². Ceiling 2.8 m, exact window dimensions/sills, service enclosure, columns and furniture remain preliminary. The sofa has about 1 cm clearance to the proposed divider, so actual measurements must guide later refinement. See PLAN_ASSUMPTIONS.md for coordinates/history.

Photo and identifiers remain ignored under `.local/reference/`. Walls/floors are independently editable: moving/removing a wall does not rebuild room contours automatically. No automatic collision prevention, construction documentation, cloud sync or automatic photorealistic rendering of the edited scene. The separate image gallery illustrates styles and is not a measured construction model. Browser data is origin-specific; JSON is the portable backup. Mobile testing uses Chromium touch emulation, not real iOS/Android hardware.

## Publication

Repository: https://github.com/Sergey70/FlatPlan (public).
Live URL: https://sergey70.github.io/FlatPlan/.
New-layout URL: https://sergey70.github.io/FlatPlan/?layout=kitchen-by-bathroom.
Gallery URL: https://sergey70.github.io/FlatPlan/?view=gallery.
GALLERY-005 published application: `2fdc2106454cb6b0dee684bea5cf039d97443384`, successful build/browser/deployment run https://github.com/Sergey70/FlatPlan/actions/runs/34165933124. Fresh public gallery contexts passed the full gallery scenario: 12 image decodes, three diagrams, layout/style filters, detail and two-concept comparison, keyboard focus, mobile widths and byte-identical editor storage after reload. Fresh public desktop/mobile editors loaded 222 elements, two arrangements and three removable walls; WebGL and 2D worked, and the new gallery link opened a separate tab without changing the saved project. All 25 public production files returned HTTP 200 and matched the final build byte-for-byte. No page/asset errors. Screenshots and hash results remain ignored under `.local/qa/`.
Source: `.github/workflows/pages.yml`; full unit/static/build and browser acceptance gate deployment.

Published PLAN-004 application: `b7512105cd6d16af11a37b84ff827aa21f46b6a6`, successful build/browser/deployment run https://github.com/Sergey70/FlatPlan/actions/runs/34164187248. Fresh public desktop/mobile contexts loaded 222 elements, verified the kitchen at [4.03, 0, 7.14], two variants, three removable walls, live WebGL and 2D, with no page/asset errors. All six public production files returned HTTP 200 and matched a fresh build of the final committed source byte-for-byte. The first comparison used an earlier pre-documentation build; rebuilding the committed source resolved the asset-name difference. Hashes/screenshots are in ignored `.local/qa/`. The existing local server remains available at http://127.0.0.1:5173/.

## Next

Wait for measured drawings and preferred concepts. Existing walls, kitchen, furniture and materials can be refined in the editor; gallery concepts are not automatically applied. No required work remains for GALLERY-005.
