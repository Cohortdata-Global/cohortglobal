"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * Draw-or-type signature for consent (first brief: "Signature — Draw / Type").
 * Reports a PNG data URL (drawn) or the typed name; empty string when cleared.
 */
export function SignaturePad({ mode, onChange, disabled }: { mode: "either" | "draw" | "type"; onChange: (v: { kind: "draw" | "type"; value: string }) => void; disabled?: boolean }) {
  const t = useTranslations("collect");
  const [tab, setTab] = useState<"draw" | "type">(mode === "type" ? "type" : "draw");
  const [typed, setTyped] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ratio = window.devicePixelRatio || 1;
    const { width, height } = c.getBoundingClientRect();
    c.width = Math.round(width * ratio);
    c.height = Math.round(height * ratio);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#141821";
  }, [tab]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  function clear() {
    const c = canvas.current;
    c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    setHasInk(false);
    setTyped("");
    onChange({ kind: tab, value: "" });
  }

  return (
    <div className="rounded-lg border border-dashed border-line-strong bg-paper p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[14px] font-semibold text-ink">{t("signature")} <span className="text-rose-600" aria-hidden>*</span></p>
        {mode === "either" ? (
          <div role="tablist" className="flex rounded-md bg-sunken p-0.5 text-[13px]">
            {(["draw", "type"] as const).map((k) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} disabled={disabled}
                onClick={() => { setTab(k); clear(); }}
                className={cn("rounded-[5px] px-3 py-1 font-medium transition-colors", tab === k ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink")}>
                {t(k === "draw" ? "draw" : "type")}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {tab === "draw" ? (
        <canvas ref={canvas} aria-label={t("drawHere")}
          className={cn("h-36 w-full touch-none rounded-md border border-line bg-surface", disabled && "pointer-events-none opacity-60")}
          onPointerDown={(e) => {
            drawing.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            const ctx = e.currentTarget.getContext("2d"); const p = point(e);
            ctx?.beginPath(); ctx?.moveTo(p.x, p.y);
          }}
          onPointerMove={(e) => {
            if (!drawing.current) return;
            const ctx = e.currentTarget.getContext("2d"); const p = point(e);
            ctx?.lineTo(p.x, p.y); ctx?.stroke();
            if (!hasInk) setHasInk(true);
          }}
          onPointerUp={(e) => {
            drawing.current = false;
            if (hasInk) onChange({ kind: "draw", value: e.currentTarget.toDataURL("image/png") });
          }} />
      ) : (
        <input value={typed} disabled={disabled} placeholder={t("typeName")} aria-label={t("typeName")}
          onChange={(e) => { setTyped(e.target.value); onChange({ kind: "type", value: e.target.value.trim() }); }}
          className="h-14 w-full rounded-md border border-line bg-surface px-4 font-[cursive] text-[22px] text-ink focus:border-pine-600 focus:outline-none focus:ring-3 focus:ring-pine-100" />
      )}
      <div className="mt-2 flex items-center justify-between text-[12.5px] text-muted">
        <span>{tab === "draw" ? t("drawHint") : t("typeHint")}</span>
        <button type="button" onClick={clear} disabled={disabled} className="font-medium text-rose-700 hover:underline">{t("clear")}</button>
      </div>
    </div>
  );
}
