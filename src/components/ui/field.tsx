import * as React from "react";
import { cn } from "@/lib/utils";

const control =
  "w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-faint shadow-[inset_0_1px_0_rgb(20_24_33/0.03)] transition-[border-color,box-shadow] duration-150 focus:border-pine-600 focus:outline-none focus:ring-3 focus:ring-pine-100 disabled:bg-sunken disabled:text-muted aria-[invalid=true]:border-rose-600 aria-[invalid=true]:ring-rose-50";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(control, "h-10", className)} {...props} />,
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, rows = 4, ...props }, ref) => <textarea ref={ref} rows={rows} className={cn(control, "py-2.5 leading-relaxed", className)} {...props} />,
);
Textarea.displayName = "Textarea";

/** Native select: fast, accessible and right on phones. */
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <div className="relative">
      <select ref={ref} className={cn(control, "h-10 appearance-none pe-9", className)} {...props}>
        {children}
      </select>
      <svg aria-hidden viewBox="0 0 16 16" className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted">
        <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  ),
);
Select.displayName = "Select";

export function Field({
  label, htmlFor, hint, error, required, children, className,
}: {
  label: string; htmlFor?: string; hint?: React.ReactNode; error?: string; required?: boolean; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink-2">
        {label}
        {required ? <span className="ms-0.5 text-rose-600" aria-hidden>*</span> : null}
      </label>
      {children}
      {error ? (
        <p className="text-[12.5px] text-rose-700 animate-fade" role="alert">{error}</p>
      ) : hint ? (
        <p className="text-[12.5px] text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function Checkbox({ label, description, className, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; description?: string }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3 rounded-md p-1 text-sm", className)}>
      <input type="checkbox" className="mt-0.5 size-4 shrink-0 cursor-pointer rounded-xs accent-pine-600" {...props} />
      <span>
        <span className="font-medium text-ink">{label}</span>
        {description ? <span className="block text-[13px] text-muted">{description}</span> : null}
      </span>
    </label>
  );
}
