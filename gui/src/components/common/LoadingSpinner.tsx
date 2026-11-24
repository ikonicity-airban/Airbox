import React from "react";
import "../css/LoadingSpinner.css";

export interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  mode?: "panel" | "fullscreen" | "inline";
  text?: string;
  subtext?: string;
}

export default function LoadingSpinner({
  size = "md",
  mode = "panel",
  text = "Loading...",
  subtext,
}: LoadingSpinnerProps): React.JSX.Element {
  return (
    <div className={`loader-container ${mode} loader-size-${size}`} role="status" aria-live="polite">
      <div className="loader-spinner-wrapper">
        <div className="loader-spinner" />
      </div>

      {text && (
        <div className="loader-status-text">
          <span className="loader-primary-text">{text}</span>
          {subtext && <span className="loader-subtext">{subtext}</span>}
        </div>
      )}
    </div>
  );
}
