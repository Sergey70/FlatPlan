"""Extract selected anonymous Plan v3 geometry; original identifiers stay local.

python3 scripts/import-plan-source.py CURRENT.plan --identity-source PREVIOUS.plan
The optional identity source bootstraps the local registry with previous ordinals.
Keep .local/plan-source-identities.json for stable IDs on subsequent imports.
"""
import argparse
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def convert(raw, identities):
    assert raw['v'] == 3, 'Expected Plan v3'
    names = {3.33: 'Гардеробная', 14.91: 'Комната 1', 3.32: 'Лоджия',
             13.55: 'Спальня', 3.72: 'Санузел', 21.43: 'Кухня'}
    def n(value):
        assert isinstance(value, (int, float)) and math.isfinite(value)
        return round(value, 8)
    def identity(category, key):
        registry = identities.setdefault(category, {})
        if key not in registry:
            registry[key] = max(registry.values(), default=0) + 1
        return registry[key]
    def bounds(drawing):
        return (min(p['x'] for p in drawing), min(p['y'] for p in drawing),
                max(p['x'] for p in drawing), max(p['y'] for p in drawing))
    layouts, assigned = [], set()
    drawings = sorted(raw['drawings'], key=lambda d: (round(bounds(d)[1]), bounds(d)[0]))
    bath = 0
    for drawing in drawings:
        x0, z0, x1, z1 = bounds(drawing)
        def contains(p):
            return x0-1 <= p['x'] <= x1+1 and z0-1 <= p['y'] <= z1+1
        def point(p): return [n(p['x']-x0), n(p['y']-z0)]
        rooms = [(k, r) for k, r in raw['rooms2'].items() if contains(r['pc'])]
        areas = {round(r['area'], 2) for _, r in rooms}
        main = {21.43, 13.55}.issubset(areas)
        is_bath = not main and (x1-x0)*(z1-z0) < 100000
        assigned.update(k for k, i in raw['items'].items() if contains(i['pc']))
        if not main and not is_bath:
            continue  # Exclude retired left apartment and its furniture together.
        if is_bath:
            bath += 1
        layout = dict(id='plan-2' if main else f'bath-{bath}',
                      name='Квартира — кухня и две комнаты' if main else f'Санузел — вариант {bath}',
                      width=n(x1-x0), depth=n(z1-z0), height=n(raw['total_height']),
                      walls=[], rooms=[], items=[])
        for key, wall in raw['walls'].items():
            if not (contains(wall['p1']) and contains(wall['p2'])):
                continue
            wi = identity('walls', key)
            holes = []
            for hk, hole in wall.get('holes', {}).items():
                hi = identity(f'holes-{key}', hk)
                holes.append(dict(id=f'opening-{wi:03}-{hi}', type=hole['type'], group=hole['group'],
                                  width=n(hole['width']), height=n(hole['height']), bottom=n(hole.get('floor_height', 0)),
                                  center=point(hole['pc']), frameCenter=point(hole.get('pcb', hole['pc'])),
                                  fromPoint=point(hole['p1']), toPoint=point(hole['p2']),
                                  opening=hole.get('opening', ''), frameDepth=n(hole['depth'])))
            layout['walls'].append(dict(id=f'wall-{wi:03}', start=point(wall['p1']), end=point(wall['p2']),
                                        profile=[point(wall[k]) for k in ['l1', 'l2', 'r2', 'r1']],
                                        thickness=n(wall['depth']), height=n(wall['height']), holes=holes))
        for key, room in rooms:
            micro = bool(room.get('is_micro_room'))
            layout['rooms'].append(dict(id=f'room-{identity("rooms2", key):03}',
                                       name='Техническая ниша' if micro else names.get(room['area'], 'Санузел'),
                                       micro=micro, area=n(room['area']), polygon=[point(p) for p in room['polygon']],
                                       center=point(room['pc'])))
        for key, item in raw['items'].items():
            if contains(item['pc']):
                layout['items'].append(dict(id=f'item-{identity("items", key):03}', type=item['name'], center=point(item['pc']),
                                           width=n(item['width']), depth=n(item['height']), height=n(item['self_height']),
                                           angle=n(item['angle']), bottom=n(item.get('over_floor', {}).get('value', 0)+item.get('f0offset', 0)),
                                           hasBottom='over_floor' in item, mirrorX=n(item.get('scale_x', 1)), mirrorZ=n(item.get('scale_y', 1))))
        for kind in ['walls', 'rooms', 'items']:
            layout[kind].sort(key=lambda item: item['id'])
        layouts.append(layout)
    assert sum(l['id'] == 'plan-2' for l in layouts) == 1, 'Right apartment not identified'
    assert len(assigned) == len(raw['items']), 'Unassigned objects: inspect before publishing'
    return dict(version=1, units='cm', defaultLayout='plan-2', layouts=layouts)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('--identity-source', type=Path)
    parser.add_argument('--registry', type=Path, default=ROOT/'.local/plan-source-identities.json')
    parser.add_argument('--output', type=Path, default=ROOT/'lib/plan-source.json')
    args = parser.parse_args()
    registry = json.loads(args.registry.read_text()) if args.registry.exists() else {}
    if not registry and not args.identity_source:
        parser.error('Missing local identity registry: provide --identity-source with the original ordinal baseline before updating published data')
    if args.identity_source and not registry:
        old = json.loads(args.identity_source.read_text())['plan']
        for category in ['walls', 'rooms2', 'items']:
            registry[category] = {key: i+1 for i, key in enumerate(old[category])}
        for key, wall in old['walls'].items():
            registry[f'holes-{key}'] = {hk: i+1 for i, hk in enumerate(wall.get('holes', {}))}
    result = convert(json.loads(args.source.read_text())['plan'], registry)
    args.registry.parent.mkdir(parents=True, exist_ok=True)
    args.registry.write_text(json.dumps(registry))
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
    print('Wrote anonymous geometry:', len(result['layouts']), 'arrangements;',
          sum(len(l['walls']) for l in result['layouts']), 'walls;',
          sum(len(l['items']) for l in result['layouts']), 'items')
