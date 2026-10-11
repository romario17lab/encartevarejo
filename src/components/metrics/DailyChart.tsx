"use client";
import { useEffect, useId, useRef, useState } from "react";
import { cx } from "@/components/ui";

// Gráfico de barras diário em SVG puro (uma série por vez). Cada barra tem área de toque/foco
// maior que a marca e dica com data e valor; há também a tabela com os mesmos dados.

export interface ChartDay { date: string; value: number }

const fmtDay = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC", ...opts });
const nf = new Intl.NumberFormat("pt-BR");

function niceMax(v: number) {
  if (v <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(v));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * pow * 4 >= v)! * pow;
  return step * 4;
}

export function DailyChart({ data, label, unit }: { data: ChartDay[]; label: string; unit: [string, string] }) {
  const [active, setActive] = useState<number | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(720);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const update = () => setW(Math.max(260, Math.round(el.clientWidth)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const titleId = useId();
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const H = 200, padL = 36, padR = 8, padT = 12, padB = 26;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const slot = plotW / Math.max(1, data.length);
  const barW = Math.max(2, Math.min(28, slot - 2));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));
  const maxLabels = Math.max(2, Math.floor(plotW / 48));
  const labelEvery = Math.max(1, Math.ceil(data.length / maxLabels));
  const word = (n: number) => (n === 1 ? unit[0] : unit[1]);
  const a = active != null ? data[active] : null;

  return (
    <figure className="relative" aria-labelledby={titleId}>
      <figcaption id={titleId} className="sr-only">{label} por dia</figcaption>
      <p className="mb-1 min-h-[20px] text-sm text-ink" aria-live="polite">
        {a ? <><strong>{fmtDay(a.date, { weekday: "short", day: "2-digit", month: "2-digit" })}</strong>: {nf.format(a.value)} {word(a.value)}</> : <span className="text-ink-muted">Toque ou passe o mouse nas barras para ver o dia.</span>}
      </p>
      <div ref={boxRef} className="w-full">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block max-w-full" role="group" aria-label={`${label} por dia`} onMouseLeave={() => setActive(null)}>
        {ticks.map((t, i) => {
          const y = padT + plotH - (t / max) * plotH;
          return (
            <g key={i} aria-hidden="true">
              <line x1={padL} x2={W - padR} y1={y} y2={y} className={i === 0 ? "stroke-line-strong" : "stroke-line"} strokeWidth={1} />
              <text x={padL - 6} y={y + 4} textAnchor="end" className="fill-ink-muted text-[11px]">{nf.format(t)}</text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const h = d.value > 0 ? Math.max(2, (d.value / max) * plotH) : 0;
          const x = padL + i * slot + (slot - barW) / 2;
          const y = padT + plotH - h;
          const r = Math.min(4, barW / 2, h);
          const on = active === i;
          return (
            <g key={d.date}>
              {h > 0 && (
                <path aria-hidden="true" className={cx(on ? "fill-brand-strong" : "fill-brand")}
                  d={`M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y + r} V${y + h} Z`} />
              )}
              <rect x={padL + i * slot} y={padT} width={slot} height={plotH} fill="transparent" tabIndex={0} role="img"
                aria-label={`${fmtDay(d.date, { day: "2-digit", month: "2-digit" })}: ${nf.format(d.value)} ${word(d.value)}`}
                onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)} onBlur={() => setActive(null)} onClick={() => setActive(i)}
                className="cursor-pointer outline-none focus-visible:stroke-ink focus-visible:[stroke-width:2]" />
              {(i % labelEvery === 0 || i === data.length - 1) && (labelEvery === 1 || data.length - 1 - i >= labelEvery || i === data.length - 1) && (
                <text aria-hidden="true" x={padL + i * slot + slot / 2} y={H - 8} textAnchor="middle" className="fill-ink-muted text-[11px]">
                  {fmtDay(d.date, { day: "2-digit", month: "2-digit" })}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      </div>
    </figure>
  );
}
