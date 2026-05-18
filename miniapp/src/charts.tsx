import { useState, type CSSProperties } from "react";
import { theme, fmtIDRShort } from "./theme";

// ---- DONUT CHART (pure SVG) ----
export function DonutChart({
  data, size = 200, stroke = 40, centerLabel, centerValue,
}: {
  data: { name: string; value: number; color: string }[];
  size?: number; stroke?: number;
  centerLabel?: string; centerValue?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return null;
  let offset = 0;
  return (
    <div style={{ display: "flex", justifyContent: "center" }}>
      <svg width={size} height={size}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {data.map((d, i) => {
            const frac = d.value / total;
            const dash = frac * c;
            const el = (
              <circle
                key={i} cx={size / 2} cy={size / 2} r={r}
                fill="none" stroke={d.color} strokeWidth={stroke}
                strokeDasharray={`${dash} ${c - dash}`}
                strokeDashoffset={-offset}
                style={{ transition: "stroke-dasharray 0.4s" }}
              />
            );
            offset += dash;
            return el;
          })}
        </g>
        {centerLabel && (
          <text x={size / 2} y={size / 2 - 6} textAnchor="middle" fontSize={12} fill={theme.color.textMuted}>
            {centerLabel}
          </text>
        )}
        {centerValue && (
          <text x={size / 2} y={size / 2 + 16} textAnchor="middle" fontSize={18} fontWeight={700} fill={theme.color.text}>
            {centerValue}
          </text>
        )}
      </svg>
    </div>
  );
}

// ---- LINE CHART (pure SVG) ----
export function LineChart({
  data, height = 180, color = theme.color.primary,
}: {
  data: { date: string; value: number }[];
  height?: number; color?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (data.length === 0) return null;

  const padding = { top: 20, right: 16, bottom: 28, left: 56 };
  const width = 600; // viewBox base; scales responsively
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const max = Math.max(...data.map((d) => d.value), 1);
  const min = 0;

  const xStep = data.length > 1 ? innerW / (data.length - 1) : 0;
  const points = data.map((d, i) => {
    const x = padding.left + i * xStep;
    const y = padding.top + innerH - ((d.value - min) / (max - min)) * innerH;
    return { x, y, ...d };
  });

  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const fillD = `${pathD} L ${points[points.length - 1].x} ${padding.top + innerH} L ${points[0].x} ${padding.top + innerH} Z`;

  // Y-axis gridlines (3 levels)
  const gridLines = [0, 0.5, 1].map((p) => ({
    y: padding.top + innerH - p * innerH,
    label: fmtIDRShort(min + p * (max - min)),
  }));

  // X-axis labels (max 6, evenly spaced)
  const xLabels = (() => {
    if (data.length <= 6) return points.map((p, i) => ({ x: p.x, label: shortDate(p.date), i }));
    const step = Math.ceil(data.length / 5);
    return points.filter((_, i) => i % step === 0 || i === data.length - 1).map((p) => ({ x: p.x, label: shortDate(p.date), i: 0 }));
  })();

  return (
    <div style={{ width: "100%", overflow: "hidden", position: "relative" }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height }} preserveAspectRatio="none">
        <defs>
          <linearGradient id="lineFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {gridLines.map((g, i) => (
          <g key={i}>
            <line x1={padding.left} y1={g.y} x2={width - padding.right} y2={g.y}
              stroke={theme.color.borderLight} strokeWidth={1} strokeDasharray="3 3" />
            <text x={padding.left - 6} y={g.y + 4} textAnchor="end"
              fontSize={10} fill={theme.color.textMuted}>
              {g.label}
            </text>
          </g>
        ))}
        <path d={fillD} fill="url(#lineFill)" />
        <path d={pathD} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={hover === i ? 5 : 3} fill="#fff" stroke={color} strokeWidth={2}
              style={{ transition: "r 0.15s", cursor: "pointer" }}
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
            <rect x={p.x - 15} y={padding.top} width={30} height={innerH} fill="transparent"
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
          </g>
        ))}
        {xLabels.map((l, i) => (
          <text key={i} x={l.x} y={height - 8} textAnchor="middle"
            fontSize={10} fill={theme.color.textMuted}>
            {l.label}
          </text>
        ))}
        {hover !== null && points[hover] && (
          <g>
            <line x1={points[hover].x} y1={padding.top} x2={points[hover].x} y2={padding.top + innerH}
              stroke={color} strokeWidth={1} strokeDasharray="2 2" opacity={0.5} />
          </g>
        )}
      </svg>
      {hover !== null && points[hover] && (
        <div style={{
          position: "absolute", top: 6,
          left: `${((points[hover].x / width) * 100).toFixed(1)}%`,
          transform: "translateX(-50%)",
          background: theme.color.text, color: "#fff",
          padding: "6px 10px", borderRadius: theme.radius.sm,
          fontSize: 12, whiteSpace: "nowrap", pointerEvents: "none",
        }}>
          {shortDate(points[hover].date)} · {fmtIDRShort(points[hover].value)}
        </div>
      )}
    </div>
  );
}

function shortDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  if (!m || !d) return iso;
  const months = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
  return `${d}/${months[m - 1]}`;
}

// ---- PROGRESS BAR ----
export function ProgressBar({ value, max, color, height = 8 }: { value: number; max: number; color?: string; height?: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const c = color ?? (pct >= 100 ? theme.color.danger : pct >= 80 ? theme.color.warning : theme.color.primary);
  const bgStyle: CSSProperties = {
    width: "100%", height, background: theme.color.borderLight,
    borderRadius: theme.radius.full, overflow: "hidden",
  };
  const fillStyle: CSSProperties = {
    width: `${pct}%`, height: "100%", background: c,
    borderRadius: theme.radius.full, transition: "width 0.5s ease",
  };
  return <div style={bgStyle}><div style={fillStyle} /></div>;
}
