import React from "react";

export interface SettingsRowProps {
  label: string;
  desc?: string | React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export default function SettingsRow({
  label,
  desc,
  className = "",
  children,
}: SettingsRowProps): React.JSX.Element {
  return (
    <div className={`settings-row-item ${className}`.trim()}>
      <div className="settings-row-info">
        <div className="settings-row-label">{label}</div>
        {desc && <div className="settings-row-hint">{desc}</div>}
      </div>
      <div className="settings-row-control">{children}</div>
    </div>
  );
}
