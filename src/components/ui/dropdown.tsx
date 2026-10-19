"use client";

import * as React from "react";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";

export const Dropdown = Menu.Root;
export const DropdownTrigger = Menu.Trigger;

export function DropdownContent({ children, align = "end", className }: { children: React.ReactNode; align?: "start" | "end"; className?: string }) {
  return (
    <Menu.Portal>
      <Menu.Content
        align={align}
        sideOffset={6}
        className={cn("z-50 min-w-48 rounded-md border border-line bg-surface p-1 shadow-float data-[state=open]:animate-pop", className)}
      >
        {children}
      </Menu.Content>
    </Menu.Portal>
  );
}

export function DropdownItem({ children, onSelect, destructive, disabled }: { children: React.ReactNode; onSelect?: (e: Event) => void; destructive?: boolean; disabled?: boolean }) {
  return (
    <Menu.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn(
        "flex cursor-pointer select-none items-center gap-2 rounded-sm px-2.5 py-2 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4",
        destructive ? "text-rose-700 data-[highlighted]:bg-rose-50" : "text-ink-2 data-[highlighted]:bg-sunken data-[highlighted]:text-ink",
      )}
    >
      {children}
    </Menu.Item>
  );
}

export function DropdownLabel({ children }: { children: React.ReactNode }) {
  return <Menu.Label className="px-2.5 pb-1 pt-2 text-[12px] text-muted">{children}</Menu.Label>;
}

export function DropdownSeparator() {
  return <Menu.Separator className="my-1 h-px bg-line" />;
}
