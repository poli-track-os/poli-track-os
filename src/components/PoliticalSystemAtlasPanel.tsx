import {
  ExternalLink,
  Maximize2,
  Minimize2,
  Network,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CountryPoliticalProfile,
  PoliticalDiagram,
  PoliticalDiagramNode,
} from '@/lib/political-system-profiles';

interface Props {
  profile: CountryPoliticalProfile;
}

/* ============================================================================
 * Layout model
 *
 * Nodes are assigned to one of five horizontal bands (top → bottom):
 *   oversight → parties → branches → subnational → voters
 *
 * The `branches` band is further split into three columns
 *   (judiciary | legislature | executive) so the classic separation-of-powers
 *   layout is always recognisable.  Every other band spans full width and its
 *   nodes are distributed evenly.
 * ============================================================================
 */

type Band = 'oversight' | 'parties' | 'branches' | 'subnational' | 'voters';
type Column = 'left' | 'center' | 'right' | 'full';

interface Classification {
  band: Band;
  column: Column;
}

interface Placed {
  node: PoliticalDiagramNode;
  cls: Classification;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface PlacedEdge {
  edge: PoliticalDiagram['edges'][number];
  from: Placed;
  to: Placed;
  /** Perpendicular offset used to fan out parallel / bidirectional edges. */
  offset: number;
}

interface Pt {
  x: number;
  y: number;
}

/* ---------- constants ---------- */

const CANVAS_W = 1120;
const CANVAS_H_MIN = 720;
const MARGIN_X = 60;

const NODE_W = 176;
const NODE_H = 60;
const BRANCH_STACK_GAP = NODE_H + 44;
const EDGE_LABEL_MAX_W = 184;

const BAND_ORDER: Band[] = [
  'oversight',
  'parties',
  'branches',
  'subnational',
  'voters',
];

const BAND_Y: Record<Band, number> = {
  oversight: 72,
  parties: 190,
  branches: 360,
  subnational: 540,
  voters: 660,
};

const COLUMN_X: Record<Exclude<Column, 'full'>, number> = {
  left: 210,
  center: 560,
  right: 910,
};

const BAND_LABEL: Record<Band, string> = {
  oversight: 'INDEPENDENT / OVERSIGHT',
  parties: 'POLITICAL PARTIES',
  branches: 'BRANCHES OF GOVERNMENT',
  subnational: 'SUBNATIONAL UNITS',
  voters: 'CITIZENS / ELECTORATE',
};

/* ---------- classification ---------- */

function classify(node: PoliticalDiagramNode): Classification {
  const c = node.category.toLowerCase();
  const l = node.label.toLowerCase();
  const has = (...words: string[]) =>
    words.some((w) => c.includes(w) || l.includes(w));

  if (has('voter', 'citizen', 'electorate')) {
    return { band: 'voters', column: 'full' };
  }
  if (has('subnational', 'state', 'province', 'region', 'canton', 'municipal', 'federal unit')) {
    return { band: 'subnational', column: 'full' };
  }
  if (has('party', 'parties')) {
    return { band: 'parties', column: 'full' };
  }
  if (
    has(
      'independent',
      'central bank',
      'commission',
      'oversight',
      'regulator',
      'audit',
      'ombuds',
    )
  ) {
    return { band: 'oversight', column: 'full' };
  }
  if (has('court', 'judic', 'tribunal')) {
    return { band: 'branches', column: 'left' };
  }
  if (has('legislat', 'parliament', 'congress', 'assembly', 'senate', 'house', 'diet', 'duma')) {
    return { band: 'branches', column: 'center' };
  }
  if (
    has(
      'executive',
      'cabinet',
      'minist',
      'president',
      'prime minister',
      'chancellor',
      'government',
    )
  ) {
    return { band: 'branches', column: 'right' };
  }
  return { band: 'branches', column: 'center' };
}

/* ---------- visual styling per band / column ---------- */

interface Visual {
  fill: string;
  stroke: string;
  text: string;
  tag: string;
}

function visualFor(cls: Classification): Visual {
  if (cls.band === 'voters') {
    return { fill: '#f1f5f9', stroke: '#0f172a', text: '#0f172a', tag: 'CITIZENS' };
  }
  if (cls.band === 'subnational') {
    return { fill: '#ede9fe', stroke: '#6d28d9', text: '#2e1065', tag: 'SUBNATIONAL' };
  }
  if (cls.band === 'parties') {
    return { fill: '#ffe4e6', stroke: '#be123c', text: '#4c0519', tag: 'PARTIES' };
  }
  if (cls.band === 'oversight') {
    return { fill: '#e0e7ff', stroke: '#4338ca', text: '#1e1b4b', tag: 'OVERSIGHT' };
  }
  if (cls.band === 'branches' && cls.column === 'left') {
    return { fill: '#dbeafe', stroke: '#1d4ed8', text: '#0c1e4a', tag: 'JUDICIARY' };
  }
  if (cls.band === 'branches' && cls.column === 'right') {
    return { fill: '#dcfce7', stroke: '#15803d', text: '#052e16', tag: 'EXECUTIVE' };
  }
  return { fill: '#fef3c7', stroke: '#b45309', text: '#3e2206', tag: 'LEGISLATURE' };
}

/* ---------- layout ---------- */

function layoutGraph(diagram: PoliticalDiagram): {
  nodes: Map<string, Placed>;
  edges: PlacedEdge[];
  height: number;
} {
  const classifications = new Map<string, Classification>();
  for (const n of diagram.nodes) classifications.set(n.id, classify(n));

  const byBand = new Map<Band, PoliticalDiagramNode[]>();
  for (const n of diagram.nodes) {
    const b = classifications.get(n.id)!.band;
    const arr = byBand.get(b) ?? [];
    arr.push(n);
    byBand.set(b, arr);
  }

  const nodes = new Map<string, Placed>();

  for (const band of BAND_ORDER) {
    const list = byBand.get(band);
    if (!list || list.length === 0) continue;
    const y = BAND_Y[band];

    if (band === 'branches') {
      const byCol: Record<'left' | 'center' | 'right', PoliticalDiagramNode[]> = {
        left: [],
        center: [],
        right: [],
      };
      for (const n of list) {
        const col = classifications.get(n.id)!.column;
        const key = (col === 'full' ? 'center' : col) as 'left' | 'center' | 'right';
        byCol[key].push(n);
      }
      for (const col of ['left', 'center', 'right'] as const) {
        const arr = byCol[col];
        if (arr.length === 0) continue;
        const cx = COLUMN_X[col];
        const gap = BRANCH_STACK_GAP;
        arr.forEach((n, i) => {
          const dy = (i - (arr.length - 1) / 2) * gap;
          nodes.set(n.id, {
            node: n,
            cls: classifications.get(n.id)!,
            x: cx,
            y: y + dy,
            w: NODE_W,
            h: NODE_H,
          });
        });
      }
    } else {
      const total = list.length;
      const usable = CANVAS_W - 2 * MARGIN_X;
      list.forEach((n, i) => {
        const x =
          total === 1
            ? CANVAS_W / 2
            : MARGIN_X + (usable * (i + 0.5)) / total;
        nodes.set(n.id, {
          node: n,
          cls: classifications.get(n.id)!,
          x,
          y,
          w: NODE_W,
          h: NODE_H,
        });
      });
    }
  }

  /* Fan out parallel / bidirectional edges so they don't stack. */
  const groupCounts = new Map<string, number>();
  const groupSeen = new Map<string, number>();
  for (const e of diagram.edges) {
    const key = [e.from, e.to].sort().join('|');
    groupCounts.set(key, (groupCounts.get(key) ?? 0) + 1);
  }

  const edges: PlacedEdge[] = [];
  for (const e of diagram.edges) {
    const from = nodes.get(e.from);
    const to = nodes.get(e.to);
    if (!from || !to) continue;

    const key = [e.from, e.to].sort().join('|');
    const total = groupCounts.get(key) ?? 1;
    const seen = groupSeen.get(key) ?? 0;
    groupSeen.set(key, seen + 1);

    // Direction sign: A→B curves one way, B→A curves the other.
    const dir = e.from < e.to ? 1 : -1;
    // Spread multiple edges in the same pair direction further apart.
    const spread = total > 1 ? (seen - (total - 1) / 2) * 40 : 0;
    const offset = dir * 32 + spread;

    edges.push({ edge: e, from, to, offset });
  }

  let maxY = CANVAS_H_MIN;
  nodes.forEach((p) => {
    maxY = Math.max(maxY, p.y + p.h / 2 + 40);
  });

  return { nodes, edges, height: maxY };
}

/* ---------- geometry helpers ---------- */

function boxExit(center: Pt, towards: Pt, w: number, h: number): Pt {
  const dx = towards.x - center.x;
  const dy = towards.y - center.y;
  if (dx === 0 && dy === 0) return center;
  const tx = Math.abs(dx) > 0 ? w / 2 / Math.abs(dx) : Infinity;
  const ty = Math.abs(dy) > 0 ? h / 2 / Math.abs(dy) : Infinity;
  const t = Math.min(tx, ty);
  return { x: center.x + dx * t, y: center.y + dy * t };
}

function controlPoint(from: Pt, to: Pt, offset: number): Pt {
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.max(Math.hypot(dx, dy), 1);
  // Perpendicular unit vector
  const px = -dy / len;
  const py = dx / len;
  return { x: mx + px * offset, y: my + py * offset };
}

function pointOnQuad(a: Pt, c: Pt, b: Pt, t: number): Pt {
  const k = 1 - t;
  return {
    x: k * k * a.x + 2 * k * t * c.x + t * t * b.x,
    y: k * k * a.y + 2 * k * t * c.y + t * t * b.y,
  };
}

function tangentOnQuad(a: Pt, c: Pt, b: Pt, t: number): Pt {
  return {
    x: 2 * (1 - t) * (c.x - a.x) + 2 * t * (b.x - c.x),
    y: 2 * (1 - t) * (c.y - a.y) + 2 * t * (b.y - c.y),
  };
}

function wrapTextLines(
  text: string,
  width: number,
  size: number,
  maxLines: number,
  monospace = false,
): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];

  const charW = size * (monospace ? 0.61 : 0.58);
  const maxChars = Math.max(4, Math.floor(width / charW));
  const words = clean.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (!current && word.length > maxChars) {
      lines.push(`${word.slice(0, Math.max(1, maxChars - 1))}…`);
      if (lines.length >= maxLines) break;
      continue;
    }

    const tentative = current ? `${current} ${word}` : word;
    if (tentative.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = tentative;
    }
    if (lines.length >= maxLines) break;
  }

  if (current && lines.length < maxLines) lines.push(current);

  const consumed = lines.join(' ').split(/\s+/).filter(Boolean).length;
  if (lines.length === maxLines && consumed < words.length) {
    const last = lines[lines.length - 1];
    lines[lines.length - 1] =
      last.length >= maxChars
        ? `${last.slice(0, Math.max(1, maxChars - 1))}…`
        : `${last}…`;
  }

  return lines;
}

