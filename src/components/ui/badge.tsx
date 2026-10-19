import { cn } from "@/lib/utils";
import { statusTone, type Tone } from "@/lib/status";
import { useLabels } from "@/i18n/labels";

const toneClass: Record<Tone, string> = {
  neutral: "bg-sunken text-ink-2",
  info: "bg-sky-50 text-sky-600",
  positive: "bg-leaf-50 text-leaf-600",
  attention: "bg-amber-50 text-amber-700",
  critical: "bg-rose-50 text-rose-700",
  brand: "bg-pine-50 text-pine-700",
};

const dotClass: Record<Tone, string> = {
  neutral: "bg-faint",
  info: "bg-sky-600",
  positive: "bg-leaf-600",
  attention: "bg-amber-600",
  critical: "bg-rose-600",
  brand: "bg-pine-600",
};

export function Badge({ tone = "neutral", children, className, dot = false }: { tone?: Tone; children: React.ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-sm px-2 text-[12px] font-medium", toneClass[tone], className)}>
      {dot ? <span className={cn("size-1.5 rounded-full", dotClass[tone])} aria-hidden /> : null}
      {children}
    </span>
  );
}

/** A status in words with its colour. `labels` overrides the words for this place (already translated). */
export function StatusBadge({ status, labels, className }: { status: string | null | undefined; labels?: Partial<Record<string, string>>; className?: string }) {
  const words = useLabels();
  const label = (status && labels?.[status]) || words.status(status);
  return <Badge tone={statusTone(status)} dot className={className}>{label}</Badge>;
}
