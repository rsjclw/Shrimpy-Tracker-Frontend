import { forwardRef, type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "surface" | "danger" | "danger-solid" | "dashed" | "outline" | "outline-danger" | "ghost";
type Size = "xs" | "sm" | "md" | "lg";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  /** Stretch to the full width of the container. */
  block?: boolean;
};

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink font-bold hover:brightness-110",
  secondary: "bg-ink-850 text-tx-soft font-semibold hover:text-tx-strong",
  surface: "bg-ink-800 text-tx-soft font-semibold hover:text-tx-strong",
  danger: "text-bad font-semibold hover:bg-bad/10",
  "danger-solid": "bg-bad text-ink-950 font-bold hover:brightness-110",
  dashed: "border border-dashed border-line-dash text-accent font-bold hover:border-accent/60",
  outline: "border border-line bg-ink-800 text-tx font-semibold hover:border-line-strong",
  "outline-danger": "border border-bad text-bad font-semibold hover:bg-bad/10",
  ghost: "text-tx-muted font-semibold hover:text-tx-strong",
};

const SIZES: Record<Size, string> = {
  xs: "h-7 px-2.5 text-[11px] rounded-md",
  sm: "h-[38px] px-3.5 text-[13px] rounded-lg",
  md: "h-11 px-4 text-sm rounded-[10px]",
  lg: "h-[54px] px-5 text-base rounded-[14px]",
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "secondary", size = "sm", block, className = "", type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap transition disabled:cursor-not-allowed disabled:opacity-40 ${VARIANTS[variant]} ${SIZES[size]} ${block ? "w-full" : ""} ${className}`}
      {...rest}
    />
  );
});
