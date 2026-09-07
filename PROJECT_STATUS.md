# FlatPlan status

Updated: 2026-09-07.

## Current result

PLAN-001 implemented: preliminary reconstruction of the user's technical-passport drawing. Shared polygons/walls drive 2D and 3D; the concave living/kitchen floor excludes the bathroom, separate column and facade pier. Loggia replaces the demo hall. Hatched bathroom enclosure remains a separate uncertain volume. Original photo is ignored under `.local/reference/`; no apartment/floor identifiers are published.

Reported areas: living/kitchen 39.4, living room 14.7, bathroom 4.0, loggia 3.4 physical / 2.4 accounted. Inside total 58.1, accounted total 60.5 m². Approximate modeled areas are distinct. Ceiling 2.8 m, heights/positions of openings, service zone, columns and finishes are assumptions. Furniture is an optional suggestion, off by default. See PLAN_ASSUMPTIONS.md.

Last completed: PLAN-001, including publication verification. No active implementation iteration. DEMO-001 established the viewer and Pages setup.

## Verification

- `npm run verify`: passed (9 tests, oxlint, TypeScript, production build).
- New regressions cover reported versus accounted areas, nonoverlapping floor footprints, actual rendered triangle areas/normals/holes and room adjacency at door openings. Existing palette/state, responsive camera and pointer gesture checks still pass.
- WebMCP: read-back contains the technical-passport metadata and correct areas; selecting the loggia in 2D, switching to bathroom 3D/evening/full walls/materials succeeded; obsolete hall ID rejected atomically; defaults restored. Renderer unavailable flag remained false.
- Read-only independent source audit found and resolved TV direction, table/sofa overlap, shower approach and a 3 cm bathroom closure gap. Final geometry/UI/data audit found no remaining significant issue. Root reviewed the final diff; `git diff --check` passed.
- Full screenshot/visual browser QA has not been performed. Furniture is not an approved fit-out plan.
- Three.js scene is lazy-loaded; build warns about its ~606 kB minified / 155 kB gzip chunk. No new dependencies were added. Last dependency audit from DEMO-001 reported zero vulnerabilities.

## Publication

Repository: https://github.com/Sergey70/FlatPlan (public).
Live URL: https://sergey70.github.io/FlatPlan/.
GitHub Pages source: GitHub Actions; workflow `.github/workflows/pages.yml`.
PLAN-001 application commit: 8b3146ed591e3ebba542dce9f38b07ca448b6311. Build and deploy succeeded: https://github.com/Sergey70/FlatPlan/actions/runs/34158564717. Public URL returned HTTP 200; all 6 production files (HTML, two JS chunks, CSS, icon and oak texture) matched the verified local build byte-for-byte.

## Next

Wait for a detailed measured plan, ceiling/opening heights and interior preferences. Do not treat preliminary dimensions as construction measurements. No editor/import/save support is claimed.
