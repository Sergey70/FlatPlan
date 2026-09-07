# FlatPlan status

Updated: 2026-09-07.

## Current result

DEMO-001: interactive 63 m² sample apartment, React + TypeScript + Three.js, static Vite build. Includes furnished living/kitchen, bedroom, hall and bathroom, generated oak texture, three palettes, day/evening light, cutaway walls, room focus, 2D fallback, mouse/touch and keyboard controls. All dimensions are illustrative. Real plan is pending user input.

## Verification

- `npm run verify`: passed (6 tests, oxlint, TypeScript, production build).
- `npm audit --audit-level=moderate`: passed, zero reported vulnerabilities.
- HTTP check with production output mounted at `/FlatPlan/`: page and all 6 linked/chunk/material assets passed; no backend required.
- WebMCP: both tools registered in a supported browser; valid state change and read-back passed; invalid palette rejected atomically; defaults restored. WebGL initialization reported available.
- Read-only independent code audit addressed responsive camera fitting, pointer gesture selection, context restoration, door direction and 2D label layering. Camera projection and gesture cases have regression tests.
- Full screenshot/visual browser QA has not been performed.
- Non-blocking build note: the lazily loaded Three.js scene chunk is about 577 kB minified / 147 kB gzipped.

## Publication

Repository: https://github.com/Sergey70/FlatPlan (made public by owner).
GitHub Pages workflow: `.github/workflows/pages.yml`.
Live URL: https://sergey70.github.io/FlatPlan/ — verified HTTP 200.
The owner selected GitHub Actions as the Pages source. Build and deploy succeeded: https://github.com/Sergey70/FlatPlan/actions/runs/34157466763 (application commit e9f5959). Published HTML and all 6 JS/CSS/icon/material assets match the verified local build byte-for-byte. Public Pages metadata API still returns 404 without authentication; do not use that endpoint alone as evidence that the live site is unavailable. The in-app browser handoff encountered a stale local-preview navigation error; HTTPS publication was independently verified.

## Next

Replace demo dimensions, 3D walls/furniture and 2D symbols together from the real measured plan; see README. No editor/import/save support is claimed.
