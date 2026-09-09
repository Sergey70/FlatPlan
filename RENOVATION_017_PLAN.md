# RENOVATION-017 acceptance plan

User objective: implement points 1–7 from the preceding proposal, all retained in scope. Partial delivery does not complete the goal.

| ID | Requirement | Evidence required | State |
| --- | --- | --- | --- |
| R17-1 | High-quality renders from current edited scene, soft shadows/reflections/material detail, 3–4 useful room viewpoints and new image export after edits | Actual apartment renders from several interior cameras, geometry unchanged, changed finish/furniture in exported image, loading/cancel/error handling and mobile | Local passed |
| R17-2 | User-controlled opening angle for doors/cabinets/appliances, pull-out drawers, unfolding sofa, usable-space checks in operating positions | Hinge/slide/transform math, nested/scaled models, actual door/appliance/cabinet/sofa scenarios in 2D/3D, collisions and history/JSON | Local passed |
| R17-3 | Electrical sockets/switches/data/appliance points with installation height; individual light fixtures, switching groups and work/cook/evening/night scenes | Placement/edit/delete, light geometry/brightness/temperature, group controls, per-arrangement persistence and rendered scene changes | Local passed |
| R17-4 | Direct sunlight on desks/screens over chosen work hours; compare object orientations and curtains/blinds using Minsk settings | Ray/window/occlusion numeric fixtures, time report, shading scenarios and displayed limitations; no false claim of physical glare simulation | Local passed |
| R17-5 | Dimensioned wall elevations with openings/furniture/electrical/finishes; printable PDF set of plan/furniture/electrics/kitchen/bath elevations | Geometry-derived positions/dimensions, usable printed sheets and saved PDF visual inspection including Cyrillic | Local passed |
| R17-6 | Floor/wall quantities minus openings, skirting, user waste/coverage/prices; per-room totals and two-variant cost comparison | Analytic area/units/opening/polygon tests, edited dimensions update totals, CSV/export and UI | Local passed |
| R17-7 | Two personal arrangements in synchronized 3D/plan comparison, changed partitions/furniture highlighted, passage/quantity comparison | Independent scene selection including unsaved current, synchronized cameras, added/deleted/changed highlights, storage untouched, mobile | Local passed |
| R17-QA | Preserve source, old saves/migrations/gallery, undo/redo/JSON/reset; discoverable desktop/mobile tools | npm run verify; complete browser suite plus all new flows, visual review, final diff | Local passed |
| R17-PUB | Full verified publication and durable handoff | Successful Pages verification/deploy, independent public UI/assets check, README/status/plan updated | Pending |

No new dependencies or services are planned unless a requirement cannot be met responsibly with existing tools. Optional metadata must be parsed through the existing whitelist; old projects remain structurally unchanged when features are absent. No automatic movement or replacement of source furniture. Operating mechanisms may be explicitly added/configured for schematic furniture lacking movable components.

## Evidence log

- Start: clean `main...origin/main`, `fe564ec`. Existing editor, source geometry, current plan/status and relevant tests inspected. No target or ancestor AGENTS.md exists. Careers.AI instructions belong to the unrelated cwd project.

- R17-2 and R17-3: locally implemented and accepted; full 85-test verify and complete retained browser suite passed. Actual mechanism/lighting and mobile screenshots reviewed. Details and limitations in PROJECT_STATUS.md. No publication yet.
- R17-5/6 shared geometry and R17-6 estimate are implemented; seven focused analytic/schema tests pass. Remaining estimate UI/visual checks and all other pending rows retain full scope.
- Rendering references consulted: https://threejs.org/docs/pages/PointLight.html, https://threejs.org/docs/pages/SpotLight.html, https://threejs.org/docs/pages/LightShadow.html (2026-09-08). Use installed APIs and explicit resource disposal.

