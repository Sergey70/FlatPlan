# FlatPlan status

Updated: 2026-09-07.

## Objective and current phase

Active iteration: **EDITOR-001**, final acceptance and publication. Previous completed iteration: **PLAN-001** (technical-passport reconstruction, deployed).

The full user objective is an editable 3D apartment with materials, local browser saving, independent arrangements of furniture/walls, exact dimensions and colors for every object and nested part, complete JSON export/import across devices, and usable mobile controls. A bathtub replaces the shower suggestion. Commits and pushes are explicitly authorized. Do not reduce completion to a static viewer or mark the objective complete before browser acceptance and Pages publication.

## Implemented

- A versioned full project document is authoritative for both 3D and 2D. The initial model has 238 objects/parts, the passport layout, a 170 × 75 cm bathtub, two furniture arrangements and three material palettes.
- Object tree, nested-part selection, catalog, duplicate/delete/hide/lock, physical dimensions along object axes (including parent scales), local coordinates, XYZ rotations, independent colors and materials. Wall openings preserve their parent relationship and are validated against overlaps/bounds. Floors and solids expose contours, points and holes.
- Three.js orbit/pan/zoom, move/rotate gizmos, selection outlines, day/evening, cutaway walls, labels, grid, room viewpoints and PNG capture. Cancellation restores both the mesh and document.
- Responsive mobile layout, touch camera gestures, 2D direct object drag, plan pan/pinch, selected-object focus, cancellation and 30-step undo/redo.
- Browser-local autosave, visible failure recovery, preserved corrupt storage, competing-tab detection, explicit JSON import preview, full export including all saved variants, camera and plan viewport. Import validates before mutation. No cloud sync or server is required.
- Independent arrangements can be saved, opened, replaced, renamed and deleted. Explicit per-object colors survive palette changes.
- Optional feature-detected WebMCP tools operate through the same document validation. Invalid color/material edits reject atomically, and locked objects cannot be removed through the tool.
- README contains non-developer usage, setup/start/stop, backup/transfer, verification and troubleshooting. Pages workflow now gates publication on unit/static/build and browser checks.

## Verification

- `npm run verify`: **passed**, 20 tests, oxlint, TypeScript and production build.
- Tests cover seed/bathtub, real mesh contours/holes/volumes, parent-scaled physical dimensions, object edits, complete file/storage round-trips, independent variants, undo/redo, malformed imports, camera/plan offsets and tool contracts.
- `npm run test:browser` against the final built `dist/`: **passed**. Desktop nested edits, exact dimensions/colors, saved variants, invalid import, real JSON download/reload; 3D axis/ring/Escape restoring mesh and model, label picking and PNG; storage quota/corrupt-data recovery; fresh-device mobile import, numeric inspector, real touch pinch/drag/cancel/multi-touch, plan pan/zoom reload, undo/redo, and widths 360/390/768. No page errors.
- Final desktop, mobile inspector and 2D-plan screenshots were visually inspected. Room labels were adjusted to readable screen sizes. Screenshots, PNG export and the JSON fixture are under ignored `.local/qa/`.
- Read-only independent source audit found and fixed helper picking, interrupted 3D drag, manual-save error handling, numeric Escape, multi-touch cancellation, plan navigation, and invalid WebMCP input. Final independent read-only review found no remaining significant issues; it also verified nested physical dimensions using an independently assembled Three.js hierarchy. Root reviewed staged changes; `git diff --cached --check` passed.
- Playwright 1.62.1 was added only as a development dependency. Dependency installation audit: zero vulnerabilities. Vite emits a nonblocking ~542 kB main-chunk warning; the renderer is lazy-loaded. No validation was weakened.

## Source assumptions and practical limits

The user has supplied only a photographed technical-passport plan. Reported areas remain reference metadata (inside 58.1 m², accounted with loggia 60.5 m²). Ceiling 2.8 m, opening heights/positions, service enclosure, columns and materials remain preliminary; see PLAN_ASSUMPTIONS.md. The photo stays ignored under `.local/reference/`, with no apartment/floor identifiers published.

Walls, floors, column holes and furniture are independently editable; there is no automatic room rebuilding, collision detection, construction documentation, cloud sync or photorealistic rendering. Browser data is tied to the site origin; JSON is the portable backup. Real iOS/Android hardware has not been tested; automated mobile evidence uses Chromium touch emulation at widths 360/390/768.

## Publication

Repository: https://github.com/Sergey70/FlatPlan (public).
Live URL: https://sergey70.github.io/FlatPlan/.
Source: GitHub Actions, `.github/workflows/pages.yml`.

Current public application is still PLAN-001 commit `8b3146ed591e3ebba542dce9f38b07ca448b6311`, successful run https://github.com/Sergey70/FlatPlan/actions/runs/34158564717. This editor iteration is not yet committed or published.

## Remaining acceptance

1. Commit EDITOR-001, push main, wait for successful build/browser/deploy jobs.
2. Verify the public URL and deployed production assets, record the run/commit here and stop the local server.
3. Mark the full user goal complete only after all of the above succeeds.
