import { motion } from "framer-motion";

const EmptyState = ({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  size = "md",
}) => {
  const sizes = {
    sm: {
      wrapper: "py-8",
      iconBox: "w-12 h-12",
      icon: "w-5 h-5",
      title: "text-sm",
      desc: "text-xs",
    },
    md: {
      wrapper: "py-12",
      iconBox: "w-16 h-16",
      icon: "w-7 h-7",
      title: "text-base",
      desc: "text-sm",
    },
    lg: {
      wrapper: "py-16",
      iconBox: "w-20 h-20",
      icon: "w-9 h-9",
      title: "text-lg",
      desc: "text-sm",
    },
  };
  const s = sizes[size];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`flex flex-col items-center justify-center ${s.wrapper} px-6 text-center`}
    >
      <div
        className={`${s.iconBox} mb-4 flex items-center justify-center rounded-2xl border border-slate-200 bg-slate-100`}
      >
        {Icon && <Icon className={`${s.icon} text-slate-400`} />}
      </div>

      <p className={`${s.title} mb-1.5 font-semibold text-slate-700`}>
        {title}
      </p>

      {description && (
        <p
          className={`${s.desc} mb-5 max-w-[260px] leading-relaxed text-slate-400`}
        >
          {description}
        </p>
      )}

      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 hover:shadow-md"
        >
          {actionLabel}
        </button>
      )}
    </motion.div>
  );
};

export default EmptyState;