- R17-6 local acceptance now passes: `npm run verify` 92 tests/lint/type/build; all focused mechanisms/electrical/estimate desktop and mobile scenarios pass after separating Repair into short sub-tabs. Estimate UI covers prices, packing, source preservation, own-variant comparison, 21.43 m² kitchen, CSV and reload. Desktop/mobile screenshots reviewed. The final full-suite/publication gates remain pending.

- R17-4 local acceptance passes: `npm run verify` 99 tests/lint/types/build; final `FLATPLAN_QA_SCOPE=sun-study node tests/browser-renovation-runner.mjs` passes actual winter/summer desk/two-monitor scenarios, shades, turning conflicts, source preservation, stale results, surface edits, Undo/Redo, exact reload, cancellation and mobile 360/390/768. Desktop/table/sample-map/heatmap/mobile screenshots visually reviewed. Final diagram sizing and midnight display are covered. Full source/gallery unit compatibility stays green; complete original browser suite remains a final gate.

## Final local acceptance

- All seven implementations are present. R17-2/3/4/5/6/7 have local acceptance as recorded in PROJECT_STATUS.md. R17-7 passed paired 3D pixel checks, touch/pinch and unchanged storage. Electrical locked-ancestor rename/rotation guards passed the focused suite.
- R17-5 passes 109-test verify at its checkpoint, focused desktop/mobile export/error/cancel/fresh-reopen checks and visual inspection of all 54 actual A4 PDF pages through Poppler. Every page parses correctly with Cyrillic and geometry-derived dimensions; room locators identify wall sides. SVG stays vector, PDF is raster at 220 dpi.
- R17-1 passes its focused four-room/desktop/mobile flow with real 1280×853 PNGs and content/brightness assertions, edited scene, cancellation, bounded results, texture errors and unchanged storage. Numeric tests prove four free cameras in every actual room and the workspace proposal. Visual review prompted a final fix for two narrow-passage kitchen views; those viewpoints and a 2560×1707 export passed the final complete suite and visual review.
- Latest `npm run verify`: 112 tests, lint, TypeScript and production build passed. The final complete `npm run test:browser` terminated with exit 0, including all seven R17 tools and retained source/gallery/editor/mobile regressions. Evidence for the verify run: `.local/qa/renovation-017-final-verify.log`.
- R17-1 rendering references: https://threejs.org/docs/pages/CubeCamera.html and https://threejs.org/docs/pages/PMREMGenerator.html (2026-09-09). LDR CubeCamera capture before PMREM filtering fixed reproduced non-finite HDR data without changing project geometry or weakening image-content checks.
- Final images, all PDF pages, mobile UI, source-preservation diff and `git diff --check` reviewed. All seven implementations and the full local acceptance gate pass. Still required: commit/push, successful Pages deployment and independent public UI/asset verification. No publication yet; no blockers.

- Publication attempt `877e3e5`, Pages run `34290466302`: verify passed, but Linux exposed a race clicking Cancel while the first PNG completed; deployment was correctly skipped. The test now holds a real texture prerequisite and verifies cancellation/no PNG before releasing the request and all normal exports. Focused presentation acceptance passed again (four rooms, 2560, edits, errors, mobile). Production files are unchanged. A successful new Pages run and public acceptance remain required.

- Second Pages attempt `600fc5a` / `34291678329` confirmed cancellation, but the real four-PNG batch exceeded the 180-second wait on software rendering; all four completed results were present in the diagnostic snapshot. CI gets a bounded 600-second completion wait; local behavior and every image assertion are unchanged. Successful final CI/public gates remain pending.

- Third run `34292443912` / `bd53ccb` passed every one of the 16 room PNGs, then failed during the 2560 stage; a failing diagnostic screenshot hid the original error after the standard action deadline. Render start actions now share the bounded render deadline; failure logging preserves the primary error and treats screenshots as optional diagnostics. The 2560 case runs first for earlier feedback. Complete focused presentation acceptance passed again, including every previous scenario and unchanged image assertions. Publication remains pending.
