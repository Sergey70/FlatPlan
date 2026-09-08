"""Extract anonymous numeric geometry from the supplied Plan v3 document.

Usage: python3 scripts/import-plan-source.py /path/to/file.plan
The original file, project id, comments, sessions and catalog ids are never copied.
"""
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
raw = json.loads(Path(sys.argv[1]).read_text())['plan']
assert raw['v'] == 3
walls = list(raw['walls'].values())
rooms = list(raw['rooms2'].values())
items = list(raw['items'].values())
assigned = set()
layouts = []
names = ['План 1 — кухня и спальня', 'План 2 — кухня-гостиная и две комнаты',
         'Санузел — вариант 1', 'Санузел — вариант 2', 'Санузел — вариант 3']
room_names = {1: {2.86:'Лоджия',14.65:'Комната 1',3.58:'Санузел',11.74:'Спальня',27.22:'Кухня-гостиная'},
              2: {3.33:'Гардеробная',14.91:'Комната 1',3.32:'Лоджия',13.55:'Спальня',3.72:'Санузел',21.43:'Кухня-гостиная'}}
def n(value):
    assert isinstance(value,(int,float)) and math.isfinite(value)
    return round(value, 8)

def extract_item(item, index, point):
    return dict(id=f'item-{index+1:03}', type=item['name'], center=point(item['pc']),
                width=n(item['width']), depth=n(item['height']), height=n(item['self_height']),
                angle=n(item['angle']), bottom=n(item.get('over_floor',{}).get('value',0)+item.get('f0offset',0)),
                hasBottom='over_floor' in item,
                mirrorX=n(item.get('scale_x',1)), mirrorZ=n(item.get('scale_y',1)))

for index, drawing in enumerate(raw['drawings']):
    x0=min(p['x'] for p in drawing);z0=min(p['y'] for p in drawing)
    x1=max(p['x'] for p in drawing);z1=max(p['y'] for p in drawing)
    def contains(p): return x0-1 <= p['x'] <= x1+1 and z0-1 <= p['y'] <= z1+1
    def point(p): return [n(p['x']-x0), n(p['y']-z0)]
    layout=dict(id=f'plan-{index+1}' if index<2 else f'bath-{index-1}',name=names[index],
                width=n(x1-x0),depth=n(z1-z0),height=raw['total_height'],walls=[],rooms=[],items=[])
    for wi,w in enumerate(walls):
        if not (contains(w['p1']) and contains(w['p2'])): continue
        holes=[]
        for hi,h in enumerate(w.get('holes',{}).values()):
            holes.append(dict(id=f'opening-{wi+1:03}-{hi+1}',type=h['type'],group=h['group'],
                              width=n(h['width']),height=n(h['height']),bottom=n(h.get('floor_height',0)),
                              center=point(h['pc']),fromPoint=point(h['p1']),toPoint=point(h['p2']),
                              opening=h.get('opening',''),frameDepth=n(h['depth'])))
        layout['walls'].append(dict(id=f'wall-{wi+1:03}',start=point(w['p1']),end=point(w['p2']),
            profile=[point(w[k]) for k in ['l1','l2','r2','r1']],thickness=n(w['depth']),height=n(w['height']),holes=holes))
    for ri,r in enumerate(rooms):
        if not contains(r['pc']): continue
        micro=bool(r.get('is_micro_room'))
        name='Техническая ниша' if micro else room_names.get(index+1,{}).get(r['area'],'Санузел')
        layout['rooms'].append(dict(id=f'room-{ri+1:03}',name=name,micro=micro,area=n(r['area']),
                                    polygon=[point(p) for p in r['polygon']],center=point(r['pc'])))
    for ii,item in enumerate(items):
        if contains(item['pc']):
            assigned.add(ii)
            layout['items'].append(extract_item(item,ii,point))
    layouts.append(layout)

unused=[(i,t) for i,t in enumerate(items) if i not in assigned]
# Retain loose sample objects, without mixing them into apartment bounds or inventories.
x0=min(t['pc']['x']-t['width'] for _,t in unused);z0=min(t['pc']['y']-t['height'] for _,t in unused)
def loose_point(p): return [n(p['x']-x0),n(p['y']-z0)]
layouts.append(dict(id='loose-items',name='Предметы вне контуров',height=raw['total_height'],walls=[],rooms=[],
    width=n(max(t['pc']['x']+t['width'] for _,t in unused)-x0),
    depth=n(max(t['pc']['y']+t['height'] for _,t in unused)-z0),
    items=[extract_item(t,i,loose_point) for i,t in unused]))
result=dict(version=1,units='cm',defaultLayout='plan-2',layouts=layouts)
assert sum(len(l['walls']) for l in layouts)==106
assert sum(len(l['items']) for l in layouts)==122
assert sum(len(w['holes']) for l in layouts for w in l['walls'])==20
target=ROOT/'lib'/'plan-source.json'
target.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(f'Wrote anonymous geometry: {len(layouts)} arrangements, 106 walls, 20 openings, 122 items')
