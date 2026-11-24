import React from "react";
import { Calendar, Clock, Search, Tv } from "lucide-react";

export interface AiringEpisode {
  livechart_id?: string | number;
  malid?: string | number;
  title: string;
  episode: number | string;
  date: number; // Unix timestamp in seconds
  image?: string;
  scraper_image?: string;
  fallback_image?: string;
}

export interface AiringCalendarProps {
  calendarLoading?: boolean;
  scheduleUpdating?: boolean;
  scheduleData: AiringEpisode[];
  calendarDayFilter: string;
  setCalendarDayFilter: (day: string) => void;
  timeTicker: number;
  onSelectMedia: (
    id: string | number,
    provider: string,
    backText: string,
    isContinue?: boolean,
    title?: string
  ) => void;
  triggerScrapeSearch: (query: string) => void;
}

const getProxiedImageUrl = (url?: string): string => {
  if (!url) return "/images/image-404.png";
  if (
    url.startsWith("/api/image") ||
    url.startsWith("data:") ||
    url.startsWith("file://") ||
    url.startsWith("/images/")
  ) {
    return url;
  }
  return `/api/image?url=${encodeURIComponent(url)}`;
};

export default function AiringCalendar({
  calendarLoading,
  scheduleUpdating,
  scheduleData = [],
  calendarDayFilter,
  setCalendarDayFilter,
  timeTicker,
  onSelectMedia,
  triggerScrapeSearch,
}: AiringCalendarProps): React.JSX.Element {
  const getCountdownString = (airTimestamp: number): string => {
    const diffMs = airTimestamp * 1000 - timeTicker;
    if (diffMs <= 0) return "Aired";

    const totalMins = Math.floor(diffMs / 60000);
    const days = Math.floor(totalMins / (24 * 60));
    const hours = Math.floor((totalMins % (24 * 60)) / 60);
    const mins = totalMins % 60;

    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (mins > 0 || parts.length === 0) parts.push(`${mins}m`);

    return `In ${parts.join(" ")}`;
  };

  if (calendarLoading) {
    return (
      <div className="calendar-view-container" style={{ pointerEvents: "none" }}>
        <div className="calendar-section">
          <div className="skeleton-bar" style={{ width: "240px", height: "24px", marginBottom: "20px", borderRadius: "6px" }} />
          <div className="calendar-tabs-container" style={{ marginBottom: "24px" }}>
            {[1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div key={i} className="calendar-day-tab skeleton-bar" style={{ height: "48px", width: "70px", borderRadius: "10px" }} />
            ))}
          </div>
          <div className="schedule-vertical-list">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="schedule-row-card glass-panel">
                <div className="schedule-row-left skeleton-bar" style={{ borderRadius: "10px" }} />
                <div className="schedule-row-info" style={{ gap: "10px", flex: 1 }}>
                  <div className="skeleton-bar" style={{ width: "70%", height: "16px", borderRadius: "4px" }} />
                  <div className="skeleton-bar" style={{ width: "45%", height: "12px", borderRadius: "4px" }} />
                  <div className="skeleton-bar" style={{ width: "30%", height: "12px", borderRadius: "4px" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const daysOfWeek = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const dayAbbr = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const today = new Date();

  const tabs = [
    { id: "All", label: "ALL", dateNum: "", month: "" },
    {
      id: "Yesterday",
      label: "YEST",
      dateNum: new Date(today.getTime() - 24 * 60 * 60 * 1000)
        .getDate()
        .toString(),
      month: new Date(today.getTime() - 24 * 60 * 60 * 1000).toLocaleDateString(
        undefined,
        { month: "short" },
      ),
    },
    {
      id: "Today",
      label: "TODAY",
      dateNum: today.getDate().toString(),
      month: today.toLocaleDateString(undefined, {
        month: "short",
      }),
    },
    {
      id: "Tomorrow",
      label: "TOMO",
      dateNum: new Date(today.getTime() + 24 * 60 * 60 * 1000)
        .getDate()
        .toString(),
      month: new Date(today.getTime() + 24 * 60 * 60 * 1000).toLocaleDateString(
        undefined,
        { month: "short" },
      ),
    },
  ];

  for (let i = 2; i < 6; i++) {
    const nextDate = new Date(today.getTime() + i * 24 * 60 * 60 * 1000);
    tabs.push({
      id: daysOfWeek[nextDate.getDay()],
      label: dayAbbr[nextDate.getDay()],
      dateNum: nextDate.getDate().toString(),
      month: nextDate.toLocaleDateString(undefined, {
        month: "short",
      }),
    });
  }

  const scheduleByDay: Array<{
    dayName: string;
    dateStr: string;
    episodes: AiringEpisode[];
  }> = [];

  for (let i = -1; i < 6; i++) {
    const targetDate = new Date(today.getTime() + i * 24 * 60 * 60 * 1000);
    const dayName = daysOfWeek[targetDate.getDay()];
    const dateStr = targetDate.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });

    const dayStart =
      new Date(
        targetDate.getFullYear(),
        targetDate.getMonth(),
        targetDate.getDate(),
        0,
        0,
        0,
      ).getTime() / 1000;
    const dayEnd = dayStart + 24 * 3600;

    const dayEpisodes = scheduleData.filter(
      (ep) => ep.date >= dayStart && ep.date < dayEnd,
    );

    scheduleByDay.push({
      dayName:
        i === -1
          ? "Yesterday"
          : i === 0
            ? "Today"
            : i === 1
              ? "Tomorrow"
              : dayName,
      dateStr,
      episodes: dayEpisodes,
    });
  }

  const filteredGroups = scheduleByDay.filter((group) => {
    if (calendarDayFilter === "All") return true;
    return group.dayName === calendarDayFilter;
  });

  const totalEpisodesCount = filteredGroups.reduce(
    (acc, g) => acc + g.episodes.length,
    0,
  );

  return (
    <div className="calendar-view-container">
      <div className="calendar-section">
        <h2 className="calendar-section-title">Weekly Airing Schedule</h2>
        {scheduleUpdating && (
          <div className="schedule-updating-banner u-style-19">
            <div className="pulse-dot u-style-20" />
            <span className="u-style-21">
              Refreshing airing schedule from LiveChart...
            </span>
            <span className="u-style-22">
              Fresh episodes will display automatically
            </span>
          </div>
        )}

        <div className="calendar-tabs-container">
          {tabs.map((tab) => {
            const isActive = calendarDayFilter === tab.id;
            return (
              <button
                key={tab.id}
                className={`calendar-day-tab ${tab.id === "Yesterday" ? "yesterday" : ""} ${isActive ? "active" : ""} ${tab.id === "All" ? "all-tab" : ""}`}
                onClick={() => setCalendarDayFilter(tab.id)}
              >
                {tab.id === "All" ? (
                  <div className="calendar-tab-content-all">
                    <Calendar size={16} />
                    <span className="tab-day-label">{tab.label}</span>
                  </div>
                ) : (
                  <div className="calendar-tab-content">
                    <span className="tab-day-label">{tab.label}</span>
                    <span className="tab-date-num">{tab.dateNum}</span>
                    <span className="tab-month-label">{tab.month}</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <div className="schedule-feed-container">
          {totalEpisodesCount === 0 ? (
            <div className="schedule-empty-state glass-panel">
              <div className="empty-state-icon">
                <Tv size={36} className="u-style-23" />
              </div>
              <h3>
                No episodes airing{" "}
                {calendarDayFilter !== "All"
                  ? calendarDayFilter.toLowerCase()
                  : "this week"}
              </h3>
              <p>Check back later or view other days in the calendar.</p>
            </div>
          ) : (
            filteredGroups.map((group) => {
              if (group.episodes.length === 0) return null;

              return (
                <div
                  key={group.dayName}
                  className={`schedule-day-section ${group.dayName === "Yesterday" ? "yesterday-section" : ""}`}
                >
                  <div className="schedule-section-header">
                    <span className="section-day-name">{group.dayName}</span>
                    <span className="section-day-date">{group.dateStr}</span>
                  </div>

                  <div className="schedule-vertical-list">
                    {group.episodes.map((ep) => {
                      const airTime = new Date(
                        ep.date * 1000,
                      ).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      });

                      const isAired = ep.date * 1000 <= timeTicker;
                      const countdownStr = getCountdownString(ep.date);

                      return (
                        <div
                          key={`${ep.livechart_id}-${ep.episode}`}
                          className="schedule-row-card glass-panel"
                          onClick={() => {
                            if (ep.malid) {
                              onSelectMedia(
                                ep.malid,
                                "mal",
                                "Back to Calendar",
                                undefined,
                                ep.title,
                              );
                            } else {
                              triggerScrapeSearch(ep.title);
                            }
                          }}
                        >
                          <div className="schedule-row-left">
                            <img
                              src={getProxiedImageUrl(
                                ep.image || ep.scraper_image,
                              )}
                              alt={ep.title}
                              className="schedule-row-img"
                              onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                                const target = e.currentTarget;
                                const fallback =
                                  ep.scraper_image || ep.fallback_image;
                                const proxiedFallback = fallback
                                  ? getProxiedImageUrl(fallback)
                                  : null;
                                const currentSrc = target.getAttribute("src");
                                if (
                                  proxiedFallback &&
                                  currentSrc !== proxiedFallback &&
                                  target.src !== proxiedFallback
                                ) {
                                  target.src = proxiedFallback;
                                } else {
                                  target.onerror = null;
                                  target.src = "/images/image-404.png";
                                }
                              }}
                            />
                          </div>
                          <div className="schedule-row-info">
                            <div className="schedule-row-meta">
                              <span className="schedule-row-ep-badge">
                                EPISODE {ep.episode}
                              </span>
                              <span
                                className={`schedule-row-status-dot ${isAired ? "aired" : "airing"}`}
                              />
                            </div>
                            <h4
                              className="schedule-row-title-new"
                              title={ep.title}
                            >
                              {ep.title}
                            </h4>
                            <div className="schedule-row-badges">
                              <span className="schedule-row-time-badge">
                                <Clock size={11} />
                                {airTime}
                              </span>
                              <span
                                className={`schedule-row-countdown-badge ${isAired ? "aired" : "airing"}`}
                              >
                                {countdownStr}
                              </span>
                            </div>
                          </div>
                          {isAired && (
                            <div className="schedule-row-actions">
                              <button
                                className="schedule-row-action-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  triggerScrapeSearch(ep.title);
                                }}
                                title="Find Stream"
                              >
                                <Search size={14} />
                                <span className="btn-text-desktop">
                                  Find Stream
                                </span>
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
