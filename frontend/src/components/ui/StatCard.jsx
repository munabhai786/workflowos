const accentStyles = {
  danger: {
    bar: "bg-status-danger",
    tint: "bg-status-danger",
    icon: "bg-status-danger/10 text-status-danger",
  },
  warning: {
    bar: "bg-status-warning",
    tint: "bg-status-warning",
    icon: "bg-status-warning/10 text-status-warning",
  },
  info: {
    bar: "bg-status-info",
    tint: "bg-status-info",
    icon: "bg-status-info/10 text-status-info",
  },
  success: {
    bar: "bg-status-success",
    tint: "bg-status-success",
    icon: "bg-status-success/10 text-status-success",
  },
  purple: {
    bar: "bg-status-purple",
    tint: "bg-status-purple",
    icon: "bg-status-purple/10 text-status-purple",
  },
};

function resolveAccent(accentColor = "purple") {
  if (["blocked", "danger", "overdue"].includes(accentColor)) return accentStyles.danger;
  if (["warning"].includes(accentColor)) return accentStyles.warning;
  if (["active", "info", "brand"].includes(accentColor)) return accentStyles.info;
  if (["success", "done", "completed"].includes(accentColor)) return accentStyles.success;
  return accentStyles.purple;
}

export default function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  accentColor = "purple",
  trend,
}) {
  const accent = resolveAccent(accentColor);
  const numericValue = Number(value);
  const isZero = !Number.isNaN(numericValue) && numericValue === 0;
  const trendPrefix = trend === "positive" ? "↑ " : trend === "negative" ? "↓ " : "";
  const trendColor = trend === "positive" ? "text-status-success" : trend === "negative" ? "text-status-danger" : "text-text-tertiary";

  return (
    <div className="group relative cursor-default overflow-hidden rounded-xl border border-border bg-white p-5 shadow-card transition-all duration-200 hover:shadow-card-hover">
      <div className={`absolute bottom-0 left-0 top-0 w-1 rounded-l-xl ${accent.bar}`} />
      <div className={`absolute inset-0 rounded-xl opacity-[0.03] ${accent.tint}`} />

      {Icon && (
        <div className={`absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-lg ${accent.icon}`}>
          <Icon className="h-4 w-4" />
        </div>
      )}

      <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-text-tertiary">
        {title}
      </p>
      <p className={`mt-1 text-[42px] font-extrabold leading-none tracking-tight ${isZero ? "text-text-tertiary" : "text-text-primary"}`}>
        {value}
      </p>
      {(subtitle || trend) && (
        <p className={`mt-1.5 text-xs font-medium ${trendColor}`}>
          {trendPrefix}
          {subtitle || trend}
        </p>
      )}
    </div>
  );
}
