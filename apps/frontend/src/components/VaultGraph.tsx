import { useState, useEffect, useRef } from 'react';

const API_BASE = '/api';

interface GraphNodeData {
  id: string;
  title: string;
  tags: string[];
  weight: number;
  factsCount: number;
}

interface GraphEdgeData {
  source: string;
  target: string;
  label: string;
}

interface KnowledgeGraph {
  nodes: GraphNodeData[];
  edges: GraphEdgeData[];
}

interface PositionedNode extends GraphNodeData {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface VaultGraphProps {
  onOpenNote: (id: string) => void;
  isMobile?: boolean;
}

// ── Force Layout ──────────────────────────────────────────────────────

const REPULSION = 8000;
const ATTRACTION = 0.005;
const DAMPING = 0.85;
const MIN_VELOCITY = 0.01;
const CENTER_GRAVITY = 0.01;
const MAX_RADIUS = 40;
const MIN_RADIUS = 14;

function runForceLayout(
  nodes: GraphNodeData[],
  edges: GraphEdgeData[],
  width: number,
  height: number,
  iterations = 100,
): PositionedNode[] {
  const cx = width / 2;
  const cy = height / 2;

  // Initialize positions in a circle
  const positioned: PositionedNode[] = nodes.map((n, i) => {
    const angle = (2 * Math.PI * i) / nodes.length;
    const radius = Math.min(width, height) * 0.3;
    return {
      ...n,
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
      vx: 0,
      vy: 0,
    };
  });

  const nodeMap = new Map<string, PositionedNode>();
  for (const n of positioned) nodeMap.set(n.id, n);

  const edgePairs = edges
    .map(e => [nodeMap.get(e.source), nodeMap.get(e.target)])
    .filter(([a, b]) => a && b) as [PositionedNode, PositionedNode][];

  for (let iter = 0; iter < iterations; iter++) {
    const cooling = 1 - iter / iterations;

    // Repulsion: all pairs repel
    for (let i = 0; i < positioned.length; i++) {
      for (let j = i + 1; j < positioned.length; j++) {
        const a = positioned[i]!;
        const b = positioned[j]!;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 1) { dist = 1; dx = 1; }
        const force = (REPULSION / (dist * dist)) * cooling;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx -= fx;
        a.vy -= fy;
        b.vx += fx;
        b.vy += fy;
      }
    }

    // Attraction: edges pull connected nodes together
    for (const [a, b] of edgePairs) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = ATTRACTION * (dist - 100) * cooling;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }

    // Center gravity
    for (const n of positioned) {
      n.vx += (cx - n.x) * CENTER_GRAVITY * cooling;
      n.vy += (cy - n.y) * CENTER_GRAVITY * cooling;
    }

    // Apply velocities with damping
    for (const n of positioned) {
      n.vx *= DAMPING;
      n.vy *= DAMPING;

      // Stop tiny movements
      if (Math.abs(n.vx) < MIN_VELOCITY) n.vx = 0;
      if (Math.abs(n.vy) < MIN_VELOCITY) n.vy = 0;

      n.x += n.vx;
      n.y += n.vy;

      // Keep in bounds with padding
      const pad = 60;
      n.x = Math.max(pad, Math.min(width - pad, n.x));
      n.y = Math.max(pad, Math.min(height - pad, n.y));
    }
  }

  return positioned;
}

// ── Color helpers ─────────────────────────────────────────────────────

const TAG_COLORS: Record<string, string> = {
  vault: '#14b8a6',
  architecture: '#818cf8',
  pitfall: '#f97316',
  terminal: '#34d399',
  design: '#a78bfa',
  api: '#fbbf24',
  memory: '#f472b6',
  convention: '#94a3b8',
  session: '#818cf8',
};

function getNodeColor(tags: string[]): string {
  for (const tag of tags) {
    if (TAG_COLORS[tag]) return TAG_COLORS[tag];
  }
  return '#14b8a6'; // default teal
}

function getNodeRadius(weight: number, maxWeight: number): number {
  if (maxWeight === 0) return MIN_RADIUS;
  const t = weight / maxWeight;
  return MIN_RADIUS + t * (MAX_RADIUS - MIN_RADIUS);
}

// ── Component ─────────────────────────────────────────────────────────

