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
Target URL: https://sergey70.github.io/FlatPlan/ (not yet verified live).
At publication handoff, Pages was not enabled (public Pages API returned 404). Enable Settings → Pages → Source: GitHub Actions, then run the workflow. The connected GitHub API tools cannot change Pages settings; available in-app browser is signed out.

## Next

Complete Pages enablement/deploy verification. Later replace demo dimensions, 3D walls/furniture and 2D symbols together from the real measured plan; see README. No editor/import/save support is claimed.
