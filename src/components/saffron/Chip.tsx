import type { ComponentProps, MouseEventHandler, ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const chipVariants = cva(
  "inline-flex max-w-full items-center gap-1.5 rounded-full border font-medium whitespace-nowrap transition-colors",
  {
    variants: {
      variant: {
        default: "border-border bg-card text-ink",
        selected: "border-saffron bg-saffron-soft text-saffron-ink",
        sage: "border-sage bg-sage-soft text-ink",
        danger: "border-tomato bg-tomato-soft text-tomato-ink",
      },
      size: {
        sm: "px-2.5 py-0.5 text-xs",
        md: "px-3 py-1.5 text-sm",
      },
      interactive: {
        true: "cursor-pointer outline-none hover:border-saffron focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border",
        false: "",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
      interactive: false,
    },
  }
);

export type ChipProps = VariantProps<typeof chipVariants> &
  Omit<ComponentProps<"button">, "children" | "className" | "onClick" | "color"> & {
    icon?: ReactNode;
    className?: string;
    children: ReactNode;
    onClick?: MouseEventHandler<HTMLButtonElement>;
  };

// Attributes that are safe to put on a <span> when the chip is not clickable.
function spanSafeProps(rest: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rest)) {
    if (
      key.startsWith("aria-") ||
      key.startsWith("data-") ||
      key === "id" ||
      key === "title" ||
      key === "role" ||
      key === "style"
    ) {
      out[key] = value;
    }
  }
  return out;
}

export function Chip({
  variant,
  size,
  icon,
  className,
  children,
  onClick,
  ...rest
}: ChipProps) {
  const classes = cn(
    chipVariants({ variant, size, interactive: Boolean(onClick) }),
    className
  );

  const content = (
    <>
      {icon ? (
        <span aria-hidden="true" className="inline-flex shrink-0 [&_svg]:size-3.5">
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 truncate">{children}</span>
    </>
  );

  if (onClick) {
    return (
      <button {...rest} type="button" onClick={onClick} className={classes}>
        {content}
      </button>
    );
  }

  return (
    <span {...spanSafeProps(rest)} className={classes}>
      {content}
    </span>
  );
}
