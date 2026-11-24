/* eslint-disable no-unused-vars */
import { useState, useEffect, useRef } from "react";
import {
  Download,
  Search,
  Loader2,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Trash2,
  FolderOpen,
  Music,
  Video,
  Clock,
  User,
  RefreshCw,
  ExternalLink,
  Settings,
  ListVideo,
  ShieldAlert,
  FolderX,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  CheckSquare,
  Square,
  Info,
  AlertTriangle,
  ClipboardPaste,
  X,
  Play,
  Pause,
  MoreVertical
} from "lucide-react";
import { apiPost } from "../utils/common";
import Dropdown from "./common/Dropdown";
import "./css/WebMediaDownloader.css";

export interface WebMediaDownloaderProps {
  onNavigateToSettings?: () => void;
}

export default function WebMediaDownloader({ onNavigateToSettings }: WebMediaDownloaderProps) {
  const [url, setUrl] = useState<string>("");
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analyzedData, setAnalyzedData] = useState<any>(null);
  const [selectedFormat, setSelectedFormat] = useState<any>(null);
  const [isStartingDownload, setIsStartingDownload] = useState<boolean>(false);
  const [jobs, setJobs] = useState<any[]>([]);
  const [isQueuePaused, setIsQueuePaused] = useState<boolean>(false);
  const [parsedError, setParsedError] = useState<any>(null);
  const [showTechnicalError, setShowTechnicalError] = useState<boolean>(false);
  const [hasCopiedLog, setHasCopiedLog] = useState<boolean>(false);
  const [selectedPlaylistIndices, setSelectedPlaylistIndices] = useState<number[]>([]);
  const [playlistSearchFilter, setPlaylistSearchFilter] = useState<string>("");
  const [openActionMenuJobId, setOpenActionMenuJobId] = useState<string | null>(null);
  const [isMobileBottomSheetOpen, setIsMobileBottomSheetOpen] = useState<boolean>(false);
  const pollIntervalRef = useRef<any>(null);
  const prevJobCountRef = useRef<number>(0);
  const hasInitializedJobsRef = useRef<boolean>(false);

  // Auto-open mobile bottom sheet when a new active download job is registered
  useEffect(() => {
    if (!hasInitializedJobsRef.current) {
      hasInitializedJobsRef.current = true;
      prevJobCountRef.current = jobs.length;
      return;
    }
    if (jobs.length > prevJobCountRef.current) {
      const hasNewActive = jobs.some(
        (j) => j.status === "downloading" || j.status === "starting" || j.status === "queued"
      );
      if (hasNewActive) {
        setIsMobileBottomSheetOpen(true);
      }
    }
    prevJobCountRef.current = jobs.length;
  }, [jobs]);

  // Close 3-dots action menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".job-action-menu-container")) {
        setOpenActionMenuJobId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch jobs list
  const fetchJobs = async () => {
    try {
      const res = await fetch("/api/downloads/web/jobs");
      const json = await res.json();
      if (json?.success && Array.isArray(json.jobs)) {
        setJobs(json.jobs);
        if (typeof json.isPaused === "boolean") {
          setIsQueuePaused(json.isPaused);
        }
      }
    } catch (_) {}
  };

  useEffect(() => {
    fetchJobs();
    pollIntervalRef.current = setInterval(fetchJobs, 1500);
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  const handlePaste = async () => {
    try {
      if (navigator?.clipboard?.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          setUrl(text.trim());
          setParsedError(null);
        }
      }
    } catch (err) {
      console.warn("Clipboard access unavailable", err);
    }
  };

  const handleAnalyze = async (e?: React.SyntheticEvent) => {
    if (e) e.preventDefault();
    const cleanUrl = (url || "").trim().replace(/[\\]+$/, "");
    if (!cleanUrl) return;

    setParsedError(null);
    setShowTechnicalError(false);
    setIsAnalyzing(true);
    setAnalyzedData(null);
    setSelectedFormat(null);
    setSelectedPlaylistIndices([]);
    setPlaylistSearchFilter("");

    try {
      const res: any = await apiPost("/api/downloads/web/analyze", { url: cleanUrl });
      if (res?.success && res.data) {
        setAnalyzedData(res.data);
        if (res.data.isPlaylist) {
          const allIndices = (res.data.entries || []).map((item: any) => item.index);
          setSelectedPlaylistIndices(allIndices);
          const defaultOpt =
            res.data.options?.find((o: any) => o.quality === "720p") ||
            res.data.options?.[0];
          setSelectedFormat(defaultOpt);
        } else if (Array.isArray(res.data.options) && res.data.options.length > 0) {
          const firstVid =
            res.data.options.find((o: any) => o.type === "video") ||
            res.data.options[0];
          setSelectedFormat(firstVid);
        }
      } else {
        const pErr = res?.parsedError || {
          title: "Unable to Analyze Link",
          message:
            res?.message ||
            res?.error ||
            "Failed to analyze link. Please check the URL and try again.",
          actionHint:
            "Check that the video or playlist is public and accessible in your web browser.",
          technical: res?.error || res?.message || ""
        };
        setParsedError(pErr);
      }
    } catch (err: any) {
      setParsedError({
        title: "Connection Error",
        message: err?.message || "Network error while connecting to extraction service",
        actionHint: "Ensure the local Iconmedia backend service is running.",
        technical: err?.stack || err?.message || ""
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleStartDownload = async () => {
    if (!analyzedData || !selectedFormat) return;

    setIsStartingDownload(true);
    setParsedError(null);

    try {
      const res: any = await apiPost("/api/downloads/web/start", {
        url: analyzedData.url,
        formatId: selectedFormat.id,
        quality: selectedFormat.quality,
        type: selectedFormat.type,
        title: analyzedData.title
      });

      if (res?.success) {
        fetchJobs();
        setIsMobileBottomSheetOpen(true);
      } else {
        const pErr = res?.parsedError || {
          title: "Download Failed",
          message: res?.message || res?.error || "Failed to start download",
          actionHint: "Check the queue or try another resolution."
        };
        setParsedError(pErr);
      }
    } catch (err: any) {
      setParsedError({
        title: "Download Failed",
        message: err?.message || "Failed to start download",
        actionHint: "Check that your storage directory is writable."
      });
    } finally {
      setIsStartingDownload(false);
    }
  };

  const handleStartBatchDownload = async () => {
    if (!analyzedData?.isPlaylist || selectedPlaylistIndices.length === 0) return;

    setIsStartingDownload(true);
    setParsedError(null);

    const selectedEntries = analyzedData.entries.filter((e: any) =>
      selectedPlaylistIndices.includes(e.index)
    );

    // Ensure items are dispatched in top-to-bottom playlist order
    const items = selectedEntries.map((e: any) => ({
      url: e.url,
      title: e.title,
      formatId: selectedFormat?.id || "best",
      quality: selectedFormat?.quality || "720p",
      type: selectedFormat?.type || "video",
      index: e.index
    }));

    try {
      const res: any = await apiPost("/api/downloads/web/start-batch", {
        items,
        formatId: selectedFormat?.id,
        quality: selectedFormat?.quality,
        type: selectedFormat?.type
      });

      if (res?.success) {
        fetchJobs();
        setIsMobileBottomSheetOpen(true);
      } else {
        const pErr = res?.parsedError || {
          title: "Batch Download Failed",
          message: res?.message || res?.error || "Failed to start batch download",
          actionHint: "Check the queue or try fewer items at a time."
        };
        setParsedError(pErr);
      }
    } catch (err: any) {
      setParsedError({
        title: "Network Error",
        message: err?.message || "Failed to start batch download",
        actionHint: "Ensure the backend service is running."
      });
    } finally {
      setIsStartingDownload(false);
    }
  };

  const handleToggleSelectAll = () => {
    if (!analyzedData?.entries) return;
    if (selectedPlaylistIndices.length === analyzedData.entries.length) {
      setSelectedPlaylistIndices([]);
    } else {
      setSelectedPlaylistIndices(analyzedData.entries.map((item: any) => item.index));
    }
  };

  const handleToggleItem = (index: number) => {
    setSelectedPlaylistIndices((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  };

  const handleCopyLog = (text?: string) => {
    if (!text) return;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setHasCopiedLog(true);
      setTimeout(() => setHasCopiedLog(false), 2000);
    }
  };

  const handleCancelJob = async (jobId: string) => {
    try {
      await apiPost("/api/downloads/web/cancel", { jobId });
      fetchJobs();
    } catch (_) {}
  };

  const handlePauseJob = async (jobId: string) => {
    try {
      await apiPost("/api/downloads/web/job/pause", { jobId });
      fetchJobs();
    } catch (_) {}
  };

  const handleResumeJob = async (jobId: string) => {
    try {
      await apiPost("/api/downloads/web/job/resume", { jobId });
      fetchJobs();
    } catch (_) {}
  };

  const handleOpenJobFolder = async (jobId: string) => {
    try {
      await apiPost("/api/downloads/web/job/open-folder", { jobId });
    } catch (_) {}
  };

  const handleOpenJobFile = async (jobId: string) => {
    try {
      await apiPost("/api/downloads/web/job/open-file", { jobId });
    } catch (_) {}
  };

  const handleDeleteJob = async (jobId: string, deleteFile = false) => {
    try {
      await apiPost("/api/downloads/web/job/delete", { jobId, deleteFile });
      fetchJobs();
    } catch (_) {}
  };

  const handleTogglePause = async () => {
    try {
      const endpoint = isQueuePaused ? "/api/downloads/web/resume" : "/api/downloads/web/pause";
      const res: any = await apiPost(endpoint);
      if (res?.success) {
        setIsQueuePaused(res.isPaused);
        fetchJobs();
      }
    } catch (_) {}
  };

  const handleClearFinished = async () => {
    try {
      await apiPost("/api/downloads/web/clear");
      fetchJobs();
    } catch (_) {}
  };

  // Filtered playlist entries
  const filteredPlaylistEntries = analyzedData?.isPlaylist
    ? analyzedData.entries.filter((item: any) =>
        playlistSearchFilter
          ? item.title.toLowerCase().includes(playlistSearchFilter.toLowerCase()) ||
            item.uploader.toLowerCase().includes(playlistSearchFilter.toLowerCase())
          : true
      )
    : [];

  // Render Queue Card Component (reusable in full mode, sidebar mode, and mobile bottom sheet)
  const renderQueueSection = (isSidebarMode = false, isBottomSheetMode = false) => (
    <div
      className={`downloader-card web-queue-card ${
        isBottomSheetMode
          ? "queue-bottom-sheet-card"
          : isSidebarMode
          ? "queue-sidebar-card"
          : "queue-full-card"
      }`}
    >
      <div className="web-queue-header">
        <div className="web-queue-title-wrapper">
          <h2 className="web-queue-title">
            {isBottomSheetMode
              ? "Downloads"
              : isSidebarMode
              ? "Queue & Downloads"
              : "Download Queue & History"}
          </h2>
          <span className="web-queue-count-badge">{jobs.length}</span>
          {isQueuePaused && <span className="web-queue-paused-badge">Paused</span>}
        </div>
        <div className="web-queue-header-actions">
          {jobs.length > 0 && (
            <button
              type="button"
              className={`btn-pause-queue ${isQueuePaused ? "is-paused" : ""}`}
              onClick={handleTogglePause}
              title={isQueuePaused ? "Resume Turn-by-Turn Downloads" : "Pause Downloads"}
              aria-label={isQueuePaused ? "Resume Turn-by-Turn Downloads" : "Pause Downloads"}
            >
              {isQueuePaused ? <Play size={13} /> : <Pause size={13} />}
              <span>{isQueuePaused ? "Resume" : "Pause"}</span>
            </button>
          )}
          {jobs.length > 0 && (
            <button
              type="button"
              className="btn-clear-history"
              onClick={handleClearFinished}
              title="Clear completed &amp; cancelled downloads"
              aria-label="Clear completed &amp; cancelled downloads"
            >
              <Trash2 size={13} />
              {!isSidebarMode && !isBottomSheetMode && <span>Clear Inactive</span>}
            </button>
          )}
          {isBottomSheetMode && (
            <button
              type="button"
              className="btn-minimize-sheet"
              onClick={() => setIsMobileBottomSheetOpen(false)}
              title="Minimize bottom sheet"
              aria-label="Minimize bottom sheet"
            >
              <ChevronDown size={17} />
            </button>
          )}
        </div>
      </div>

      {jobs.length === 0 ? (
        <div className="queue-empty-state">
          <div className="empty-icon">
            <Download size={32} />
          </div>
          <p className="empty-text">No active or recent downloads.</p>
          <p className="empty-subtext">Paste a video or playlist URL above to start downloading.</p>
        </div>
      ) : (
        <div className="web-queue-list">
          {jobs.map((job) => {
            const isActive = job.status === "downloading" || job.status === "starting";
            const isQueued = job.status === "queued";
            const isPaused = job.status === "paused";
            const isCompleted = job.status === "completed";
            const isError = job.status === "error";
            const isCancelled = job.status === "cancelled";

            return (
              <div key={job.id} className={`web-queue-item-card ${isActive ? "is-active-job" : ""}`}>
                <div className="web-queue-item-top">
                  <div className="web-queue-item-info">
                    <span className="job-title" title={job.title}>{job.title}</span>
                    <div className="job-meta-line">
                      <span className="meta-text-item">{job.type === "audio" ? "Audio" : job.quality || "Video"}</span>
                      <span className="meta-separator">&bull;</span>
                      <span className={`meta-status-text ${isCompleted ? "is-completed" : isError ? "is-error" : ""}`}>
                        {isCompleted && <Check size={12} className="meta-inline-icon" />}
                        {isActive && <Loader2 size={12} className="meta-inline-icon btn-spinner" />}
                        {isPaused && <Pause size={12} className="meta-inline-icon" />}
                        {isQueued && <Clock size={12} className="meta-inline-icon" />}
                        {isQueued ? "Queued" : isPaused ? "Paused" : isCompleted ? "Completed" : job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                      </span>
                    </div>
                  </div>

                  {/* Actions: in sidebar mode, collapse into 3-dots dropdown; in full-width 100% mode, show ghost icon buttons directly */}
                  {isSidebarMode ? (
                    <div className="job-action-menu-container">
                      <button
                        type="button"
                        className="ghost-action-icon menu-trigger-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenActionMenuJobId(prev => prev === job.id ? null : job.id);
                        }}
                        title="Download actions"
                        aria-label="Download actions"
                      >
                        <MoreVertical size={16} />
                      </button>

                      {openActionMenuJobId === job.id && (
                        <div className="job-action-dropdown-menu">
                          {isCompleted && (
                            <>
                              <button
                                type="button"
                                className="action-dropdown-item"
                                onClick={() => {
                                  handleOpenJobFile(job.id);
                                  setOpenActionMenuJobId(null);
                                }}
                              >
                                <Play size={13} />
                                <span>Open File</span>
                              </button>
                              <button
                                type="button"
                                className="action-dropdown-item"
                                onClick={() => {
                                  handleOpenJobFolder(job.id);
                                  setOpenActionMenuJobId(null);
                                }}
                              >
                                <FolderOpen size={13} />
                                <span>Show in Folder</span>
                              </button>
                              <button
                                type="button"
                                className="action-dropdown-item item-danger"
                                onClick={() => {
                                  handleDeleteJob(job.id);
                                  setOpenActionMenuJobId(null);
                                }}
                              >
                                <Trash2 size={13} />
                                <span>Delete</span>
                              </button>
                            </>
                          )}
                          {(isActive || isQueued) && (
                            <>
                              <button
                                type="button"
                                className="action-dropdown-item"
                                onClick={() => {
                                  handlePauseJob(job.id);
                                  setOpenActionMenuJobId(null);
                                }}
                              >
                                <Pause size={13} />
                                <span>Pause Download</span>
                              </button>
                              <button
                                type="button"
                                className="action-dropdown-item item-danger"
                                onClick={() => {
                                  handleCancelJob(job.id);
                                  setOpenActionMenuJobId(null);
                                }}
                              >
                                <X size={13} />
                                <span>Cancel Download</span>
                              </button>
                            </>
                          )}
                          {isPaused && (
                            <>
                              <button
                                type="button"
                                className="action-dropdown-item"
                                onClick={() => {
                                  handleResumeJob(job.id);
                                  setOpenActionMenuJobId(null);
                                }}
                              >
                                <Play size={13} />
                                <span>Resume Download</span>
                              </button>
                              <button
                                type="button"
                                className="action-dropdown-item item-danger"
                                onClick={() => {
                                  handleCancelJob(job.id);
                                  setOpenActionMenuJobId(null);
                                }}
                              >
                                <X size={13} />
                                <span>Cancel Download</span>
                              </button>
                            </>
                          )}
                          {(isError || isCancelled) && (
                            <>
                              <button
                                type="button"
                                className="action-dropdown-item"
                                onClick={() => {
                                  handleResumeJob(job.id);
                                  setOpenActionMenuJobId(null);
                                }}
                              >
                                <RefreshCw size={13} />
                                <span>Retry Download</span>
                              </button>
                              <button
                                type="button"
                                className="action-dropdown-item item-danger"
                                onClick={() => {
                                  handleDeleteJob(job.id);
                                  setOpenActionMenuJobId(null);
                                }}
                              >
                                <Trash2 size={13} />
                                <span>Remove from List</span>
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    /* 100% full-width mode: Clean ghost icon buttons without borders or card badges */
                    <div className="job-ghost-actions-row">
                      {isCompleted && (
                        <>
                          <button
                            type="button"
                            className="ghost-action-icon"
                            onClick={() => handleOpenJobFile(job.id)}
                            title="Open File"
                            aria-label="Open File"
                          >
                            <Play size={15} />
                          </button>
                          <button
                            type="button"
                            className="ghost-action-icon"
                            onClick={() => handleOpenJobFolder(job.id)}
                            title="Show in Folder"
                            aria-label="Show in Folder"
                          >
                            <FolderOpen size={15} />
                          </button>
                          <button
                            type="button"
                            className="ghost-action-icon ghost-danger"
                            onClick={() => handleDeleteJob(job.id)}
                            title="Delete"
                            aria-label="Delete"
                          >
                            <Trash2 size={15} />
                          </button>
                        </>
                      )}
                      {(isActive || isQueued) && (
                        <>
                          <button
                            type="button"
                            className="ghost-action-icon"
                            onClick={() => handlePauseJob(job.id)}
                            title="Pause"
                            aria-label="Pause"
                          >
                            <Pause size={15} />
                          </button>
                          <button
                            type="button"
                            className="ghost-action-icon ghost-danger"
                            onClick={() => handleCancelJob(job.id)}
                            title="Cancel Download"
                            aria-label="Cancel Download"
                          >
                            <X size={15} />
                          </button>
                        </>
                      )}
                      {isPaused && (
                        <>
                          <button
                            type="button"
                            className="ghost-action-icon"
                            onClick={() => handleResumeJob(job.id)}
                            title="Resume"
                            aria-label="Resume"
                          >
                            <Play size={15} />
                          </button>
                          <button
                            type="button"
                            className="ghost-action-icon ghost-danger"
                            onClick={() => handleCancelJob(job.id)}
                            title="Cancel Download"
                            aria-label="Cancel Download"
                          >
                            <X size={15} />
                          </button>
                        </>
                      )}
                      {(isError || isCancelled) && (
                        <>
                          <button
                            type="button"
                            className="ghost-action-icon"
                            onClick={() => handleResumeJob(job.id)}
                            title="Retry"
                            aria-label="Retry"
                          >
                            <RefreshCw size={15} />
                          </button>
                          <button
                            type="button"
                            className="ghost-action-icon ghost-danger"
                            onClick={() => handleDeleteJob(job.id)}
                            title="Delete"
                            aria-label="Delete"
                          >
                            <Trash2 size={15} />
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Progress Bar */}
                <div className="progress-container">
                  <div
                    className={`progress-bar-fill ${
                      isCompleted
                        ? "completed"
                        : isError
                        ? "error"
                        : isCancelled
                        ? "cancelled"
                        : isPaused
                        ? "paused"
                        : ""
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, job.progress || 0))}%` }}
                  />
                </div>

                {/* Job Status Details */}
                <div className="web-queue-item-footer">
                  <span className="progress-percentage">
                    {isCompleted ? "100%" : isQueued ? "Queued" : `${(job.progress || 0).toFixed(1)}%`}
                  </span>
                  <div className="speed-eta-group">
                    {isActive && job.speed && <span>{job.speed}</span>}
                    {isActive && job.eta && <span>ETA: {job.eta}</span>}
                    {isError && <span className="job-error-text">{job.error || "Failed"}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const activeJob =
    jobs.find((j) => j.status === "downloading" || j.status === "starting") ||
    jobs.find((j) => j.status === "queued");

  return (
    <div className="web-downloader-container">
      {/* Header */}
      <div className="downloader-header">
        <div className="downloader-title-group">
          <div className="downloader-title-icon-wrapper">
            <Download size={22} className="downloader-icon" />
          </div>
          <div>
            <h1 className="downloader-title">Web Media Downloader</h1>
            <p className="downloader-subtitle">
              Download YouTube videos, playlists, shorts, and social media clips sequentially to your machine.
            </p>
          </div>
        </div>

        {onNavigateToSettings && (
          <div className="downloader-header-actions">
            <button
              type="button"
              className="downloader-header-btn"
              onClick={onNavigateToSettings}
              title="Open Web Downloader Settings"
              aria-label="Open Web Downloader Settings"
            >
              <Settings size={15} />
              <span>Settings</span>
            </button>
          </div>
        )}
      </div>

      {/* URL Input Form */}
      <div className="downloader-card input-card">
        <form onSubmit={handleAnalyze} className="downloader-input-form">
          <div className="input-field-wrapper">
            <div className="input-prefix-icon">
              <Search size={17} />
            </div>
            <input
              type="text"
              className="downloader-text-input"
              placeholder="Paste YouTube video or playlist URL (e.g. https://www.youtube.com/watch?v=...)"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            {url && (
              <button
                type="button"
                className="btn-input-icon btn-clear-input"
                onClick={() => {
                  setUrl("");
                  setAnalyzedData(null);
                  setParsedError(null);
                }}
                title="Clear input"
                aria-label="Clear input"
              >
                <X size={15} />
              </button>
            )}
            <button
              type="button"
              className="btn-paste-action"
              onClick={handlePaste}
              title="Paste link from clipboard"
              aria-label="Paste link from clipboard"
            >
              <ClipboardPaste size={14} />
              <span>Paste</span>
            </button>
          </div>

          <button
            type="submit"
            className="downloader-btn-primary"
            disabled={isAnalyzing || !url.trim()}
          >
            {isAnalyzing ? (
              <>
                <Loader2 size={16} className="btn-spinner" />
                <span>Analyzing...</span>
              </>
            ) : (
              <>
                <Download size={16} />
                <span>Fetch Media</span>
              </>
            )}
          </button>
        </form>

        {/* Clean, Non-AI Error Presentation */}
        {parsedError && (
          <div className="downloader-error-card">
            <div className="error-card-header">
              <div className="error-icon-box">
                {parsedError.type === "age_restricted" ? (
                  <ShieldAlert size={19} />
                ) : parsedError.type === "not_found" ? (
                  <FolderX size={19} />
                ) : (
                  <AlertTriangle size={19} />
                )}
              </div>
              <div className="error-card-body">
                <h3 className="error-card-title">{parsedError.title}</h3>
                <p className="error-card-message">{parsedError.message}</p>
                {parsedError.actionHint && (
                  <div className="error-card-hint">
                    <Info size={13} className="hint-icon" />
                    <span>{parsedError.actionHint}</span>
                  </div>
                )}
              </div>
            </div>

            {parsedError.technical && (
              <div className="error-card-technical">
                <button
                  type="button"
                  className="error-technical-toggle"
                  onClick={() => setShowTechnicalError(!showTechnicalError)}
                  aria-label="Toggle technical diagnostic log"
                >
                  {showTechnicalError ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  <span>{showTechnicalError ? "Hide technical diagnostic log" : "View technical diagnostic log"}</span>
                </button>

                {showTechnicalError && (
                  <div className="error-log-wrapper">
                    <div className="error-log-bar">
                      <span className="log-badge">Diagnostic Log</span>
                      <button
                        type="button"
                        className="btn-copy-log"
                        onClick={() => handleCopyLog(parsedError.technical)}
                        title="Copy diagnostic log"
                        aria-label="Copy diagnostic log"
                      >
                        {hasCopiedLog ? <Check size={12} /> : <Copy size={12} />}
                        <span>{hasCopiedLog ? "Copied" : "Copy Log"}</span>
                      </button>
                    </div>
                    <pre className="error-log-pre">{parsedError.technical}</pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Workspace Area: 60/40 Split & Independent Scroll Lock */}
      {analyzedData ? (
        <div className={jobs.length > 0 ? "downloader-workspace-split" : "downloader-workspace-main-only"}>
          {/* Main Column: Searched Media View with independent scroll area */}
          <div className={jobs.length > 0 ? "downloader-workspace-main coss-scroll-area" : "downloader-workspace-single coss-scroll-area"}>
            {analyzedData.isPlaylist ? (
              <div className="downloader-card playlist-card">
                <div className="playlist-summary-header">
                  <div className="playlist-cover-wrapper">
                    {analyzedData.thumbnail ? (
                      <img src={analyzedData.thumbnail} alt={analyzedData.title} className="playlist-cover-img" />
                    ) : (
                      <div className="playlist-cover-placeholder">
                        <ListVideo size={36} />
                      </div>
                    )}
                    <div className="playlist-count-pill">
                      <ListVideo size={13} />
                      <span>{analyzedData.entryCount} Videos</span>
                    </div>
                  </div>

                  <div className="playlist-meta-info">
                    <div className="playlist-type-tag">PLAYLIST</div>
                    <h2 className="playlist-title">{analyzedData.title}</h2>
                    <div className="playlist-author">
                      <User size={14} />
                      <span>{analyzedData.uploader}</span>
                      {analyzedData.rawCount > analyzedData.entryCount && (
                        <span className="playlist-skipped-pill">
                          {analyzedData.rawCount - analyzedData.entryCount} restricted items skipped
                        </span>
                      )}
                    </div>

                    {/* Format / Quality selection for batch using compact Dropdown */}
                    <div className="playlist-quality-selector">
                      <span className="selector-label">Batch Quality:</span>
                      <Dropdown
                        value={selectedFormat?.id}
                        onChange={(val) => {
                          const found = analyzedData.options?.find((o: any) => o.id === val);
                          if (found) setSelectedFormat(found);
                        }}
                        options={(analyzedData.options || []).map((opt: any) => ({
                          value: opt.id,
                          label: `${opt.label}${opt.size ? ` (${opt.size})` : ""}`
                        }))}
                        className="quality-dropdown-control"
                        minWidth={190}
                      />
                    </div>

                    {/* Action Toolbar */}
                    <div className="playlist-action-bar">
                      <div className="playlist-select-actions">
                        <button
                          type="button"
                          className="btn-select-toggle"
                          onClick={handleToggleSelectAll}
                          aria-label="Toggle select all items"
                        >
                          {selectedPlaylistIndices.length === analyzedData.entries.length ? (
                            <CheckSquare size={15} />
                          ) : (
                            <Square size={15} />
                          )}
                          <span>
                            {selectedPlaylistIndices.length === analyzedData.entries.length
                              ? "Deselect All"
                              : "Select All"}
                          </span>
                        </button>
                        <span className="selection-count-badge">
                          {selectedPlaylistIndices.length} of {analyzedData.entries.length} selected
                        </span>
                      </div>

                      <button
                        type="button"
                        className="downloader-btn-primary playlist-download-btn"
                        onClick={handleStartBatchDownload}
                        disabled={isStartingDownload || selectedPlaylistIndices.length === 0}
                      >
                        {isStartingDownload ? (
                          <>
                            <Loader2 size={15} className="btn-spinner" />
                            <span>Queuing {selectedPlaylistIndices.length} items...</span>
                          </>
                        ) : (
                          <>
                            <Download size={15} />
                            <span>Download Selected ({selectedPlaylistIndices.length})</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Playlist Filter Input */}
                <div className="playlist-filter-bar">
                  <div className="playlist-filter-box">
                    <Search size={14} />
                    <input
                      type="text"
                      placeholder="Filter videos in playlist..."
                      value={playlistSearchFilter}
                      onChange={(e) => setPlaylistSearchFilter(e.target.value)}
                      className="playlist-filter-input"
                    />
                    {playlistSearchFilter && (
                      <button
                        type="button"
                        className="filter-clear-btn"
                        onClick={() => setPlaylistSearchFilter("")}
                        title="Clear filter"
                        aria-label="Clear filter"
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>
                  <span className="filtered-entries-count">
                    Showing {filteredPlaylistEntries.length} of {analyzedData.entries.length} items
                  </span>
                </div>

                {/* Playlist Entries Table & Responsive Mobile List */}
                <div className="playlist-items-table">
                  <div className="playlist-table-head">
                    <span className="col-check">#</span>
                    <span className="col-title">Video Title</span>
                    <span className="col-channel">Channel</span>
                    <span className="col-duration">Duration</span>
                    <span className="col-action">Link</span>
                  </div>
                  <div className="playlist-table-body coss-scroll-area">
                    {filteredPlaylistEntries.map((item: any) => {
                      const isSelected = selectedPlaylistIndices.includes(item.index);
                      return (
                        <div
                          key={item.id || item.index}
                          className={`playlist-item-row ${isSelected ? "is-selected" : ""}`}
                          onClick={() => handleToggleItem(item.index)}
                        >
                          <div className="col-check" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleItem(item.index)}
                              className="item-checkbox"
                              aria-label={`Select ${item.title}`}
                            />
                            <span className="item-index-label">{item.index}</span>
                          </div>

                          <div className="col-title item-title-cell">
                            {item.thumbnail ? (
                              <img src={item.thumbnail} alt="" className="item-thumb-img" />
                            ) : (
                              <div className="item-thumb-placeholder">
                                <Video size={14} />
                              </div>
                            )}
                            <div className="item-title-meta-wrap">
                              <span className="item-title-text" title={item.title}>
                                {item.title}
                              </span>
                              <span className="item-mobile-sub">
                                {item.uploader} &bull; {item.duration}
                              </span>
                            </div>
                          </div>

                          <div className="col-channel item-channel-text">
                            {item.uploader}
                          </div>

                          <div className="col-duration item-duration-text">
                            <Clock size={12} />
                            <span>{item.duration}</span>
                          </div>

                          <div className="col-action" onClick={(e) => e.stopPropagation()}>
                            {item.url && (
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noreferrer"
                                className="item-external-link"
                                title="Open on YouTube"
                                aria-label="Open on YouTube"
                              >
                                <ExternalLink size={13} />
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="downloader-card result-card">
                <div className="result-layout">
                  <div className="thumbnail-wrapper">
                    {analyzedData.thumbnail ? (
                      <img src={analyzedData.thumbnail} alt={analyzedData.title} className="result-thumbnail" />
                    ) : (
                      <div className="thumbnail-placeholder">
                        <Video size={36} />
                      </div>
                    )}
                    {analyzedData.duration && (
                      <span className="duration-tag">
                        <Clock size={12} /> {analyzedData.duration}
                      </span>
                    )}
                  </div>

                  <div className="result-details">
                    <h2 className="result-title">{analyzedData.title}</h2>
                    <div className="result-meta">
                      <span className="meta-item">
                        <User size={14} /> {analyzedData.uploader}
                      </span>
                      {analyzedData.webpageUrl && (
                        <a
                          href={analyzedData.webpageUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="meta-link"
                          aria-label="Watch video online"
                        >
                          <ExternalLink size={13} /> Watch online
                        </a>
                      )}
                    </div>

                    {/* Format selection using compact Dropdown */}
                    <div className="format-selection-group">
                      <label className="section-label">Select Download Quality:</label>
                      <Dropdown
                        value={selectedFormat?.id}
                        onChange={(val) => {
                          const found = analyzedData.options?.find((o: any) => o.id === val);
                          if (found) setSelectedFormat(found);
                        }}
                        options={(analyzedData.options || []).map((opt: any) => ({
                          value: opt.id,
                          label: `${opt.label}${opt.size ? ` (${opt.size})` : ""}`
                        }))}
                        className="quality-dropdown-control"
                        minWidth={220}
                      />
                    </div>

                    {/* Download Action */}
                    <div className="action-row">
                      <button
                        type="button"
                        className="downloader-btn-start"
                        onClick={handleStartDownload}
                        disabled={isStartingDownload || !selectedFormat}
                      >
                        {isStartingDownload ? (
                          <>
                            <Loader2 size={16} className="btn-spinner" />
                            <span>Starting Download...</span>
                          </>
                        ) : (
                          <>
                            <Download size={16} />
                            <span>Download {selectedFormat?.type === "audio" ? "Audio" : "Video"} ({selectedFormat?.quality || "Best"})</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar Panel: Dedicated Downloads Queue with its own scroll area (40%, min-width 375px) */}
          {jobs.length > 0 && (
            <aside className="downloader-sidebar-panel coss-scroll-area" aria-label="Downloads Sidebar">
              {renderQueueSection(true)}
            </aside>
          )}
        </div>
      ) : jobs.length > 0 ? (
        /* Full-width Download Queue when nothing is currently searched */
        <div className="downloader-workspace-full coss-scroll-area">
          {renderQueueSection(false)}
        </div>
      ) : null}

      {/* Mobile Floating Trigger Bar (Coss UI / Aceternity Docked Pill) */}
      {jobs.length > 0 && !isMobileBottomSheetOpen && (
        <button
          type="button"
          className="mobile-downloads-trigger-bar"
          onClick={() => setIsMobileBottomSheetOpen(true)}
          aria-label="Open download queue bottom sheet"
        >
          <div className="trigger-bar-left">
            <div className={`trigger-icon-pulse ${activeJob?.status === "downloading" ? "is-downloading" : ""}`}>
              {activeJob?.status === "downloading" ? (
                <Loader2 size={16} className="btn-spinner" />
              ) : (
                <Download size={16} />
              )}
            </div>
            <div className="trigger-bar-text">
              <span className="trigger-title">
                {activeJob ? activeJob.title : `Download Queue (${jobs.length})`}
              </span>
              <span className="trigger-progress-sub">
                {activeJob?.status === "downloading"
                  ? `${(activeJob.progress || 0).toFixed(0)}% • ${activeJob.speed || "Downloading"}`
                  : activeJob?.status === "queued"
                  ? "Queued in background"
                  : `${jobs.filter((j) => j.status === "completed").length} completed`}
              </span>
            </div>
          </div>
          <div className="trigger-bar-right">
            <span className="trigger-open-badge">View</span>
            <ChevronUp size={16} />
          </div>
        </button>
      )}

      {/* Mobile Bottom Sheet Backdrop & Drawer (Aceternity Spring Slide + Coss UI Touch Handle) */}
      <div
        className={`mobile-bottom-sheet-backdrop ${isMobileBottomSheetOpen ? "is-visible" : ""}`}
        onClick={() => setIsMobileBottomSheetOpen(false)}
        aria-hidden="true"
      />
      <div
        className={`mobile-bottom-sheet ${isMobileBottomSheetOpen ? "is-open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Download Queue"
      >
        <div className="bottom-sheet-scroll-container coss-scroll-area">
          <div
            className="bottom-sheet-handle-bar"
            onClick={() => setIsMobileBottomSheetOpen(false)}
            role="button"
            tabIndex={0}
            aria-label="Minimize sheet"
          >
            <div className="bottom-sheet-handle-pill" />
          </div>
          {renderQueueSection(true, true)}
        </div>
      </div>
    </div>
  );
}