export function VaultGraph({ onOpenNote, isMobile }: VaultGraphProps) {
  const [graph, setGraph] = useState<KnowledgeGraph | null>(null);
  const [positioned, setPositioned] = useState<PositionedNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [dims, setDims] = useState({ width: 400, height: 400 });

  // Fetch graph data
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`${API_BASE}/vault/graph`)
      .then(r => r.json())
      .then((data: KnowledgeGraph) => {
        if (!cancelled) setGraph(data);
      })
      .catch(e => console.warn('Graph load error:', e))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Measure container on resize
  useEffect(() => {
    const measure = () => {
      if (svgRef.current?.parentElement) {
        const rect = svgRef.current.parentElement.getBoundingClientRect();
        setDims({
          width: Math.max(300, rect.width - 16),
          height: isMobile ? 400 : Math.max(400, rect.height - 100),
        });
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [isMobile]);

  // Run layout when graph data or dimensions change
  useEffect(() => {
    if (graph && dims.width > 0 && dims.height > 0) {
      const result = runForceLayout(graph.nodes, graph.edges, dims.width, dims.height);
      setPositioned(result);
    }
  }, [graph, dims]);

  const maxWeight = positioned.reduce((m, n) => Math.max(m, n.weight), 0);

  if (loading) {
    return <div className="vault-empty">Loading graph…</div>;
  }

  if (!graph || graph.nodes.length === 0) {
    return <div className="vault-empty">No notes to graph yet.</div>;
  }

  // Build edge endpoints map
  const nodePos = new Map<string, PositionedNode>();
  for (const n of positioned) nodePos.set(n.id, n);

  return (
    <div className="vault-graph-container">
      <div className="vault-graph-stats">
        <span>{graph.nodes.length} notes</span>
        <span>·</span>
        <span>{graph.edges.length} links</span>
        {hoveredId && (
          <>
            <span>·</span>
            <span className="vault-graph-hovered">{nodePos.get(hoveredId)?.title}</span>
          </>
        )}
      </div>
      <svg
        ref={svgRef}
        className="vault-graph-svg"
        width={dims.width}
        height={dims.height}
        viewBox={`0 0 ${dims.width} ${dims.height}`}
      >
        <defs>
          <filter id="vaultGraphGlow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Edges */}
        {graph.edges.map((edge, i) => {
          const source = nodePos.get(edge.source);
          const target = nodePos.get(edge.target);
          if (!source || !target) return null;

          return (
            <line
              key={`edge-${i}`}
              className="vault-graph-edge"
              x1={source.x}
              y1={source.y}
              x2={target.x}
              y2={target.y}
              stroke={hoveredId === edge.source || hoveredId === edge.target ? '#14b8a6' : '#313244'}
              strokeWidth={hoveredId === edge.source || hoveredId === edge.target ? 2 : 1}
              strokeOpacity={hoveredId === edge.source || hoveredId === edge.target ? 0.8 : 0.3}
            />
          );
        })}

        {/* Nodes */}
        {positioned.map((node) => {
          const radius = getNodeRadius(node.weight, maxWeight);
          const color = getNodeColor(node.tags);
          const isHovered = hoveredId === node.id;
          const labelVisible = radius > 20 || isHovered;

          return (
            <g
              key={node.id}
              className="vault-graph-node"
              transform={`translate(${node.x}, ${node.y})`}
              onClick={() => onOpenNote(node.id)}
              onMouseEnter={() => setHoveredId(node.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{ cursor: 'pointer' }}
            >
              {/* Glow circle for hovered */}
              {isHovered && (
                <circle
                  r={radius + 6}
                  fill="none"
                  stroke={color}
                  strokeWidth={1.5}
                  strokeOpacity={0.3}
                  filter="url(#vaultGraphGlow)"
                />
              )}

              {/* Main circle */}
              <circle
                r={radius}
                fill={color}
                fillOpacity={isHovered ? 0.9 : 0.6}
                stroke={color}
                strokeWidth={isHovered ? 2.5 : 1.5}
                strokeOpacity={isHovered ? 1 : 0.7}
              />

              {/* Facts count indicator (small dot) */}
              {node.factsCount > 0 && (
                <circle
                  cx={radius * 0.5}
                  cy={-radius * 0.5}
                  r={4}
                  fill="#fbbf24"
                  stroke="#1e1e2e"
                  strokeWidth={1}
                />
              )}

              {/* Label */}
              {labelVisible && (
                <text
                  className="vault-graph-label"
                  textAnchor="middle"
                  dy={radius + 14}
                  fill={isHovered ? '#cdd6f4' : '#7f85a3'}
                  fontSize={isHovered ? 11 : 9}
                  fontWeight={isHovered ? 700 : 500}
                >
                  {node.title.length > 22 ? node.title.slice(0, 20) + '…' : node.title}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}