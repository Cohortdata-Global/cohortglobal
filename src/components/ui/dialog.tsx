"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  title, description, children, className, side = "center",
}: {
  title: string; description?: string; children: React.ReactNode; className?: string; side?: "center" | "right";
}) {
  const t = useTranslations("common");
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/30 backdrop-blur-[2px] data-[state=open]:animate-fade" />
      <DialogPrimitive.Content
        className={cn(
          "fixed z-50 flex flex-col bg-surface shadow-float focus:outline-none",
          side === "center"
            ? "left-1/2 top-1/2 max-h-[min(88vh,760px)] w-[calc(100vw-24px)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border border-line data-[state=open]:animate-pop"
            : "inset-y-0 right-0 w-full max-w-xl border-s border-line data-[state=open]:animate-[rise_.28s_var(--ease-snap)_both]",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <DialogPrimitive.Title className="font-display text-[17px] font-semibold text-ink">{title}</DialogPrimitive.Title>
            {description ? <DialogPrimitive.Description className="mt-1 text-[13px] text-muted">{description}</DialogPrimitive.Description> : null}
          </div>
          <DialogPrimitive.Close className="rounded-sm p-1 text-muted transition-colors hover:bg-sunken hover:text-ink" aria-label={t("close")}>
            <X className="size-4" />
          </DialogPrimitive.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("-mx-5 -mb-4 mt-5 flex justify-end gap-2 border-t border-line bg-paper/60 px-5 py-3", className)}>{children}</div>;
}
