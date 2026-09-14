import { Ecg } from "@/components/brand/Ecg";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <Ecg className="h-8 w-44 text-red/70" strokeWidth={2} />
      <h3 className="font-display text-xl font-bold uppercase text-navy">{title}</h3>
      {description && <p className="max-w-xs text-sm text-muted">{description}</p>}
      {action}
    </div>
  );
}
