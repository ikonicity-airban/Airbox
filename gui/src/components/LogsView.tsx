import React, { useState, useEffect } from "react";
import { Copy, Trash2, RefreshCw } from "lucide-react";
import { swalSuccess, swalError, swalConfirm } from "../utils/swal";
import "./css/LogsView.css";

export default function LogsView(): React.JSX.Element {
  const [logs, setLogs] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);

  const fetchLogs = async (): Promise<void> => {
    setLoading(true);
    try {
      const response = await fetch("/api/logs");
      const data = await response.json();
      setLogs(data.logs || "No log messages available.");
    } catch (err) {
      console.error(err);
      setLogs("Error fetching logs from server.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const handleCopyLogs = (): void => {
    navigator.clipboard.writeText(logs);
    swalSuccess("Copied", "Logs copied to clipboard!");
  };

  const handleClearLogs = async (): Promise<void> => {
    const confirmResult = await swalConfirm(
      "Clear Logs?",
      "Are you sure you want to clear the logs?",
      "Yes, clear",
    );
    if (!confirmResult.isConfirmed) return;

    try {
      const response = await fetch("/api/logs", {
        method: "DELETE",
      });
      if (response.ok) {
        setLogs("No log messages available.");
      } else {
        swalError("Error", "Failed to clear logs.");
      }
    } catch (err) {
      console.error(err);
      swalError("Error", "Error connecting to server to clear logs.");
    }
  };

  return (
    <div className="logs-wrapper">
      <header className="logs-header">
        <h1 className="logs-title">Logs</h1>
        <div className="logs-actions">
          <button
            onClick={fetchLogs}
            className="btn-log-action"
            title="Refresh Logs"
          >
            <RefreshCw size={16} />
          </button>
          <button
            onClick={handleCopyLogs}
            className="btn-log-action"
            title="Copy to Clipboard"
          >
            <Copy size={16} />
          </button>
        </div>
      </header>

      {loading ? (
        <div className="terminal-container glass-panel" style={{ pointerEvents: "none" }}>
          <div className="terminal-header">
            <div className="skeleton-bar" style={{ width: "80px", height: "20px" }} />
            <span className="terminal-title">logs.txt</span>
          </div>
          <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
            <div className="skeleton-bar" style={{ width: "90%", height: "14px" }} />
            <div className="skeleton-bar" style={{ width: "75%", height: "14px" }} />
            <div className="skeleton-bar" style={{ width: "82%", height: "14px" }} />
            <div className="skeleton-bar" style={{ width: "60%", height: "14px" }} />
            <div className="skeleton-bar" style={{ width: "88%", height: "14px" }} />
            <div className="skeleton-bar" style={{ width: "45%", height: "14px" }} />
          </div>
        </div>
      ) : (
        <div className="terminal-container glass-panel">
          <div className="terminal-header">
            <button
              onClick={handleClearLogs}
              className="btn-clear-logs"
              title="Clear Logs"
            >
              <Trash2 size={13} />
              <span>Clear Logs</span>
            </button>
            <span className="terminal-title">logs.txt</span>
          </div>
          <pre className="terminal-pre">{logs}</pre>
        </div>
      )}
    </div>
  );
}