/* ---------- sub-components ---------- */

function WrappedText({
  x,
  y,
  width,
  text,
  color,
  size = 11,
  weight = 600,
  maxLines = 2,
}: {
  x: number;
  y: number;
  width: number;
  text: string;
  color: string;
  size?: number;
  weight?: number;
  maxLines?: number;
}) {
  const lines = wrapTextLines(text, width, size, maxLines);
  const lineH = size + 2;
  const startY = y - ((lines.length - 1) * lineH) / 2;

  return (
    <g>
      {lines.map((line, i) => (
        <text
          key={i}
          x={x}
          y={startY + i * lineH}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={size}
          fontWeight={weight}
          fontFamily='ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif'
          fill={color}
        >
          {line}
        </text>
      ))}
    </g>
  );
}

function EdgeLabel({
  x,
  y,
  text,
  color,
  size = 10,
  weight = 600,
  maxWidth = EDGE_LABEL_MAX_W,
  maxLines = 2,
}: {
  x: number;
  y: number;
  text: string;
  color: string;
  size?: number;
  weight?: number;
  maxWidth?: number;
  maxLines?: number;
}) {
  const lines = wrapTextLines(text, maxWidth, size, maxLines);
  const lineH = size + 2;
  const textHeight = Math.max(size, lines.length * lineH);
  const textWidth = Math.min(
    maxWidth,
    Math.max(...lines.map((line) => line.length), 1) * size * 0.56,
  );
  const boxW = textWidth + 12;
  const boxH = textHeight + 8;
  const startY = y - ((lines.length - 1) * lineH) / 2;

  return (
    <g pointerEvents="none">
      <rect
        x={x - boxW / 2}
        y={y - boxH / 2}
        width={boxW}
        height={boxH}
        rx={6}
        fill="rgba(255,255,255,0.96)"
        stroke={color}
        strokeOpacity={0.22}
        strokeWidth={1}
      />
      {lines.map((line, index) => (
        <text
          key={`${line}-${index}`}
          x={x}
          y={startY + index * lineH}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={size}
          fontFamily='ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif'
          fontWeight={weight}
          fill={color}
        >
          {line}
        </text>
      ))}
    </g>
  );
}

