import type { ReactNode } from "react";

export function KpiCard({
  title,
  value,
  subtitle,
  icon,
  tone = "neutral",
  valueClassName,
  onIconClick,
  children,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: string;
  tone?: "success" | "warning" | "danger" | "info" | "neutral";
  valueClassName?: string;
  onIconClick?: () => void;
  children?: ReactNode;
}) {
  return (
    <div className={`kpi-card ${tone}`}>
      <div className="kpi-head">
        <span>{title}</span>
        {onIconClick ? (
          <button
            className="kpi-icon-button material-symbols-outlined"
            type="button"
            onClick={onIconClick}
            aria-label={`${title} metric toggle`}
          >
            {icon}
          </button>
        ) : (
          <span className="material-symbols-outlined">{icon}</span>
        )}
      </div>
      <div className={`kpi-value mono${valueClassName ? ` ${valueClassName}` : ""}`}>
        {value}
      </div>
      {subtitle && <div className="kpi-sub">{subtitle}</div>}
      {children}
    </div>
  );
}
