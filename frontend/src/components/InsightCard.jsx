export default function InsightCard({
  title,
  value,
  description,
  color,
}) {
  return (
    <div className="workspace-card p-6">

      <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        {title}
      </h2>

      <p
        className={`mt-4 text-4xl font-semibold tracking-normal ${color}`}
      >
        {value}
      </p>

      <p className="mt-4 text-sm leading-6 text-[var(--text-muted)]">
        {description}
      </p>

    </div>
  );
}