/* ---------- diagram canvas ---------- */

function DiagramCanvas({
  diagram,
}: {
  diagram: PoliticalDiagram;
}) {
  const [hoverEdge, setHoverEdge] = useState<number | null>(null);
  const [hoverNode, setHoverNode] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, panX: 0, panY: 0 });
  const viewportRef = useRef<HTMLDivElement | null>(null);

  const { nodes, edges, height } = useMemo(
    () => layoutGraph(diagram),
    [diagram],
  );

  const nodeList = Array.from(nodes.values());
  const clampedScale = Math.max(0.5, Math.min(2.8, scale));

  const onWheelZoom = useCallback(
    (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) return;

      const cursorX = event.clientX - rect.left;
      const cursorY = event.clientY - rect.top;
      const factor = event.deltaY < 0 ? 1.1 : 0.9;
      const next = Math.max(0.5, Math.min(2.8, clampedScale * factor));
      const worldX = (cursorX - pan.x) / clampedScale;
      const worldY = (cursorY - pan.y) / clampedScale;

      setScale(next);
      setPan({
        x: cursorX - worldX * next,
        y: cursorY - worldY * next,
      });
    },
    [clampedScale, pan.x, pan.y],
  );

  const onMouseDown = (event: { button: number; clientX: number; clientY: number }) => {
    if (event.button !== 0) return;
    setDragging(true);
    setDragStart({ x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y });
  };

  const onMouseMove = (event: { clientX: number; clientY: number }) => {
    if (!dragging) return;
    const dx = event.clientX - dragStart.x;
    const dy = event.clientY - dragStart.y;
    setPan({ x: dragStart.panX + dx, y: dragStart.panY + dy });
  };

  const onMouseUpOrLeave = () => setDragging(false);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;

    const handler = (event: WheelEvent) => onWheelZoom(event);
    element.addEventListener('wheel', handler, { passive: false });
    return () => element.removeEventListener('wheel', handler as EventListener);
  }, [onWheelZoom]);

  if (diagram.nodes.length === 0) {
    return (
      <div className="brutalist-border p-4 bg-background text-xs text-muted-foreground">
        Diagram not available yet for this country.
      </div>
    );
  }

  const nodeDim = (id: string) => {
    if (hoverEdge !== null) {
      const e = edges[hoverEdge];
      return e.edge.from !== id && e.edge.to !== id;
    }
    if (hoverNode !== null) {
      if (hoverNode === id) return false;
      return !edges.some(
        (e) =>
          (e.edge.from === hoverNode && e.edge.to === id) ||
          (e.edge.to === hoverNode && e.edge.from === id),
      );
    }
    return false;
  };

  const edgeDim = (i: number) => {
    if (hoverEdge !== null) return hoverEdge !== i;
    if (hoverNode !== null) {
      const e = edges[i];
      return e.edge.from !== hoverNode && e.edge.to !== hoverNode;
    }
    return false;
  };

  return (
    <div
      ref={viewportRef}
      className={`brutalist-border bg-background overflow-hidden select-none ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUpOrLeave}
      onMouseLeave={onMouseUpOrLeave}
    >
      <div style={{ width: '100%', height: '100%', minHeight: 460 }}>
        <svg
          viewBox={`0 0 ${CANVAS_W} ${height}`}
          className="w-full h-auto block"
          style={{ maxHeight: '760px' }}
        >
        <g transform={`translate(${pan.x} ${pan.y}) scale(${clampedScale})`}>
        <defs>
          <marker
            id="arrow-dejure"
            markerWidth="8"
            markerHeight="8"
            refX="7"
            refY="3"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L7,3 L0,6 z" fill="#1e40af" />
          </marker>
          <marker
            id="arrow-defacto"
            markerWidth="8"
            markerHeight="8"
            refX="7"
            refY="3"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L7,3 L0,6 z" fill="#9333ea" />
          </marker>
        </defs>

        {/* band labels along left gutter */}
        {BAND_ORDER.map((band) => {
          const has = nodeList.some((n) => n.cls.band === band);
          if (!has) return null;
          const y = BAND_Y[band];
          return (
            <g key={band}>
              <line
                x1={0}
                y1={y - NODE_H / 2 - 18}
                x2={CANVAS_W}
                y2={y - NODE_H / 2 - 18}
                stroke="#f1f5f9"
                strokeWidth={1}
              />
              <text
                x={16}
                y={y - NODE_H / 2 - 22}
                fontSize={9}
                fontFamily='ui-monospace, SFMono-Regular, "Menlo", monospace'
                fontWeight={700}
                letterSpacing="0.14em"
                fill="#94a3b8"
              >
                {BAND_LABEL[band]}
              </text>
            </g>
          );
        })}

        {/* edges (drawn before nodes so arrows arrive at node borders cleanly) */}
        <g>
          {edges.map((pe, i) => {
            const fromC = { x: pe.from.x, y: pe.from.y };
            const toC = { x: pe.to.x, y: pe.to.y };

            const sameBand = pe.from.cls.band === pe.to.cls.band;
            let ctrl: Pt;
            if (sameBand) {
              // Lift same-band edges above their nodes so they don't overlap.
              const dist = Math.abs(toC.x - fromC.x);
              const arc = Math.min(80, 30 + dist * 0.18);
              // Upper bands arc upward, lower bands arc downward.
              const sign =
                pe.from.cls.band === 'voters' ||
                pe.from.cls.band === 'subnational'
                  ? 1
                  : -1;
              const base = controlPoint(fromC, toC, pe.offset * 0.65);
              ctrl = { x: base.x, y: base.y + sign * arc };
            } else {
              ctrl = controlPoint(fromC, toC, pe.offset);
            }

            const start = boxExit(fromC, ctrl, pe.from.w, pe.from.h);
            const end = boxExit(toC, ctrl, pe.to.w, pe.to.h);
            const path = `M ${start.x} ${start.y} Q ${ctrl.x} ${ctrl.y} ${end.x} ${end.y}`;
            const labelT = Math.max(0.32, Math.min(0.68, 0.5 + pe.offset / 220));
            const labelBase = pointOnQuad(start, ctrl, end, labelT);
            const tangent = tangentOnQuad(start, ctrl, end, labelT);
            const tangentLen = Math.max(Math.hypot(tangent.x, tangent.y), 1);
            const nx = -tangent.y / tangentLen;
            const ny = tangent.x / tangentLen;
            const towardCurve =
              Math.sign((ctrl.x - labelBase.x) * nx + (ctrl.y - labelBase.y) * ny) || 1;
            const label = {
              x: labelBase.x + nx * towardCurve * (sameBand ? 22 : 16),
              y: labelBase.y + ny * towardCurve * (sameBand ? 22 : 16),
            };

            const dejure = pe.edge.layer === 'de_jure';
            const color = dejure ? '#1e40af' : '#9333ea';
            const marker = dejure ? 'arrow-dejure' : 'arrow-defacto';
            const dim = edgeDim(i);

            return (
              <g
                key={`e-${i}`}
                style={{
                  opacity: dim ? 0.12 : 1,
                  transition: 'opacity 120ms ease',
                }}
                onMouseEnter={() => setHoverEdge(i)}
                onMouseLeave={() => setHoverEdge(null)}
              >
                {/* wide invisible hit target */}
                <path
                  d={path}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={18}
                  pointerEvents="stroke"
                />
                <path
                  d={path}
                  fill="none"
                  stroke={color}
                  strokeWidth={dejure ? 2 : 1.6}
                  strokeDasharray={dejure ? undefined : '6 4'}
                  strokeLinecap="round"
                  markerEnd={`url(#${marker})`}
                />
                <EdgeLabel
                  x={label.x}
                  y={label.y}
                  text={pe.edge.label}
                  color={color}
                  size={hoverEdge === i ? 11 : 10}
                  weight={hoverEdge === i ? 700 : 600}
                  maxWidth={hoverEdge === i ? 196 : EDGE_LABEL_MAX_W}
                  maxLines={hoverEdge === i ? 3 : 2}
                />
              </g>
            );
          })}
        </g>

        {/* nodes */}
        <g>
          {nodeList.map((p) => {
            const v = visualFor(p.cls);
            const dim = nodeDim(p.node.id);
            const x = p.x - p.w / 2;
            const y = p.y - p.h / 2;
            return (
              <g
                key={p.node.id}
                style={{
                  opacity: dim ? 0.28 : 1,
                  transition: 'opacity 120ms ease',
                  cursor: 'default',
                }}
                onMouseEnter={() => setHoverNode(p.node.id)}
                onMouseLeave={() => setHoverNode(null)}
              >
                {/* brutalist solid shadow */}
                <rect
                  x={x + 4}
                  y={y + 4}
                  width={p.w}
                  height={p.h}
                  rx={2}
                  fill="#0f172a"
                  opacity={0.18}
                />
                <rect
                  x={x}
                  y={y}
                  width={p.w}
                  height={p.h}
                  rx={2}
                  fill={v.fill}
                  stroke={v.stroke}
                  strokeWidth={2}
                />
                <text
                  x={p.x}
                  y={y + 13}
                  textAnchor="middle"
                  fontSize={8}
                  fontFamily='ui-monospace, SFMono-Regular, "Menlo", monospace'
                  fontWeight={700}
                  letterSpacing="0.12em"
                  fill={v.stroke}
                  opacity={0.75}
                >
                  {v.tag}
                </text>
                <WrappedText
                  x={p.x}
                  y={p.y + 8}
                  width={p.w - 14}
                  text={p.node.label}
                  color={v.text}
                  size={hoverNode === p.node.id ? 12.5 : 10.5}
                  weight={hoverNode === p.node.id ? 700 : 600}
                  maxLines={hoverNode === p.node.id ? 4 : 3}
                />
              </g>
            );
          })}
        </g>

        {/* legend */}
        <g transform={`translate(${CANVAS_W - 228}, 14)`}>
          <rect
            x={0}
            y={0}
            width={214}
            height={70}
            fill="#ffffff"
            stroke="#0f172a"
            strokeWidth={1.5}
            rx={2}
          />
          <text
            x={12}
            y={18}
            fontSize={9}
            fontFamily='ui-monospace, SFMono-Regular, "Menlo", monospace'
            fontWeight={700}
            letterSpacing="0.14em"
            fill="#0f172a"
          >
            EDGE TYPES
          </text>
          <line
            x1={14}
            y1={34}
            x2={50}
            y2={34}
            stroke="#1e40af"
            strokeWidth={2}
            markerEnd="url(#arrow-dejure)"
          />
          <text
            x={58}
            y={38}
            fontSize={10}
            fontFamily='ui-monospace, SFMono-Regular, "Menlo", monospace'
            fill="#0f172a"
          >
            de jure (formal)
          </text>
          <line
            x1={14}
            y1={56}
            x2={50}
            y2={56}
            stroke="#9333ea"
            strokeWidth={1.6}
            strokeDasharray="6 4"
            markerEnd="url(#arrow-defacto)"
          />
          <text
            x={58}
            y={60}
            fontSize={10}
            fontFamily='ui-monospace, SFMono-Regular, "Menlo", monospace'
            fill="#0f172a"
          >
            de facto (informal)
          </text>
        </g>
        </g>
      </svg>
      </div>
    </div>
  );
}

