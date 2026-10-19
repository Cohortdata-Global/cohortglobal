import { cn } from "@/lib/utils";

export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}
export function THead({ children }: { children: React.ReactNode }) {
  return <thead className="border-b border-line bg-paper/70 text-left text-[12.5px] text-muted">{children}</thead>;
}
export function TH({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <th scope="col" className={cn("whitespace-nowrap px-4 py-2.5 font-medium first:ps-5 last:pe-5", className)}>{children}</th>;
}
export function TR({ children, className }: { children: React.ReactNode; className?: string }) {
  return <tr className={cn("border-b border-line last:border-0 transition-colors hover:bg-paper/60", className)}>{children}</tr>;
}
export function TD({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={cn("px-4 py-3 align-middle first:ps-5 last:pe-5", className)}>{children}</td>;
}
