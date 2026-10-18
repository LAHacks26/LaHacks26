import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type SectionLabelProps = {
  as?: "h2" | "h3" | "h4";
  children: ReactNode;
  className?: string;
};

export function SectionLabel({ as: Tag = "h2", children, className }: SectionLabelProps) {
  return (
    <Tag
      className={cn(
        "text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase",
        className
      )}
    >
      {children}
    </Tag>
  );
}