/* ---------- helper retained for the edge list ---------- */

function nodeLabel(nodes: PoliticalDiagramNode[], id: string) {
  return nodes.find((n) => n.id === id)?.label || id;
}

/* ---------- panel ---------- */

const PoliticalSystemAtlasPanel = ({ profile }: Props) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isLargeOpen, setIsLargeOpen] = useState(false);
  const activeDiagram = profile.diagrams[activeIndex];

  const prev = () =>
    setActiveIndex((c) => (c === 0 ? profile.diagrams.length - 1 : c - 1));
  const next = () =>
    setActiveIndex((c) => (c === profile.diagrams.length - 1 ? 0 : c + 1));

  return (
    <section className="brutalist-border p-4 bg-card space-y-4">
      <div>
        <h2 className="text-xs font-mono font-bold text-muted-foreground flex items-center gap-2">
          <Network className="w-3 h-3" />
          POLITICAL SYSTEM ATLAS
        </h2>
        <p className="text-sm mt-2">{profile.systemSummary}</p>
      </div>

      <div className="flex items-center justify-between gap-2">
        <button type="button" className="evidence-tag hover:bg-secondary" onClick={prev}>
          PREV
        </button>
        <div className="text-xs font-mono text-muted-foreground">
          {activeIndex + 1} / {profile.diagrams.length}
        </div>
        <button type="button" className="evidence-tag hover:bg-secondary" onClick={next}>
          NEXT
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {profile.diagrams.map((diagram, index) => (
          <button
            key={diagram.id}
            type="button"
            onClick={() => setActiveIndex(index)}
            className={`evidence-tag ${
              index === activeIndex ? 'bg-secondary text-foreground' : ''
            }`}
          >
            {diagram.title}
          </button>
        ))}
      </div>

      {activeDiagram && (
        <article className="brutalist-border p-3 bg-secondary/20">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-bold text-sm">{activeDiagram.title}</h3>
              <p className="text-xs text-muted-foreground mt-1">
                {activeDiagram.purpose}
              </p>
            </div>
            <span className="evidence-tag">LEVEL {activeDiagram.level}</span>
          </div>

          <div className="mt-3">
            <div className="flex items-center justify-end mb-2">
              <button type="button" className="evidence-tag hover:bg-secondary gap-1" onClick={() => setIsLargeOpen(true)}>
                <Maximize2 className="w-3 h-3" />
                LARGE VIEW
              </button>
            </div>
            <DiagramCanvas diagram={activeDiagram} />
          </div>

          <div className="brutalist-border p-2 bg-background mt-3">
            <p className="text-[10px] font-mono text-muted-foreground mb-2">
              POWER EDGES
            </p>
            <ul className="space-y-1">
              {activeDiagram.edges.map((edge) => (
                <li
                  key={`${activeDiagram.id}-${edge.from}-${edge.to}-${edge.label}`}
                  className="text-xs"
                >
                  {nodeLabel(activeDiagram.nodes, edge.from)}{' '}
                  <span className="text-muted-foreground">{'->'}</span>{' '}
                  {edge.label}{' '}
                  <span className="text-muted-foreground">{'->'}</span>{' '}
                  {nodeLabel(activeDiagram.nodes, edge.to)}{' '}
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {edge.layer === 'de_jure' ? 'DE JURE' : 'DE FACTO'}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-wrap gap-2 mt-3">
            {activeDiagram.notes.map((note) => (
              <span key={note} className="evidence-tag">
                {note}
              </span>
            ))}
            <span className="evidence-tag">
              LAST UPDATED · {activeDiagram.lastUpdated}
            </span>
          </div>

          <div className="mt-3">
            <p className="text-[10px] font-mono text-muted-foreground mb-1">
              PROVENANCE
            </p>
            <div className="flex flex-wrap gap-2">
              {activeDiagram.sources.map((source) => (
                <a
                  key={`${activeDiagram.id}-${source.url}`}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-mono text-accent hover:underline"
                >
                  {source.title}
                  <ExternalLink className="w-3 h-3" />
                </a>
              ))}
            </div>
          </div>
        </article>
      )}

      {isLargeOpen && activeDiagram && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-[1400px] h-[88vh] brutalist-border bg-card p-4 flex flex-col">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <h3 className="font-bold text-sm">{activeDiagram.title}</h3>
                <p className="text-xs text-muted-foreground">{activeDiagram.purpose}</p>
              </div>
              <button
                type="button"
                className="evidence-tag hover:bg-secondary gap-1"
                onClick={() => setIsLargeOpen(false)}
              >
                <Minimize2 className="w-3 h-3" />
                CLOSE
              </button>
            </div>

            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <button type="button" className="evidence-tag hover:bg-secondary" onClick={prev}>
                  PREV
                </button>
                <button type="button" className="evidence-tag hover:bg-secondary" onClick={next}>
                  NEXT
                </button>
                <span className="text-xs font-mono text-muted-foreground">
                  {activeIndex + 1} / {profile.diagrams.length}
                </span>
              </div>
            </div>

            <div className="flex gap-2 flex-wrap mb-3">
              {profile.diagrams.map((diagram, index) => (
                <button
                  key={`large-${diagram.id}`}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  className={`evidence-tag ${index === activeIndex ? 'bg-secondary text-foreground' : ''}`}
                >
                  {diagram.title}
                </button>
              ))}
            </div>

            <div className="flex-1 min-h-0">
              <DiagramCanvas diagram={activeDiagram} />
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default PoliticalSystemAtlasPanel;
