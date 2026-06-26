/**
 * AgentGraph — SVG node graph built from RunEvent[].
 *
 * Layout strategy: vertical swimlane per logical "lane":
 *   - left  (x=60):  memory events
 *   - center (x=160): tool calls, start/done, errors
 *   - right (x=260): file writes, permissions
 *
 * Nodes are spaced vertically by a fixed pitch. Edges connect sequential
 * center-lane nodes and laterally-branching side-lane nodes back to center.
 */

import type { RunEvent, RunEventType } from "../../types/memex";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface GraphNode {
  id:    string;
  seq:   number;
  type:  RunEventType | "start" | "end";
  label: string;
  lane:  "left" | "center" | "right";
  color: string;
  payload: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const PITCH   = 56;   // vertical px per node
const PAD_TOP = 32;
const PAD_BOT = 32;

const LANE_X: Record<"left" | "center" | "right", number> = {
  left:   60,
  center: 160,
  right:  265,
};

const NODE_COLOR: Record<string, string> = {
  start:        "#34d399",
  end:          "#34d399",
  tool_call:    "#00cca8",
  file_write:   "#60a5fa",
  permission:   "#e0b341",
  memory_read:  "#9580ff",
  memory_write: "#9580ff",
  error:        "#f06d6d",
  done:         "#34d399",
};

const NODE_ICON: Record<string, string> = {
  start:        "▶",
  end:          "✓",
  tool_call:    "⚙",
  file_write:   "📄",
  permission:   "🔐",
  memory_read:  "🧠",
  memory_write: "✏",
  error:        "✕",
  done:         "✓",
};

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------
function buildGraph(events: RunEvent[]): GraphNode[] {
  const significant = events.filter((e) => e.type !== "message_chunk" && e.type !== "done");

  const nodes: GraphNode[] = [
    {
      id: "start", seq: -1, type: "start", label: "Start",
      lane: "center", color: NODE_COLOR.start, payload: {},
    },
  ];

  for (const e of significant) {
    const lane: "left" | "center" | "right" =
      e.type === "memory_read" || e.type === "memory_write" ? "left" :
      e.type === "file_write"  || e.type === "permission"   ? "right" :
      "center";

    const label =
      e.type === "tool_call"     ? ((e.payload.name as string | undefined) ?? "tool")        .slice(0, 18) :
      e.type === "file_write"    ? ((e.payload.path as string | undefined) ?? "file")         .split(/[\\/]/).pop()?.slice(0, 18) ?? "file" :
      e.type === "permission"    ? `${e.payload.action ?? ""} ${e.payload.decision ?? ""}`.trim().slice(0, 18) :
      e.type === "memory_read"   ? `"${((e.payload.query as string | undefined) ?? "").slice(0, 14)}"` :
      e.type === "memory_write"  ? "mem write" :
      e.type === "error"         ? ((e.payload.message as string | undefined) ?? "error")    .slice(0, 18) :
      e.type;

    nodes.push({
      id:      `n${e.seq}`,
      seq:     e.seq,
      type:    e.type,
      label,
      lane,
      color:   NODE_COLOR[e.type] ?? "#4c566a",
      payload: e.payload,
    });
  }

  nodes.push({
    id: "end", seq: Infinity, type: "end", label: "Done",
    lane: "center", color: NODE_COLOR.end, payload: {},
  });

  return nodes;
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------
interface PositionedNode extends GraphNode {
  x: number;
  y: number;
  rowIndex: number; // global row (for center lane increment)
}

function layout(nodes: GraphNode[]): { nodes: PositionedNode[]; height: number } {
  const out: PositionedNode[] = [];
  let row = 0;

  for (const n of nodes) {
    const y = PAD_TOP + row * PITCH;
    out.push({ ...n, x: LANE_X[n.lane], y, rowIndex: row });
    if (n.lane === "center") row++;
    else row++;    // side nodes still advance the row so they don't collide
  }

  const height = PAD_TOP + row * PITCH + PAD_BOT;
  return { nodes: out, height };
}

// ---------------------------------------------------------------------------
// Edge helpers
// ---------------------------------------------------------------------------
function cubicPath(x1: number, y1: number, x2: number, y2: number): string {
  const cy = (y1 + y2) / 2;
  return `M ${x1} ${y1} C ${x1} ${cy} ${x2} ${cy} ${x2} ${y2}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
interface Props { events: RunEvent[] }

export function AgentGraph({ events }: Props) {
  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted text-xs">
        No events to graph
      </div>
    );
  }

  const raw = buildGraph(events);
  const { nodes, height } = layout(raw);

  // Build edges: connect each node to the next one in sequence
  const edges: Array<{ from: PositionedNode; to: PositionedNode }> = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    edges.push({ from: nodes[i], to: nodes[i + 1] });
  }

  const WIDTH = 320;

  return (
    <div className="overflow-y-auto overflow-x-hidden">
      <svg
        width={WIDTH}
        height={height}
        viewBox={`0 0 ${WIDTH} ${height}`}
        className="w-full"
        aria-label="Agent run graph"
      >
        {/* Lane guides */}
        {(["left", "center", "right"] as const).map((lane) => (
          <line
            key={lane}
            x1={LANE_X[lane]}
            y1={PAD_TOP}
            x2={LANE_X[lane]}
            y2={height - PAD_BOT}
            stroke="#3b4252"
            strokeWidth="1"
            strokeDasharray="4 4"
            opacity="0.4"
          />
        ))}

        {/* Lane labels */}
        <text x={LANE_X.left}   y={14} textAnchor="middle" fontSize="9" fill="#4c566a">Memory</text>
        <text x={LANE_X.center} y={14} textAnchor="middle" fontSize="9" fill="#4c566a">Agent</text>
        <text x={LANE_X.right}  y={14} textAnchor="middle" fontSize="9" fill="#4c566a">Actions</text>

        {/* Edges */}
        {edges.map((e, i) => (
          <path
            key={i}
            d={cubicPath(e.from.x, e.from.y, e.to.x, e.to.y)}
            fill="none"
            stroke="#4c566a"
            strokeWidth="1.5"
            opacity="0.5"
          />
        ))}

        {/* Nodes */}
        {nodes.map((n) => (
          <g key={n.id} transform={`translate(${n.x}, ${n.y})`}>
            <circle
              r="16"
              fill={n.color + "33"}
              stroke={n.color}
              strokeWidth="1.5"
            />
            <text textAnchor="middle" dominantBaseline="central" fontSize="11">
              {NODE_ICON[n.type] ?? "•"}
            </text>
            <text
              x={n.lane === "left" ? -22 : n.lane === "right" ? 22 : 22}
              textAnchor={n.lane === "left" ? "end" : "start"}
              dominantBaseline="central"
              fontSize="9"
              fill="#d8dee9"
              className="font-mono"
            >
              {n.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
