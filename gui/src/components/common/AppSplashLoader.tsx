import React from "react";
import "../css/AppSplashLoader.css";

export interface AppSplashLoaderProps {
  statusText?: string;
}

export default function AppSplashLoader({
  statusText = "Initializing...",
}: AppSplashLoaderProps): React.JSX.Element {
  return (
    <div className="app-splash-container" role="status" aria-live="polite">
      <img
        src="/images/logo.png"
        alt="Airbox"
        className="splash-logo-mark"
      />
      <svg
        viewBox="0 0 500 100"
        className="splash-svg-title"
        aria-label="Airbox"
      >
        <defs>
          <linearGradient
            id="splashShimmerGradient"
            x1="0%"
            y1="0%"
            x2="100%"
            y2="0%"
          >
            <stop
              offset="0%"
              stopColor="var(--accent, #7c3aed)"
              stopOpacity="0.4"
            />
            <stop offset="50%" stopColor="#ffffff" stopOpacity="1" />
            <stop
              offset="100%"
              stopColor="var(--accent, #7c3aed)"
              stopOpacity="0.4"
            />
          </linearGradient>
        </defs>
        <text
          x="50%"
          y="62%"
          textAnchor="middle"
          dominantBaseline="middle"
          className="splash-stroke-text"
        >
          Airbox
        </text>
      </svg>

      <div className="splash-meta-group">
        <div className="splash-progress-track">
          <div className="splash-progress-indicator" />
        </div>
        <span className="splash-status-text">{statusText}</span>
      </div>
    </div>
  );
}
