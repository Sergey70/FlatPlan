import type { Point } from '@/lib/apartment';
import { polygonPath } from '@/lib/apartment';
import {
  centimetres,
  type DistanceLine,
  type Footprint,
  type PlanIssue,
} from '@/lib/plan-analysis';
import type { PlanMeasurement } from '@/lib/editor-model';

export function PlanOverlays({
  dimensions,
  measurements,
  draft,
  shapes,
  issues,
  showChecks,
  zoom,
}: {
  dimensions: DistanceLine[];
  measurements: PlanMeasurement[];
  draft: Point | null;
  shapes: Footprint[];
  issues: PlanIssue[];
  showChecks: boolean;
  zoom: number;
}) {
  const size = 0.18 / Math.sqrt(zoom);
  const lines: DistanceLine[] = [
    ...dimensions,
    ...measurements.map((m) => ({
      ...m,
      distance: Math.hypot(m.to[0] - m.from[0], m.to[1] - m.from[1]),
      label: centimetres(Math.hypot(m.to[0] - m.from[0], m.to[1] - m.from[1])),
    })),
  ];
  // Keep nearby dimension captions legible, including several lines on small objects.
  const placed: { x: number; y: number; width: number }[] = [];
  const captions = lines.map((line) => {
    const x = (line.from[0] + line.to[0]) / 2;
    const middle = (line.from[1] + line.to[1]) / 2;
    const width = Math.max(size * 2, line.label.length * size * 0.6);
    let y = middle - size * 0.9;
    for (let step = 0; step < 200; step++) {
      y =
        middle +
        (step % 2 ? 1 : -1) * (0.9 + Math.floor(step / 2) * 1.55) * size;
      if (
        !placed.some(
          (p) =>
            Math.abs(x - p.x) < (width + p.width) / 2 + size * 0.4 &&
            Math.abs(y - p.y) < size * 1.4,
        )
      )
        break;
    }
    const caption = { x, y, width };
    placed.push(caption);
    return caption;
  });
  const bad = new Set(
    issues
      .filter((i) => i.kind === 'collision' || i.kind === 'door')
      .flatMap((i) => i.ids),
  );
  return (
    <g pointerEvents="none" className="ed-plan-overlays">
      {showChecks &&
        shapes
          .filter(
            (s) =>
              bad.has(s.owner) || bad.has(s.nodeId) || s.kind === 'clearance',
          )
          .map((s, i) => (
            <path
              key={`area-${i}`}
              data-analysis-area={s.kind}
              d={polygonPath(s.points)}
              fill={s.kind === 'clearance' ? '#d7902440' : '#c739303a'}
              stroke={s.kind === 'clearance' ? '#bd7a21' : '#ba302b'}
              strokeDasharray={s.kind === 'clearance' ? '.07 .05' : undefined}
              strokeWidth=".022"
            />
          ))}
      {showChecks &&
        issues
          .filter((i) => i.zone)
          .map((i) => (
            <path
              key={i.id}
              d={polygonPath(i.zone!)}
              fill="#d7902428"
              stroke="#bd7a21"
              strokeWidth=".02"
            />
          ))}
      {showChecks &&
        issues
          .filter((i) => i.kind === 'gap')
          .map((i) => (
            <line
              key={i.id}
              x1={i.from![0]}
              y1={i.from![1]}
              x2={i.to![0]}
              y2={i.to![1]}
              stroke="#bd7a21"
              strokeWidth=".035"
            />
          ))}
      {lines.map((line, i) => (
        <g key={i} data-dimension-line="true">
          <line
            x1={line.from[0]}
            y1={line.from[1]}
            x2={line.to[0]}
            y2={line.to[1]}
            stroke="#126e85"
            strokeWidth=".024"
            strokeDasharray={i < dimensions.length ? '.08 .04' : undefined}
          />
          {line.arrow && (
            <path
              d="M -.11 -.07 L 0 0 L -.11 .07"
              transform={`translate(${line.to[0]} ${line.to[1]}) rotate(${(Math.atan2(line.to[1] - line.from[1], line.to[0] - line.from[0]) * 180) / Math.PI})`}
              fill="none"
              stroke="#126e85"
              strokeWidth=".035"
            />
          )}
          {[line.from, line.to].map((p, j) => (
            <circle key={j} cx={p[0]} cy={p[1]} r=".034" fill="#126e85" />
          ))}
          {Math.abs(captions[i].y - (line.from[1] + line.to[1]) / 2) >
            size * 2 && (
            <line
              x1={(line.from[0] + line.to[0]) / 2}
              y1={(line.from[1] + line.to[1]) / 2}
              x2={captions[i].x}
              y2={captions[i].y}
              stroke="#126e85"
              strokeWidth=".012"
            />
          )}
          <text
            x={captions[i].x}
            y={captions[i].y}
            dominantBaseline="central"
            textAnchor="middle"
            fontSize={size}
            fill="#075d75"
            stroke="white"
            strokeWidth=".065"
            paintOrder="stroke"
          >
            {line.label}
          </text>
        </g>
      ))}
      {draft && (
        <circle
          data-measure-start="true"
          cx={draft[0]}
          cy={draft[1]}
          r=".07"
          fill="#126e85"
          stroke="white"
          strokeWidth=".025"
        />
      )}
    </g>
  );
}
