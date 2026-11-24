// @ts-nocheck
import { useState, useEffect } from "react";
import LoadingSpinner from "../common/LoadingSpinner";
import {
  Download,
  Film,
  Eye,
  CheckCircle,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Loader2,
  X,
  Bookmark,
  Plus,
  SearchX,
} from "lucide-react";

const getProxiedImageUrl = (url, item) => {
  if (!url) return "/images/image-404.png";
  if (
    url.startsWith("/api/image") ||
    url.startsWith("data:") ||
    url.startsWith("file://") ||
    url.startsWith("/images/")
  ) {
    return url;
  }
  let query = `url=${encodeURIComponent(url)}`;
  const malid = item?.malid || item?.MalID || item?.id;
  if (malid && !isNaN(parseInt(malid, 10))) {
    query += `&malid=${malid}`;
  }
  if (item?.title) {
    query += `&title=${encodeURIComponent(item.title)}`;
  }
  return `/api/image?${query}`;
};

export default function CatalogGrid({
  loading,
  data,
  type,
  provider,
  activeFilters,
  searchQuery,
  infiniteScroll,
  infiniteLoading,
  currentPage,
  loadedPageStart,
  topSentinelRef,
  sentinelRef,
  canReorder: propCanReorder,
  draggedIndex,
  dragOverIndex,
  handleDragStart,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  handleDragEnd,
  handleTouchStart,
  handleTouchMove,
  handleTouchEnd,
  handleMediaClick,
  handlePageChange,
  handleRemoveFromLibrary,
  getItemTagInfo,
  onOpenTagModal,
}) {
  const [loadingStatusText, setLoadingStatusText] = useState("");
  const [pageInput, setPageInput] = useState(String(currentPage || 1));

  useEffect(() => {
    setPageInput(String(currentPage || 1));
  }, [currentPage]);

  const handleJumpSubmit = (e) => {
    e.preventDefault();
    const pageNum = parseInt(pageInput, 10);
    if (!isNaN(pageNum) && handlePageChange) {
      const maxPages = data?.totalPages || 9999;
      const targetPage = Math.max(1, Math.min(maxPages, pageNum));
      setPageInput(String(targetPage));
      if (targetPage !== currentPage) {
        handlePageChange(targetPage);
      }
    } else {
      setPageInput(String(currentPage || 1));
    }
  };

  const canReorder =
    propCanReorder !== undefined
      ? propCanReorder
      : provider === "local" && (!searchQuery || !searchQuery.trim());

  useEffect(() => {
    if (window.sharedStateAPI && window.sharedStateAPI.on) {
      const unsub = window.sharedStateAPI.on(
        "catalog-loading-status",
        (payload) => {
          setLoadingStatusText(payload?.text || "");
        },
      );
      return () => {
        if (typeof unsub === "function") unsub();
      };
    }
  }, []);

  if (loading) {
    return (
      <div className="content-container">
        {type === "Movies" && !searchQuery && (
          <div className="catalog-section-header-centered">
            <div
              className="skeleton-bar"
              style={{ width: "220px", height: "24px", marginBottom: "6px" }}
            />
            <div
              className="skeleton-bar"
              style={{ width: "170px", height: "14px" }}
            />
          </div>
        )}
        <div className="content-grid">
          {Array.from({ length: 18 }).map((_, idx) => (
            <div
              key={`skel-card-${idx}`}
              className="media-card skeleton-media-card"
            >
              <div className="img-container skeleton-poster-box">
                <div className="skeleton-media-shimmer" />
              </div>
              <div className="card-info skeleton-card-info">
                <div
                  className="skeleton-bar"
                  style={{
                    width: "84%",
                    height: "16px",
                    borderRadius: "4px",
                  }}
                />
                <div
                  className="skeleton-bar"
                  style={{
                    width: "42%",
                    height: "12px",
                    borderRadius: "4px",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (data?.results?.length === 0) {
    return (
      <div className="empty-center-panel">
        <SearchX size={36} className="u-style-24" />
        <h3>
          {provider === "local" ? "Empty Collection" : "No results found"}
        </h3>
        <p className="u-style-25">
          {provider === "local"
            ? activeFilters.tag
              ? `No items found tagged with "${activeFilters.tag}".`
              : `Your local ${type.toLowerCase()} library is empty.`
            : activeFilters?.downloadStatus === "downloaded"
              ? `No downloaded ${type.toLowerCase()} found on this page.`
              : activeFilters?.downloadStatus === "not_downloaded" ||
                  activeFilters?.downloadStatus === "nondownloaded"
                ? `All ${type.toLowerCase()} on this page are already downloaded.`
                : searchQuery.trim().length > 0
                  ? "Try checking your spelling or using different search terms."
                  : "Try changing your selected filters."}
        </p>
      </div>
    );
  }

  return (
    <div className="content-container">
      {type === "Movies" && !searchQuery && (
        <div className="catalog-section-header-centered">
          <h3 className="catalog-section-title">All Movies & Series</h3>
          <span className="catalog-section-subtitle">
            Browse catalog & downloads
          </span>
        </div>
      )}
      {infiniteScroll && loadedPageStart > 1 && (
        <div
          ref={topSentinelRef}
          className="infinite-sentinel-top"
          style={{ height: "1px" }}
        />
      )}
      <div className="content-grid">
        {data.results.map((item, index) => (
          <div
            key={item.id}
            data-index={index}
            draggable={canReorder}
            onDragStart={
              canReorder
                ? (e) => handleDragStart && handleDragStart(e, index)
                : undefined
            }
            onDragOver={
              canReorder
                ? (e) => handleDragOver && handleDragOver(e, index)
                : undefined
            }
            onDragLeave={
              canReorder
                ? (e) => handleDragLeave && handleDragLeave(e, index)
                : undefined
            }
            onDrop={
              canReorder ? (e) => handleDrop && handleDrop(e, index) : undefined
            }
            onDragEnd={canReorder ? handleDragEnd : undefined}
            onTouchStart={
              canReorder
                ? (e) => handleTouchStart && handleTouchStart(e, index)
                : undefined
            }
            onTouchMove={canReorder ? handleTouchMove : undefined}
            onTouchEnd={canReorder ? handleTouchEnd : undefined}
            onClick={() => handleMediaClick(item)}
            className={`media-card ${canReorder ? "is-reorderable" : ""} ${canReorder && draggedIndex === index ? "is-dragging" : ""} ${canReorder && dragOverIndex === index ? "is-drag-over" : ""}`}
            title={canReorder ? "Hold & drag to reorder title" : undefined}
          >
            <div className="img-container">
              <img
                src={getProxiedImageUrl(
                  item.mal_image || item.image || item.scraper_image,
                  item,
                )}
                alt={item.title}
                className="media-img"
                loading="lazy"
                draggable={false}
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.src = "/images/image-404.png";
                }}
              />

              <div className="card-top-actions">
                {(() => {
                  const tagInfo = getItemTagInfo ? getItemTagInfo(item) : null;
                  const tags = tagInfo?.tags || [];
                  const isTagged = tags.length > 0;

                  return (
                    <button
                      className={`card-tag-btn ${isTagged ? "is-tagged" : ""}`}
                      title={
                        isTagged
                          ? `Tagged: ${tags.join(", ")} (Click to edit tag)`
                          : "Add tag to Library"
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onOpenTagModal) onOpenTagModal(e, item);
                      }}
                    >
                      {isTagged ? (
                        <Bookmark size={14} className="bookmark-icon" />
                      ) : (
                        <Plus size={14} />
                      )}
                    </button>
                  );
                })()}

                {provider === "local" && handleRemoveFromLibrary && (
                  <button
                    className="card-remove-btn"
                    title="Remove from Library"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveFromLibrary(item);
                    }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Indicator badges for downloaded, schedule, watched progress, or completed */}
              <div className="card-badges-container">
                {item.isGroupedSeries && (
                  <div
                    className="indicator-badge series-badge"
                    title={`Consolidated series with ${item.totalSeasons} seasons`}
                  >
                    <Film size={12} className="u-style-16" />
                    {item.seasonBadgeText || `${item.totalSeasons} Seasons`}
                  </div>
                )}

                {item.Downloaded && item.Downloaded.length > 0 && (
                  <div className="indicator-badge">
                    <Download size={12} className="u-style-16" />
                    {item.Downloaded.length}{" "}
                    {type === "Manga"
                      ? "Chs"
                      : type === "Movies" && item.Downloaded.length === 1
                        ? "Movie"
                        : "Eps"}
                  </div>
                )}

                {item.nextEpisodeIn && (
                  <div
                    className="indicator-badge schedule-badge"
                    title="Next release countdown"
                  >
                    <Film size={12} className="u-style-16" />
                    {item.nextEpisodeIn}
                  </div>
                )}

                {item.isCompleted || item.malStatus === "completed" ? (
                  <div
                    className="indicator-badge completed-badge"
                    title={`Completed${
                      item.watched
                        ? ` (${type === "Manga" ? "Ch " : "Ep "}${item.watched}${item.totalEpisodes ? `/${item.totalEpisodes}` : ""})`
                        : ""
                    }`}
                  >
                    <CheckCircle size={12} className="u-style-16" />
                    Completed
                    {item.watched > 0
                      ? ` (${item.totalEpisodes > 0 ? `${item.watched}/${item.totalEpisodes}` : `${type === "Manga" ? "Ch " : "Ep "}${item.watched}`})`
                      : ""}
                  </div>
                ) : (
                  item.watched !== undefined &&
                  item.watched !== null &&
                  item.watched > 0 && (
                    <div
                      className="indicator-badge watched-badge"
                      title={`${type === "Manga" ? "Read" : "Watched"}: ${type === "Manga" ? "Ch " : "Ep "}${item.watched}${item.totalEpisodes ? `/${item.totalEpisodes}` : ""}`}
                    >
                      {type === "Manga" ? (
                        <BookOpen size={12} className="u-style-16" />
                      ) : (
                        <Eye size={12} className="u-style-16" />
                      )}
                      {item.totalEpisodes > 0
                        ? `${item.watched}/${item.totalEpisodes}`
                        : `${type === "Manga" ? "Ch " : "Ep "}${item.watched}`}
                    </div>
                  )
                )}
              </div>
            </div>

            <div className="card-info">
              <h4 className="card-title">{item.title}</h4>
              {(item.character || item.role || item.year) && (
                <div className="card-role-meta">
                  {item.character && (
                    <span className="card-character" title={`as ${item.character}`}>
                      as {item.character}
                    </span>
                  )}
                  {!item.character && item.role && (
                    <span className="card-role">{item.role}</span>
                  )}
                  {item.year && <span className="card-year-meta">{item.year}</span>}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Infinite scroll sentinel */}
      {infiniteScroll && (
        <div ref={sentinelRef} className="infinite-sentinel">
          {infiniteLoading && (
            <div
              className="content-grid infinite-skeleton-grid"
              style={{ width: "100%", margin: "16px 0 24px 0" }}
            >
              {Array.from({ length: 6 }).map((_, idx) => (
                <div
                  key={`inf-skel-${idx}`}
                  className="media-card glass-panel skeleton-media-card"
                >
                  <div className="img-container skeleton-poster-box">
                    <div className="skeleton-media-shimmer" />
                  </div>
                  <div className="card-info" style={{ padding: "10px 8px" }}>
                    <div
                      className="skeleton-bar"
                      style={{
                        width: "75%",
                        height: "14px",
                        marginBottom: "6px",
                      }}
                    />
                    <div
                      className="skeleton-bar"
                      style={{ width: "40%", height: "11px" }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
          {!infiniteLoading &&
            !data.hasNextPage &&
            currentPage >= (data.totalPages || 1) &&
            data.results.length > 0 && (
              <div className="infinite-end-label">You've reached the end</div>
            )}
        </div>
      )}

      {/* Pagination */}
      {!infiniteScroll &&
        (data.totalPages > 1 || data.hasNextPage || currentPage > 1) && (
          <div className="pagination-container">
            <button
              onClick={() => handlePageChange(1)}
              disabled={currentPage <= 1}
              className="btn-page"
              title="First Page"
            >
              <ChevronsLeft size={16} />
            </button>
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage <= 1}
              className="btn-page"
              title="Previous Page"
            >
              <ChevronLeft size={16} />
            </button>

            <form onSubmit={handleJumpSubmit} className="pagination-jump-form">
              <span className="pagination-label">Page</span>
              <input
                type="number"
                min="1"
                max={data.totalPages || 9999}
                value={pageInput}
                onChange={(e) => setPageInput(e.target.value)}
                onBlur={() => setPageInput(String(currentPage || 1))}
                className="pagination-jump-input"
                aria-label="Jump to page number"
              />
              {data.totalPages > 0 && (
                <span className="pagination-total">of {data.totalPages}</span>
              )}
              <button
                type="submit"
                className="btn-page-go"
                title="Jump to page"
              >
                Go
              </button>
            </form>

            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={
                !data.hasNextPage && currentPage >= (data.totalPages || 999)
              }
              className="btn-page"
              title="Next Page"
            >
              <ChevronRight size={16} />
            </button>
            {data.totalPages > 1 && (
              <button
                onClick={() => handlePageChange(data.totalPages)}
                disabled={currentPage >= data.totalPages}
                className="btn-page"
                title="Last Page"
              >
                <ChevronsRight size={16} />
              </button>
            )}
          </div>
        )}
    </div>
  );
}
