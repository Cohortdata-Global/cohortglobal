"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, FileSignature, Undo2, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/*
 * "Project pulse": a sample CohortGlobal project shown as dark tiles that respond
 * to the pointer. Sample numbers only (labelled as such on the page).
 * Data is generated from a fixed seed so the server and browser render the same thing.
 */

function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

const COUNTRIES = [
  { code: "IN", value: 4120, color: "#f0606a" },
  { code: "ID", value: 2870, color: "#f1eb7c" },
  { code: "BR", value: 2240, color: "#8a7cf0" },
  { code: "SA", value: 1310, color: "#8db8f5" },
  { code: "AE", value: 1080, color: "#e38df0" },
  { code: "SG", value: 860, color: "#57e083" },
] as const;
const TOTAL = COUNTRIES.reduce((a, c) => a + c.value, 0);

const STAGES = ["applied", "approved", "signed", "countersigned", "active"] as const;

function useInView<T extends Element>() {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setInView(true); io.disconnect(); }
    }, { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { ref, inView };
}

function useCountUp(target: number, run: boolean, ms = 1100) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!run) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setV(target); return; }
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, run, ms]);
  return v;
}

export function PulseBoard() {
  const t = useTranslations("landing.pulse");
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <div ref={ref} className={cn("cg-pulse rounded-[34px] bg-[var(--p-frame)] p-3 sm:p-6", inView && "is-in")}>
      <div className="rounded-[22px] bg-[var(--p-panel)] p-3 text-[var(--p-text)] sm:rounded-[28px] sm:p-5">
        <div className="cg-rise mb-4 flex flex-wrap items-center justify-between gap-3 px-1" style={{ ["--i" as string]: 0 }}>
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-full bg-[#c79f7a] text-[14px] font-semibold text-[#3b2a20]">OC</span>
            <div>
              <p className="text-[16px] font-medium">{t("projectName")}</p>
              <p className="text-[12.5px] text-[var(--p-muted)]">{t("sample")}</p>
            </div>
          </div>
          <span className="rounded-full bg-[var(--p-accent)] px-4 py-2 text-[14px] font-medium text-white">{t("open")}</span>
        </div>

        <div className="grid gap-3 lg:grid-cols-12">
          <ApprovalGauge run={inView} />
          <ApplicationsChart />
          <Contributors run={inView} />
          <ContractCard />
          <SubmissionsHeatmap />
        </div>
      </div>
    </div>
  );
}

