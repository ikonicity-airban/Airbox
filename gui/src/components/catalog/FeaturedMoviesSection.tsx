import React, { useState, useEffect } from "react";
import { Flame, TrendingUp, Star, Play } from "lucide-react";
import "../css/FeaturedMovies.css";

export interface FeaturedMovieItem {
  id: string | number;
  title: string;
  poster: string | null;
  backdrop?: string | null;
  overview?: string;
  rating?: number | null;
  year?: string | number | null;
  mediaType: "movie" | "tv";
}

interface FeaturedMoviesSectionProps {
  onSelectMovie: (movie: FeaturedMovieItem) => void;
  onPopulateGrid?: (remaining: FeaturedMovieItem[]) => void;
}

export const FeaturedMoviesSection: React.FC<FeaturedMoviesSectionProps> = ({
  onSelectMovie,
  onPopulateGrid,
}) => {
  const [items, setItems] = useState<FeaturedMovieItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;
    const fetchFeatured = async () => {
      try {
        const res = await fetch("/api/movies/featured?page=1");
        if (res.ok) {
          const data = await res.json();
          if (isMounted && Array.isArray(data.featured)) {
            setItems(data.featured);
            if (onPopulateGrid && data.featured.length > 8) {
              onPopulateGrid(data.featured.slice(8));
            } else if (onPopulateGrid && data.featured.length > 3) {
              onPopulateGrid(data.featured.slice(3));
            }
          }
        }
      } catch (err) {
        console.error("Failed to load featured movies:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchFeatured();
    return () => {
      isMounted = false;
    };
  }, []);

  // Shimmer Skeleton Loader (preserves layout exactly, zero spinners)
  if (loading) {
    return (
      <div className="featured-movies-section">
        {/* Segment 1: Featured 3 Massive Cards Skeletons */}
        <div className="featured-header">
          <div className="featured-title-group">
            <div className="featured-title-main">
              <Flame size={20} color="#f0883e" />
              <h2 className="featured-title">Featured Highlights</h2>
            </div>
            <span className="featured-subtitle">Top-rated trending picks</span>
          </div>
        </div>
        <div className="featured-massive-grid">
          {[1, 2, 3].map((i) => (
            <div key={`skel-massive-${i}`} className="featured-massive-card skeleton-massive-card">
              <div className="skeleton-massive-shimmer" />
              <div className="skeleton-massive-overlay">
                <div className="skeleton-bar" style={{ width: "80px", height: "18px", borderRadius: "4px" }} />
                <div className="skeleton-bottom-group">
                  <div className="skeleton-bar" style={{ width: "65%", height: "24px", marginBottom: "8px" }} />
                  <div className="skeleton-bar" style={{ width: "90%", height: "14px", marginBottom: "6px" }} />
                  <div className="skeleton-bar" style={{ width: "40%", height: "14px", marginBottom: "12px" }} />
                  <div className="skeleton-bar" style={{ width: "100px", height: "28px", borderRadius: "6px" }} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Segment 2: Trending 5 Cards Skeletons */}
        <div className="featured-trending-section">
          <div className="featured-header">
            <div className="featured-title-group">
              <div className="featured-title-main">
                <TrendingUp size={18} color="#58a6ff" />
                <h3 className="featured-title">Trending This Week</h3>
              </div>
              <span className="featured-subtitle">Popular streaming releases</span>
            </div>
          </div>
          <div className="featured-trending-grid">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={`skel-trend-${i}`} className="featured-trending-card skeleton-trending-card">
                <div className="featured-trending-thumb-wrapper skeleton-trending-thumb-shimmer" />
                <div className="featured-trending-info">
                  <div className="skeleton-bar" style={{ width: "75%", height: "15px", marginBottom: "6px" }} />
                  <div className="skeleton-bar" style={{ width: "40%", height: "12px" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (items.length === 0) return null;

  // Segment 1: The first row displays 3 massive featured hero cards
  const topThree = items.slice(0, 3);
  // Segment 2: Next 5 cards for the trending row
  const trendingFive = items.slice(3, 8);

  return (
    <div className="featured-movies-section">
      {/* Segment 1: 3 Massive Featured Hero Cards */}
      <div className="featured-header">
        <div className="featured-title-group">
          <div className="featured-title-main">
            <Flame size={20} color="#f0883e" />
            <h2 className="featured-title">Featured Highlights</h2>
          </div>
          <span className="featured-subtitle">Top-rated trending picks</span>
        </div>
      </div>

      <div className="featured-massive-grid">
        {topThree.map((movie) => {
          const bannerImg =
            movie.backdrop || movie.poster || "/images/image-404.png";
          return (
            <div
              key={`massive-${movie.id}`}
              className="featured-massive-card"
              onClick={() => onSelectMovie(movie)}
              title={`${movie.title} (${movie.year || "N/A"}) - Click to view details and stream`}
            >
              <img
                src={bannerImg}
                alt={movie.title}
                className="featured-massive-bg"
                loading="lazy"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "/images/image-404.png";
                }}
              />
              <div className="featured-massive-overlay">
                <div className="featured-top-badges">
                  <span className="featured-badge-pill">
                    {movie.mediaType === "tv" ? "TV Series" : "Featured Movie"}
                  </span>
                  {movie.rating != null && (
                    <span className="featured-badge-rating">
                      <Star size={12} fill="#f1e05a" stroke="#f1e05a" />
                      {movie.rating}
                    </span>
                  )}
                </div>

                <div className="featured-bottom-content">
                  <h3 className="featured-massive-title">{movie.title}</h3>
                  {movie.overview && (
                    <p className="featured-massive-overview">
                      {movie.overview}
                    </p>
                  )}
                  <div className="featured-massive-actions">
                    <span className="featured-massive-year">
                      {movie.year || "Featured"}
                    </span>
                    <button
                      type="button"
                      className="featured-massive-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectMovie(movie);
                      }}
                    >
                      <Play size={13} fill="white" />
                      <span>Stream / Get</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Segment 2: 5 Trending Cards Row */}
      {trendingFive.length > 0 && (
        <div className="featured-trending-section">
          <div className="featured-header">
            <div className="featured-title-group">
              <div className="featured-title-main">
                <TrendingUp size={18} color="#58a6ff" />
                <h3 className="featured-title">Trending This Week</h3>
              </div>
              <span className="featured-subtitle">Popular streaming releases</span>
            </div>
          </div>

          <div className="featured-trending-grid">
            {trendingFive.map((movie) => {
              const posterImg =
                movie.poster || movie.backdrop || "/images/image-404.png";
              return (
                <div
                  key={`trend-${movie.id}`}
                  className="featured-trending-card glass-panel"
                  onClick={() => onSelectMovie(movie)}
                  title={`${movie.title} - Click to stream and download`}
                >
                  <div className="featured-trending-thumb-wrapper">
                    <img
                      src={posterImg}
                      alt={movie.title}
                      className="featured-trending-thumb"
                      loading="lazy"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src =
                          "/images/image-404.png";
                      }}
                    />
                    <div className="featured-trending-hover-overlay">
                      <button type="button" className="featured-trending-play-btn">
                        <Play size={13} fill="white" />
                        <span>Watch</span>
                      </button>
                    </div>
                    {movie.rating != null && (
                      <span className="featured-trending-rating">
                        <Star size={10} fill="#f1e05a" stroke="#f1e05a" />
                        {movie.rating}
                      </span>
                    )}
                  </div>
                  <div className="featured-trending-info">
                    <h4 className="featured-trending-title">{movie.title}</h4>
                    <div className="featured-trending-meta">
                      <span>{movie.year || "Popular"}</span>
                      <span className="featured-trending-badge">
                        {movie.mediaType === "tv" ? "TV" : "Movie"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
