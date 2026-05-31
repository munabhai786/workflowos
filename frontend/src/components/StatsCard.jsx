import StatCard from "./ui/StatCard";

export default function StatsCard({
  title,
  value,
  color,
  detail,
  icon,
}) {
  const accentColor = color?.includes("rose") || color?.includes("red")
    ? "danger"
    : color?.includes("amber")
    ? "warning"
    : color?.includes("emerald") || color?.includes("green")
    ? "success"
    : color?.includes("blue") || color?.includes("sky")
    ? "info"
    : "purple";

  return (
    <StatCard
      title={title}
      value={value}
      subtitle={detail}
      icon={icon}
      accentColor={accentColor}
    />
  );
}
