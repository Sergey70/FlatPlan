# DESIGN-016 acceptance plan

All five requested items belong to this iteration. Completion requires evidence for every row; partial implementation is not completion.

| ID | Requirement | Evidence / gate | Status |
| --- | --- | --- | --- |
| D16-1 | Snap to walls/grid/object edges, align centres, exact user offset, drag guides/distances, Alt bypass | Geometry regressions + mouse/touch UI gestures and numeric placements | Local passed |
| D16-2 | Marquee/multiple selection, joint move/rotate/copy, named groups and ungroup preserving world geometry | World-matrix tests (nested/scaled parents), history/JSON/reload + UI | Local passed |
| D16-3 | Eye-level walking, mouse/keyboard, mobile movement/look, named viewpoints | Navigation math + live camera movement/look, saved-view restore/JSON, screenshot | Local passed |
| D16-4 | Sun by time/date/season/location/north, real opening shadows, Minsk defaults and a clearly labelled manual mode | Official solar reference + numeric fixtures + rendered changing shadows + persistence | Local passed |
| D16-5 | Paint/wood/tile/fabric/stone texture, direction/physical tile size/grout, independent wall faces | UV/material numeric tests + rendered texture/face changes + JSON/history | Local passed |
| D16-QA | Preserve canonical source, source upgrades, old saves and gallery provenance | npm run verify, npm run test:browser, focused desktop/mobile visual review | Local passed |
| D16-PUB | Publish reviewed commit, verify deployed version and durable docs | Successful Pages run + public browser/assets checks, clean Git | Pending |

User supplied Minsk and south-facing balcony glazing. Default location: Minsk, 53.90019 N / 27.56653 E, Europe/Minsk (UTC+3); north points right (90° clockwise from plan-up), since balcony glazing faces left. Location coordinates verified against Open-Meteo geocoding on 2026-09-08. User can change all settings and select manual azimuth/elevation.

Local evidence: 71 unit tests + lint/type/build; complete browser suite, then final focused DESIGN-016 desktop/mobile run after hidden-furniture correction. Visual review: five finishes, wall faces, winter/summer shadows, actual apartment, and 360/390/768 panels. Details in PROJECT_STATUS.md; ignored screenshots and asset hashes in `.local/qa/design-016/` and `.local/qa/design-016-final/`. Publication remains pending.