/* ---------- Approval gauge: counts up, drag to explore, springs back on leave ---------- */
const G = { start: 200, sweep: 220, r: 92, cx: 110, cy: 112 };
function polar(deg: number, r = G.r) {
  const a = (deg * Math.PI) / 180;
  return [G.cx + r * Math.cos(a), G.cy - r * Math.sin(a)] as const;
}
function arc(fromDeg: number, toDeg: number) {
  const [x1, y1] = polar(fromDeg);
  const [x2, y2] = polar(toDeg);
  const large = Math.abs(fromDeg - toDeg) > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${G.r} ${G.r} 0 ${large} 1 ${x2} ${y2}`;
}

function ApprovalGauge({ run }: { run: boolean }) {
  const t = useTranslations("landing.pulse");
  const base = 68;
  const counted = useCountUp(base, run);
  const [drag, setDrag] = useState<number | null>(null);
  const value = drag ?? counted;
  const tween = useRef(0);

  function fromPointer(e: React.PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 220 - G.cx;
    const y = G.cy - ((e.clientY - r.top) / r.height) * 170;
    let deg = (Math.atan2(y, x) * 180) / Math.PI;
    if (deg < -90) deg += 360;
    const p = (G.start - deg) / G.sweep;
    setDrag(Math.round(Math.max(0, Math.min(1, p)) * 100));
  }
  function release() {
    if (drag === null) return;
    const from = drag;
    const t0 = performance.now();
    cancelAnimationFrame(tween.current);
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / 900);
      const eased = 1 - Math.pow(1 - p, 3);
      setDrag(Math.round(from + (base - from) * eased));
      if (p < 1) tween.current = requestAnimationFrame(step);
      else setDrag(null);
    };
    tween.current = requestAnimationFrame(step);
  }

  const end = G.start - (G.sweep * value) / 100;
  const [kx, ky] = polar(end);
  const verdict = value >= 60 ? t("verdictHigh") : value >= 35 ? t("verdictMid") : t("verdictLow");
  return (
    <section className="cg-tile cg-rise relative overflow-hidden p-5 lg:col-span-4" style={{ ["--i" as string]: 1 }}>
      <div className="flex items-start justify-between">
        <h3 className="text-[16px] font-medium">{t("approved")}</h3>
        <p className="cg-figure text-[54px] leading-none">{value}<span className="text-[22px] text-[var(--p-muted)]">%</span></p>
      </div>
      <svg viewBox="0 0 220 170" className="mt-2 w-full cursor-grab touch-none select-none active:cursor-grabbing"
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); cancelAnimationFrame(tween.current); fromPointer(e); }}
        onPointerMove={(e) => { if (e.buttons) fromPointer(e); }}
        onPointerUp={release} onPointerLeave={release} role="slider" aria-label={t("approvalRate")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
        <defs>
          <pattern id="cg-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="#3a3a3a" strokeWidth="2" /></pattern>
        </defs>
        <path d={arc(G.start, G.start - G.sweep)} stroke="url(#cg-hatch)" strokeWidth="26" fill="none" strokeLinecap="round" />
        <path d={arc(G.start, end)} stroke={value >= 35 ? "#5fdc7c" : "#f5a524"} strokeWidth="26" fill="none" strokeLinecap="round" />
        <circle cx={kx} cy={ky} r="8" fill="#0f0f0f" />
        <text x="110" y="126" textAnchor="middle" fill="#cfcfcf" fontSize="11">{verdict}</text>
      </svg>
      <p className="mt-1 text-[12px] text-[var(--p-muted)]">{t("dragHint")}</p>
    </section>
  );
}

/* ---------- Applications chart: range tabs + crosshair ---------- */
const RANGES = { "7D": 7, "1M": 30, "3M": 90, All: 180 } as const;
type Range = keyof typeof RANGES;

function ApplicationsChart() {
  const t = useTranslations("landing.pulse");
  const locale = useLocale();
  const [range, setRange] = useState<Range>("1M");
  const [hover, setHover] = useState<number | null>(null);
  const gid = useId().replace(/:/g, "");
  const days = RANGES[range];
  const points = useMemo(() => {
    const r = rng(42 + days);
    let v = 6;
    return Array.from({ length: days }, (_, i) => {
      v = Math.max(1, v + (r() - 0.42) * 4 + (i / days) * 1.4);
      return Math.round(v);
    });
  }, [days]);
  const W = 520, H = 200, pad = 8;
  const max = Math.max(...points) * 1.15;
  const x = (i: number) => pad + (i / (points.length - 1)) * (W - pad * 2);
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2);
  const line = points.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1)} ${H} L${x(0)} ${H} Z`;
  const total = points.reduce((a, b) => a + b, 0);
  const dateFor = (i: number) => {
    const d = new Date(Date.UTC(2026, 9, 13));
    d.setUTCDate(d.getUTCDate() - (points.length - 1 - i));
    return d.toLocaleDateString(locale === "en" ? "en-GB" : locale, { day: "numeric", month: "short", timeZone: "UTC" });
  };

  return (
    <section className="cg-tile cg-rise p-5 lg:col-span-5" style={{ ["--i" as string]: 2 }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[16px] font-medium">{t("applications")}</h3>
          <p className="cg-figure mt-1 text-[30px] leading-none">{total.toLocaleString("en-US")}</p>
        </div>
        <div className="flex rounded-full bg-[#262626] p-1 text-[13px]">
          {(Object.keys(RANGES) as Range[]).map((k) => (
            <button key={k} onClick={() => setRange(k)} aria-pressed={range === k}
              className={cn("rounded-full px-3 py-1 transition-colors", range === k ? "bg-white text-[#111]" : "text-[var(--p-muted)] hover:text-white")}>{k === "All" ? t("allRange") : k}</button>
          ))}
        </div>
      </div>
      <div className="relative mt-4">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full touch-none" preserveAspectRatio="none"
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const i = Math.round(((e.clientX - r.left) / r.width) * (points.length - 1));
            setHover(Math.max(0, Math.min(points.length - 1, i)));
          }} onPointerLeave={() => setHover(null)}>
          <defs>
            <linearGradient id={`g-${gid}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffffff" stopOpacity=".16" /><stop offset="1" stopColor="#ffffff" stopOpacity="0" /></linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((t) => <line key={t} x1={0} x2={W} y1={H * t} y2={H * t} stroke="#262626" strokeWidth="1" />)}
          <path d={area} fill={`url(#g-${gid})`} />
          <path d={line} fill="none" stroke="#f2f2f2" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          {hover !== null ? (
            <>
              <line x1={x(hover)} x2={x(hover)} y1={0} y2={H} stroke="#8d8d8d" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
              <circle cx={x(hover)} cy={y(points[hover] ?? 0)} r="5" fill="#f2f2f2" stroke="#1b1b1b" strokeWidth="2" vectorEffect="non-scaling-stroke" />
            </>
          ) : null}
        </svg>
        {hover !== null ? (
          <div className="pointer-events-none absolute -top-2 -translate-x-1/2 -translate-y-full rounded-xl bg-white px-3 py-1.5 text-center text-[#111] shadow-lg"
            style={{ left: `${(x(hover) / W) * 100}%` }}>
            <p className="cg-figure text-[17px] leading-tight">{t("pointApplications", { count: points[hover] ?? 0 })}</p>
            <p className="text-[11px] text-[#666]">{dateFor(hover)}</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/* ---------- Contributors by country: count-up, allocation bar + legend cross-highlight ---------- */
function Contributors({ run }: { run: boolean }) {
  const t = useTranslations("landing.pulse");
  const total = useCountUp(TOTAL, run, 1300);
  const [active, setActive] = useState<string | null>(null);
  return (
    <section className="cg-tile cg-rise flex flex-col p-5 lg:col-span-3 lg:row-span-2" style={{ ["--i" as string]: 3 }}>
      <h3 className="text-[16px] font-medium">{t("contributors")}</h3>
      <p className="cg-figure mt-3 text-[40px] leading-none">{total.toLocaleString("en-US")}</p>
      <p className="mt-1 text-[12.5px] text-[var(--p-good)]">{t("sixCountries")}</p>
      <div className="mt-6 flex h-9 gap-1.5" onPointerLeave={() => setActive(null)}>
        {COUNTRIES.map((c) => (
          <span key={c.code} onPointerEnter={() => setActive(c.code)}
            className="rounded-[8px] transition-[opacity,transform] duration-200"
            style={{ flex: c.value, background: c.color, opacity: active && active !== c.code ? 0.25 : 1, transform: active === c.code ? "scaleY(1.12)" : undefined }} />
        ))}
      </div>
      <ul className="mt-5 flex-1 space-y-1" onPointerLeave={() => setActive(null)}>
        {COUNTRIES.map((c) => (
          <li key={c.code} onPointerEnter={() => setActive(c.code)}
            className={cn("flex items-center justify-between rounded-xl px-2 py-2 transition-[background-color,opacity] duration-200", active === c.code && "bg-[#242424]", active && active !== c.code && "opacity-40")}>
            <span className="flex items-center gap-3">
              <span className="size-2.5 rounded-full" style={{ background: c.color }} />
              <span>
                <span className="block text-[14px]">{t(`countries.${c.code}`)}</span>
                <span className="block text-[12px] text-[var(--p-muted)]">{Math.round((c.value / TOTAL) * 100)}%</span>
              </span>
            </span>
            <span className="cg-figure text-[17px]">{c.value.toLocaleString("en-US")}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------- Contract card: step through the five stages; dismiss with undo ---------- */
function ContractCard() {
  const t = useTranslations("landing.pulse");
  const ts = useTranslations("stages");
  const [stage, setStage] = useState(2);
  const [hidden, setHidden] = useState(false);
  const done = stage === STAGES.length - 1;
  if (hidden) {
    return (
      <section className="cg-tile cg-rise flex items-center justify-center p-5 lg:col-span-4" style={{ ["--i" as string]: 4 }}>
        <button onClick={() => setHidden(false)} className="inline-flex items-center gap-2 rounded-full bg-[#262626] px-4 py-2 text-[14px] text-white transition-colors hover:bg-[#303030]">
          <Undo2 className="size-4" /> {t("undo")}
        </button>
      </section>
    );
  }
  return (
    <section className="cg-rise group relative overflow-hidden rounded-[22px] bg-gradient-to-br from-[#f4521f] via-[#e8411a] to-[#d93812] p-5 lg:col-span-4" style={{ ["--i" as string]: 4 }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 rounded-2xl bg-white/15 px-3 py-2 text-[13px] text-white/90">
          <FileSignature className="size-4" /> {t("stage", { stage: ts(STAGES[stage]!) })}
          <span className="ms-1 flex gap-1">{STAGES.map((s, i) => <span key={s} className={cn("size-1.5 rounded-full transition-colors", i <= stage ? "bg-white" : "bg-white/35")} />)}</span>
        </div>
        <button onClick={() => setHidden(true)} aria-label={t("hide")} className="rounded-full p-1.5 text-white/80 transition-colors hover:bg-white/15 hover:text-white"><X className="size-4" /></button>
      </div>
      <h3 className="mt-5 text-[28px] font-medium leading-tight text-white">{done ? t("workOpen") : t("bothSign")}</h3>
      <p className="mt-2 max-w-[30ch] text-[14px] text-white/85">
        {done ? t("workOpenBody") : t("bothSignBody")}
      </p>
      <button onClick={() => setStage((s) => (s >= STAGES.length - 1 ? 0 : s + 1))}
        className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-[15px] font-medium text-[#111] transition-transform active:scale-[.98]">
        {done ? t("startAgain") : t("next", { stage: ts(STAGES[stage + 1]!) })}
      </button>
      <span aria-hidden className="absolute -bottom-6 -end-4 flex size-28 items-center justify-center rounded-[28px] bg-white/90 text-[#d93812] shadow-xl transition-transform duration-500 ease-[cubic-bezier(.2,.8,.2,1)] group-hover:-translate-y-2 group-hover:-rotate-6">
        {done ? <Check className="size-12" strokeWidth={2.4} /> : <FileSignature className="size-11" />}
      </span>
    </section>
  );
}

/* ---------- Submissions heatmap: diagonal pop-in, hover for count and day ---------- */
function SubmissionsHeatmap() {
  const cols = 19, rows = 7;
  const cells = useMemo(() => {
    const r = rng(7);
    return Array.from({ length: cols * rows }, () => {
      const v = r();
      return v < 0.18 ? 0 : Math.round(v * v * 60);
    });
  }, []);
  const t = useTranslations("landing.pulse");
  const locale = useLocale();
  const [tip, setTip] = useState<{ i: number; v: number } | null>(null);
  const shade = (v: number) => (v === 0 ? "#2b2b25" : v < 8 ? "#46462f" : v < 18 ? "#6b6b44" : v < 34 ? "#989a5b" : "#f5ef8c");
  const dayFor = (i: number) => {
    const d = new Date(Date.UTC(2026, 9, 13));
    d.setUTCDate(d.getUTCDate() - (cols * rows - 1 - i));
    return d.toLocaleDateString(locale === "en" ? "en-GB" : locale, { day: "numeric", month: "short", timeZone: "UTC" });
  };
  return (
    <section className="cg-tile cg-rise p-5 lg:col-span-5" style={{ ["--i" as string]: 5 }}>
      <div className="flex items-baseline justify-between">
        <h3 className="text-[16px] font-medium">{t("submissions")}</h3>
        <p className="h-5 text-[13px] text-[var(--p-muted)]">{tip ? t.rich("onDay", { count: tip.v, day: dayFor(tip.i), w: (c) => <span className="text-white">{c}</span> }) : t("hoverDay")}</p>
      </div>
      <div className="mt-4 grid gap-[5px]" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }} onPointerLeave={() => setTip(null)}>
        {cells.map((v, i) => {
          const c = i % cols, r = Math.floor(i / cols);
          return (
            <span key={i} onPointerEnter={() => setTip({ i, v })}
              className="cg-cell aspect-square rounded-full" style={{ background: shade(v), ["--d" as string]: c + r }} />
          );
        })}
      </div>
      <div className="mt-3 flex justify-between text-[11px] text-[var(--p-muted)]"><span>{t("weeksAgo")}</span><span>{t("today")}</span></div>
    </section>
  );
}
