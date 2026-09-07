# FlatPlan status

Updated: 2026-09-07.

## Objective and current phase

Active iteration: **PLAN-002**, separate kitchen and a second room using the passport window locations. Implementation and local acceptance are complete; GitHub Pages publication is the remaining gate. Last completed iteration: **EDITOR-001**, the full editable apartment with verified Pages publication. PLAN-001 supplied the preliminary passport reconstruction. Commits and pushes are explicitly authorized.

The user wants an editable 3D apartment with materials, browser saving, independent arrangements, exact dimensions/colors for objects and nested parts, full JSON transfer and mobile controls. The latest request makes the default layout a separate kitchen and one additional room, each with its own window, with removable proposed walls and the ability to add walls elsewhere.

## Implemented

- The default project contains 224 editable objects/parts: separate kitchen, two rooms, shared hall, bathroom with a 170 × 75 cm bathtub and loggia. Two initial arrangements cover the partitioned and open layouts; three material palettes remain available.
- Passport windows are preserved and clarified: a wide upper opening for the existing room, two separate left-facade openings for the kitchen and room 2, with a solid pier between them. The lower left window starts near Z=6.60 instead of 6.10. Loggia glazing remains inferred. Windows have visible blue symbols in 2D above projected frames.
- Three editable 12 cm proposed walls join existing solid structure without crossing glazing. The kitchen and room 2 have 90 and 80 cm doors into the common hall. Split floors continuously cover the old footprint, including under the proposed walls. The kitchen, dining table and TV cabinet fit the proposed rooms; the kitchen-to-table passage is approximately 92.5 cm.
- Objects panel offers hide/restore for the three proposed walls and Add wall on plan. Individual walls and openings retain normal move, size, rotation, material, hide/delete and undo controls. Hide/restore retains moved/recolored walls and recreates a deleted proposed wall only on explicit restore.
- Existing saved browser projects are unchanged on ordinary refresh. An explicit button or `?layout=separate-kitchen` applies the new preset, preserving all previous arrangements and a complete current-scene backup named «До разделения кухни и комнаты». The deep link applies once and removes its query parameter. Failed upgrades retain the loaded project and pause autosave.
- Versioned full document shared by 2D/3D; object tree, nested parts, physical dimensions, contours and holes; validated wall openings; touch camera/plan controls; 3D move/rotate gizmos; lighting, cutaway, labels and PNG; 30-step undo/redo.
- Browser autosave with quota/corrupt-storage/competing-tab recovery, JSON import preview and atomic validation, full JSON export, independent arrangements. Optional WebMCP uses the same validated editing operations. No server or cloud synchronization is required.
- README describes non-developer controls, setup/start/stop, backup/transfer, checks and troubleshooting. Source assumptions and the proposed wall/window coordinates are recorded in PLAN_ASSUMPTIONS.md. No new dependency was added in PLAN-002.

## Verification

- `npm run verify`: **passed**, 27 tests, oxlint, TypeScript and production build.
- Seven PLAN-002 tests verify window assignment and clearance, continuous non-overlapping floor coverage, hall access, furniture/door clearance, 90 cm kitchen passage, wall edit/hide/delete/restore/add/JSON/history behavior, preservation of existing projects, and visible window symbols.
- Existing tests continue to cover real geometry and floor holes, parent-scaled dimensions, bathtub, full file/storage round-trips, arrangements, history, malformed imports, camera/plan state and tool contracts.
- `npm run test:browser` against final `dist/`: **passed**. New default layout, bulk hide/restore, individual delete/undo, precisely positioned added wall, explicit/deep-link upgrade with full backup and exact reload. Existing desktop nested edits, JSON download/reload, 3D move/rotate/cancel, label picking, PNG, storage recovery and mobile import/inspector/pinch/drag/cancel/history/reload remain green. Mobile widths 360/390/768; no page errors.
- The upgrade browser test exposed a camera-null sentinel bug; an undefined initial sentinel now allows resetting a saved camera when applying a preset. Exact reload after upgrade passed.
- Read-only independent geometry audit confirmed all doors and connected routes from the hall to kitchen, both rooms and bathroom, no new wall/furniture intersections, continuous 39.276 m² model floor coverage, and walls meeting the solid pier/column. Its dining-clearance finding was fixed and protected by a regression test.
- Final independent read-only review found no material data-loss/control issues. It checked complete backups, restoration of moved/recolored walls and door positions, selected-child cleanup, JSON round-trip, and atomic rejection when fewer than two arrangement slots remain.
- Desktop default plan and mobile plan screenshots were visually inspected. QA artifacts remain ignored under `.local/qa/`. Vite reports a nonblocking approximately 546 kB main-chunk warning; the renderer remains lazy-loaded. Final source diff and `git diff --check` passed.

## Source assumptions and practical limits

Only a photographed technical-passport plan is available. Reported areas remain reference metadata: inside 58.1 m², accounted with loggia 60.5 m²; the original large-zone model area is 39.276 m² versus passport 39.4 m². Ceiling 2.8 m, window widths/heights/sills, service enclosure, columns, furniture and materials remain preliminary. See PLAN_ASSUMPTIONS.md. The photo stays ignored under `.local/reference/`; apartment/floor identifiers are not published.

Walls and floors are independently editable. Removing walls leaves continuous flooring but does not automatically merge zones or rebuild room contours. There is no automatic collision prevention, construction documentation, cloud sync or photorealistic rendering. Browser data is tied to the site origin; JSON is the portable backup. Real iOS/Android hardware has not been tested; mobile acceptance uses Chromium touch emulation.

## Publication

Repository: https://github.com/Sergey70/FlatPlan (public).
Live URL: https://sergey70.github.io/FlatPlan/.
Explicit new-layout URL: https://sergey70.github.io/FlatPlan/?layout=separate-kitchen.
Source: GitHub Actions, `.github/workflows/pages.yml`; unit/static/build and full browser checks gate deployment.

Previous published application commit: `eaffadd743d862a1e5a34a53ad5bc5bdc6166c23`, successful run https://github.com/Sergey70/FlatPlan/actions/runs/34161376312. PLAN-002 publication and live verification are pending.

## Next

Publish PLAN-002, wait for its Actions checks/deployment, compare public production files to the verified local build and run fresh desktop/mobile live smoke checks. Then mark the iteration complete. Future refinements depend on the detailed measured plan and interior preferences; updates must preserve saved browser projects.
