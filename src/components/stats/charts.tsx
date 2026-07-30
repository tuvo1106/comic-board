"use client";

import Link from "next/link";
import type { YearPoint } from "@/lib/stats";

/**
 * Chart primitives for the stats page — plain divs and one inline SVG, no chart
 * library (see `CHANGELOG.md` for the measured reasoning).
 *
 * Buckets that aren't a real category ("Other", "No publisher", "Unknown",
 * "Unrated") render `muted`: dimmer and never linked, so a bar you can't act on
 * looks different from one you can.
 */

export function Panel({
  title,
  subtitle,
  className = "",
  children,
}: {
  title: string;
  subtitle?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`rounded-[var(--radius-card)] border border-border bg-surface p-4 ${className}`}
    >
      <header className="mb-3">
        <h2 className="text-sm font-semibold text-fg">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </header>
      {children}
    </section>
  );
}

export function StatCard({
  value,
  label,
  hint,
}: {
  value: string;
  label: string;
  hint?: string;
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-surface px-4 py-3">
      <p className="text-2xl font-bold tabular-nums tracking-tight text-fg">{value}</p>
      <p className="mt-0.5 text-xs font-medium text-muted">{label}</p>
      {hint && <p className="mt-1 text-[11px] text-muted/70">{hint}</p>}
    </div>
  );
}

export interface BarRow {
  key: string;
  label: string;
  count: number;
  /** Board URL this row drills through to; omitted when no filter matches it. */
  href?: string;
  muted?: boolean;
}

/** Horizontal bars, one row per bucket, sized against the largest bucket. */
export function BarList({ rows, empty = "Nothing to show yet." }: { rows: BarRow[]; empty?: string }) {
  if (rows.length === 0) return <p className="py-6 text-center text-xs text-muted">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.count), 1);

  return (
    <ul className="space-y-1">
      {rows.map((row) => {
        // Floor a non-empty bar at 2% so a count of 1 next to a count of 400 is
        // still a visible mark rather than nothing at all.
        const pct = row.count === 0 ? 0 : Math.max(2, (row.count / max) * 100);
        const body = (
          <>
            {/*
              Label and bar both flex rather than the label taking a fixed width:
              the same component renders in a half-page publisher card and in a
              quarter-width leaderboard, and a fixed column truncated real names
              ("Absolute Catwom…") in the narrow one. Every row in a given card
              still shares one geometry, so the bars stay comparable. The cap
              stops a wide card from spending 40% of itself on the word "DC".
            */}
            <span
              className={`min-w-0 max-w-40 flex-[2] truncate text-xs ${row.muted ? "text-muted" : "text-fg"}`}
              title={row.label}
            >
              {row.label}
            </span>
            <span className="relative h-5 min-w-0 flex-[3] overflow-hidden rounded bg-surface-2">
              <span
                className={`absolute inset-y-0 left-0 rounded transition-[width] duration-500 ${
                  row.muted ? "bg-muted/40" : "bg-accent/70 group-hover:bg-accent"
                }`}
                style={{ width: `${pct}%` }}
              />
            </span>
            <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted">
              {row.count}
            </span>
          </>
        );

        return (
          <li key={row.key}>
            {row.href ? (
              <Link
                href={row.href}
                className="group flex items-center gap-2.5 rounded px-1 py-0.5 transition hover:bg-surface-2"
              >
                {body}
              </Link>
            ) : (
              <div className="flex items-center gap-2.5 px-1 py-0.5">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export interface HistogramColumn {
  key: string;
  label: string;
  count: number;
  muted?: boolean;
}

/**
 * Vertical columns on a shared baseline — for the rating distribution, where the
 * x-axis is a fixed ordered scale and the empty buckets are part of the shape.
 */
export function Histogram({ columns }: { columns: HistogramColumn[] }) {
  const max = Math.max(...columns.map((c) => c.count), 1);
  return (
    <div className="flex h-40 items-end gap-1">
      {columns.map((col) => (
        <div key={col.key} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-1">
          <span className="text-center text-[10px] tabular-nums text-muted">
            {col.count > 0 ? col.count : ""}
          </span>
          <div
            className={`w-full rounded-t ${col.muted ? "bg-muted/40" : "bg-accent/70"}`}
            // A zero bucket keeps a 2px stub so the axis reads as continuous.
            style={{ height: `${col.count === 0 ? 2 : Math.max(4, (col.count / max) * 100)}%` }}
            title={`${col.label}: ${col.count}`}
          />
          <span className="truncate text-center text-[10px] text-muted">{col.label}</span>
        </div>
      ))}
    </div>
  );
}

const VIEW_W = 600;
const VIEW_H = 160;
const PAD_TOP = 8;

/**
 * Covers per release year across the collection's whole span, as an area + line.
 *
 * A span of 80+ publication years is far too many for labelled bars, but it's
 * exactly what a trend shape is for — the runs and the empty stretches read at a
 * glance. Each year keeps a hover target carrying its own count.
 */
export function YearChart({ points }: { points: YearPoint[] }) {
  if (points.length === 0) {
    return <p className="py-6 text-center text-xs text-muted">No cover dates recorded.</p>;
  }

  const max = Math.max(...points.map((p) => p.count), 1);
  const y = (v: number) => VIEW_H - (v / max) * (VIEW_H - PAD_TOP);

  /*
    A collection from a single year is a FLAT line at that count, not a ramp up
    to it — interpolating across one point drew a diagonal from zero, inventing
    a trend the data never had. So a lone year is drawn level across the width.
  */
  const plot =
    points.length === 1
      ? [
          { x: 0, v: points[0].count },
          { x: VIEW_W, v: points[0].count },
        ]
      : points.map((p, i) => ({ x: (i / (points.length - 1)) * VIEW_W, v: p.count }));

  const line = plot.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${y(p.v)}`).join(" ");
  const area = `${line} L ${VIEW_W} ${VIEW_H} L 0 ${VIEW_H} Z`;

  // First, middle and last only — every year label would collide at this width.
  const ticks = [0, Math.floor((points.length - 1) / 2), points.length - 1].filter(
    (i, idx, arr) => arr.indexOf(i) === idx,
  );

  return (
    <div>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        // The chart is a trend shape, so letting it stretch to the card width is
        // fine — `non-scaling-stroke` keeps the line from smearing with it.
        preserveAspectRatio="none"
        className="h-40 w-full"
        role="img"
        aria-label={`Covers by release year, ${points[0].label} to ${points[points.length - 1].label}`}
      >
        <defs>
          <linearGradient id="year-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#year-fill)" />
        <path
          d={line}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {points.map((p, i) => (
          <circle
            key={p.year}
            // The duplicated single point gets one marker, at the right edge.
            cx={points.length === 1 ? VIEW_W : plot[i].x}
            cy={y(p.count)}
            // Only years that actually hold something get a dot; a marker on
            // every empty year would draw a dotted rule along the baseline.
            r={p.count > 0 ? 2 : 0}
            fill="var(--color-accent)"
          >
            <title>{`${p.label}: ${p.count} ${p.count === 1 ? "cover" : "covers"}`}</title>
          </circle>
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-muted">
        {ticks.map((i) => (
          <span key={points[i].year}>{points[i].label}</span>
        ))}
      </div>
    </div>
  );
}
