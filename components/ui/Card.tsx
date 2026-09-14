import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("glass rounded-card shadow-soft", className)}
      {...props}
    />
  );
}

export function SectionTitle({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={cn(
        "font-display text-2xl font-bold uppercase leading-none tracking-wide text-ink",
        className,
      )}
    >
      {children}
    </h2>
  );
}
