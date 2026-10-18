import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const logoMarkVariants = cva(
  "inline-flex items-center gap-2 font-display font-bold tracking-tight text-ink",
  {
    variants: {
      size: {
        sm: "text-lg",
        lg: "text-3xl",
      },
    },
    defaultVariants: {
      size: "sm",
    },
  }
);

const dotVariants = cva("shrink-0 rounded-full bg-saffron", {
  variants: {
    size: {
      sm: "size-2.5",
      lg: "size-3.5",
    },
  },
  defaultVariants: {
    size: "sm",
  },
});

export type LogoMarkProps = VariantProps<typeof logoMarkVariants> & {
  className?: string;
};

export function LogoMark({ size = "sm", className }: LogoMarkProps) {
  return (
    <span className={cn(logoMarkVariants({ size }), className)}>
      <span aria-hidden="true" className={dotVariants({ size })} />
      <span>Saffron</span>
    </span>
  );
}
