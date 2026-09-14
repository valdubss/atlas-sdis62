import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/** Surface opaque --bg-1, rayon 16 px, sans bord ni ombre. */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-[16px] bg-bg-1", className)} {...props} />;
}

/** Grand titre d'écran : 34/600, tracking -0.02em. */
export function SectionTitle({
  children,
  className,
  as: Tag = "h1",
}: {
  children: React.ReactNode;
  className?: string;
  as?: "h1" | "h2";
}) {
  return <Tag className={cn("text-[34px] font-semibold tracking-[-0.02em] leading-[1.15] text-text-1", className)}>{children}</Tag>;
}

/** Titre de section : 22/600. */
export function Heading({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h2 className={cn("text-[22px] font-semibold tracking-[-0.02em] leading-[1.15] text-text-1", className)}>{children}</h2>;
}
