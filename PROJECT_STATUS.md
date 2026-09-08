# FlatPlan status

Updated: 2026-09-08.

## Current iteration

**PLAN-009 complete and published** — only the right apartment remains among the starter apartment plans. The left starter and gallery entries are removed; 21.43 m² is «Кухня» and 13.55 m² is «Спальня». Existing right-plan edits survive the in-place update; the obsolete left-plan link resolves to the right plan. Local, CI and public acceptance passed. No active implementation work remains. Independent bathroom studies and loose objects are retained.

Default: the right-hand apartment with bathtub; 21.43 m² is «Кухня», 13.55 m² is «Спальня». Five starter arrangements remain: one apartment, three detached bathroom studies and eight loose objects. Source file and project identifiers remain local; only anonymous numeric geometry is published.

## PLAN-009 implementation and acceptance

- Removed the left apartment from active source data and conversion output after assigning all objects, so its furniture cannot become loose sample items. Retained 70 wall segments, 12 openings and 81 items. Comparison against the preceding source confirmed identical retained geometry; only the removed drawing and requested names changed.
- Added an in-place PLAN-008 → PLAN-009 migration. It removes the retired starter (including source copies), renames kitchen/bedroom by stable room IDs in current/saved scenes, preserves geometry, furniture, view and custom arrangement edits, and retains existing arrangement IDs. If the left starter was active, it opens the saved right scene; if that scene was removed, it restores only the right starter. No complete scene reset or unnecessary extra backup.
- Retired `?layout=plan-1` resolves to the right plan. Starter list, labels, source card and file/reset descriptions reflect the selection. Bathroom studies and loose objects remain independently available.
- Gallery now has four schemes and 12 model renders, with no left-apartment card/filter/asset. Assets use `public/gallery/plan-009/` and retain scene/image provenance checks. Regenerated SVG labels explicitly identify «Кухня · 21,43 м²» and «Спальня · 13,55 м²».
- Added migration regressions for current and saved right-plan edits, an active left plan, missing right starter and the 30-arrangement limit. Browser checks cover PLAN-008 storage upgrade, the old left link, requested labels and persistence after reload.
- Local acceptance passed: `npm run verify` (**42 tests**, lint, TypeScript and production build) and the complete `npm run test:browser`. New migration/labels, all retained editor/JSON/reset/touch scenarios, 12 gallery images/four SVGs and 360/390/768 widths pass. The 2D screenshot confirms correct kitchen/bedroom placement; geometry and migration source diffs and `git diff --check` reviewed. Final build after documentation updates passed. GitHub Actions independently passed the full verification/browser gates and deployed successfully.

## Earlier PLAN-008 implementation

- `scripts/import-plan-source.py` extracts all 106 wall segments, 20 openings, 37 room/service polygons and 122 items once into `lib/plan-source.json`. Units are centimetres; coordinates normalize per drawing, then convert to metres.
- `lib/plan-project.ts` builds scenes preserving wall centrelines and mitred profiles, wall thickness/height, opening spans and sill levels, room polygons, item positions/dimensions/angles/mirrors and recorded vertical levels. All walls are 2.70 m. Each apartment contains four window/French openings; the previously inferred fifth window is removed.
- `lib/plan-furniture.ts` creates editable semantic primitives. Catalog mesh details/materials are absent from the source and remain illustrative. Missing vertical heights have documented fallbacks. Ceiling fixtures hide in cutaway, remain at their source/fallback level in full 3D and remain represented in 2D.
- Normalized wall profiles are part of version-1 JSON and work in common 2D/3D geometry, bounds, opening subtraction and independent wall resizing. Legacy rectangular walls remain compatible.
- One-time source-revision migration on ordinary load adds six arrangements, preserves every prior arrangement/name and backs up the complete current scene as «До обновления по файлу .plan». It opens Plan 2. Subsequent refreshes retain edits, including deletion of starter arrangements. Exceeding the 30-variant limit fails atomically and pauses autosave. Explicit source reopen and layout deep links remain available.
- Source card, file/new-project/reset copy, room camera presets and default added-wall height updated. Existing editor controls, detailed object editing, history, JSON, touch handling and DATA-007 permanent reset remain available. Legacy proposal shortcuts only appear when reopening a legacy scene.
- Gallery now shows 15 renders of these five actual layouts with three editor palettes, plus five deterministic SVGs. Old 12 AI concept images and three obsolete diagrams are removed from current assets. PNG exports are checked against canonical geometry; the manifest checks image hashes and numerically normalized scene hashes across platforms.
- README, PLAN_ASSUMPTIONS and GALLERY_ASSETS document current source, migration, editing, local setup/start/test/stop, regeneration and limitations. Historical passport assumptions remain explicitly marked as history. No new dependencies.

## Earlier PLAN-008 verification

- Independent comparison against the original local file checked **3011 numeric values**, with maximum extraction rounding error **4.99998e-9 cm**; every wall, polygon and item accounted for exactly once.
- Final `npm run verify` passed **40 tests**, lint, TypeScript and production build after manifest/documentation updates. Six new source tests cover every wall corner/centreline/opening/sill, all item dimensions/transforms, all room areas, profiled wall resizing/JSON and safe migration. GitHub Actions independently passed the same gate on Linux.
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

PLAN-008 published application: `12082659873f04a70495d109aa65a96e7b0c863f`. Successful build/browser/deployment run: https://github.com/Sergey70/FlatPlan/actions/runs/34227401936.

PLAN-009 published application: `599e9b0877cdea091c8e3134b4bcc3f95f070f90`. Successful run: https://github.com/Sergey70/FlatPlan/actions/runs/34230731759. Public acceptance reran `checkSourcePlan` and `checkGallery` in isolated Chromium contexts: five current starter scenes, requested kitchen/bedroom labels, editing/reload, both PLAN-008 migration cases, retired left link, mobile widths and all 12 gallery images/four diagrams passed. All **27 public production files** returned HTTP 200 and matched the final `dist/` byte-for-byte. Evidence remains ignored under `.local/qa/plan-009-public/` and `.local/qa/plan-009-public-assets.json`. The completion-record commit changes documentation only.

The complete `FLATPLAN_QA_URL=https://sergey70.github.io/FlatPlan/ npm run test:browser` passed against the public site in isolated contexts: gallery, six source arrangements, exact source geometry, existing editor manipulation, JSON, old-project backup/reload, reset/recovery and desktop/mobile touch scenarios. All **31 public production files** returned HTTP 200 and matched verified `dist/` byte-for-byte, including 15 PNGs and five SVGs. Evidence: ignored `.local/qa/plan-008-public-assets.json` and browser screenshots. Source is the deployed application plus this completion record; working tree is clean after the record commit. Workflow `.github/workflows/pages.yml` continues to gate deployment with unit/static/build and complete browser checks.

Last published application before PLAN-008: DATA-007 `7adbca220b225b9da8140669acb1d55d7dfe1c9b`, successful run https://github.com/Sergey70/FlatPlan/actions/runs/34220689856. It added scoped permanent browser-data reset, history/import clearing and other-tab protection; public acceptance and asset hashes passed. Repository started clean at completion-record commit `36a8068`.

Earlier work: GALLERY-006 formal gallery copy; GALLERY-005 separate concept gallery; PLAN-004 kitchen location and adjustable partitions; UI-003 switches; PLAN-002 windows/partition proposal; EDITOR-001 editor. Their old assumptions do not override the current .plan.
