"use client";

import { toast } from "sonner";

/**
 * The small pop-up messages (ID-46). Every action tells the person what happened:
 * a short title, and when useful one line saying what happens next or how to fix it.
 * Errors stay on screen longer than confirmations.
 */
export const notify = {
  success: (title: string, detail?: string) => toast.success(title, { description: detail, duration: 4500 }),
  error: (title: string, detail?: string) => toast.error(title, { description: detail, duration: 8000 }),
  info: (title: string, detail?: string) => toast.info(title, { description: detail, duration: 5000 }),
  loading: (title: string) => toast.loading(title),
  dismiss: (id?: string | number) => toast.dismiss(id),
};
