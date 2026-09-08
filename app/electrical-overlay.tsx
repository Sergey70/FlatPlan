import { electricalNodes, electricalPosition } from '@/lib/electrical';
import { electricalKinds } from '@/lib/renovation-types';
import type { SceneNode } from '@/lib/editor-model';
export function ElectricalOverlay({
  nodes,
  zoom,
  selected,
}: {
  nodes: SceneNode[];
  zoom: number;
  selected: string | null;
}) {
  const size = 0.16 / Math.sqrt(zoom);
  return (
    <g aria-label="Обозначения электрики">
      {electricalNodes(nodes, true).map((n, index) => {
        const p = electricalPosition(nodes, n.id),
          e = n.electrical!;
        const info = electricalKinds.find((k) => k.id === e.kind)!;
        return (
          <g key={n.id} data-electrical-point={n.id}>
            <title>
              {n.name} · {e.group} · высота {Math.round(p[1] * 100)} см
            </title>
            <circle
              cx={p[0]}
              cy={p[2]}
              r={size}
              fill={
                selected === n.id
                  ? '#ad4f2c'
                  : e.kind === 'light'
                    ? '#fff0c0'
                    : '#e5f3f4'
              }
              stroke={selected === n.id ? '#ad4f2c' : '#37666c'}
              strokeWidth={0.018}
            />
            <text
              x={p[0]}
              y={p[2] + size * 0.35}
              fontSize={size * 1.1}
              textAnchor="middle"
              fill={selected === n.id ? '#fff' : '#244c52'}
              pointerEvents="none"
            >
              {info.symbol}
            </text>
            <text
              x={p[0] + size * 1.2}
              y={p[2] - size * 0.5}
              fontSize={size * 0.9}
              fill="#244c52"
              stroke="#fff"
              strokeWidth={0.025}
              paintOrder="stroke"
              pointerEvents="none"
            >
              {index + 1}
            </text>
          </g>
        );
      })}
    </g>
  );
}
