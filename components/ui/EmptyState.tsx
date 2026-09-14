/** État vide : un titre 17/600, une phrase en --text-2, rien d'autre. */
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
    <div className="flex flex-col items-center gap-2 px-5 py-16 text-center">
      <p className="text-[17px] font-semibold tracking-[-0.02em] text-text-1">{title}</p>
      {description && <p className="max-w-xs text-[15px] text-text-2">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
