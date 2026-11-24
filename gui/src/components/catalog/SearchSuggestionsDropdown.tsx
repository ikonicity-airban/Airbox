import React, { useEffect, useRef } from "react";
import {
  History,
  Search,
  X,
  Film,
  BookOpen,
  Tv,
  Loader2,
  Star,
  ChevronRight,
  User,
  Clapperboard,
} from "lucide-react";
import { SearchHistoryEntry } from "../../utils/searchHistory";
import "../css/SearchSuggestions.css";

export interface TitleSuggestion {
  id?: string | number;
  title: string;
  image?: string;
  type?: string;
  year?: string | number | null;
  rating?: number | null;
  overview?: string;
  genres?: string[];
}

export interface PersonSuggestion {
  id: string;
  name: string;
  department?: string;
  image?: string;
  biography?: string;
  creditCount?: number;
}

interface SearchSuggestionsDropdownProps {
  isOpen: boolean;
  searchQuery: string;
  mediaType?: string;
  history: SearchHistoryEntry[];
  suggestions: TitleSuggestion[];
  person?: PersonSuggestion | null;
  isLoadingSuggestions?: boolean;
  activeIndex: number;
  onSelectQuery: (query: string) => void;
  onSelectSuggestion?: (item: TitleSuggestion) => void;
  onSelectPerson?: (person: PersonSuggestion) => void;
  onRemoveHistory: (query: string, e: React.MouseEvent) => void;
  onClearHistory: () => void;
  onClose: () => void;
}

export const SearchSuggestionsDropdown: React.FC<SearchSuggestionsDropdownProps> = ({
  isOpen,
  searchQuery,
  history,
  suggestions,
  person,
  isLoadingSuggestions = false,
  activeIndex,
  onSelectQuery,
  onSelectSuggestion,
  onSelectPerson,
  onRemoveHistory,
  onClearHistory,
  onClose,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isQueryMode = searchQuery.trim().length >= 2;

  // Render text with matching query highlighted
  const renderHighlighted = (text: string, query: string) => {
    if (!query) return text;
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const startIndex = lowerText.indexOf(lowerQuery);
    if (startIndex === -1) return text;

    const before = text.slice(0, startIndex);
    const match = text.slice(startIndex, startIndex + query.length);
    const after = text.slice(startIndex + query.length);

    return (
      <>
        {before}
        <span className="search-suggestion-highlight">{match}</span>
        {after}
      </>
    );
  };

  const getMediaIcon = (itemType?: string) => {
    const norm = (itemType || "").toLowerCase();
    if (norm === "manga") return <BookOpen size={16} />;
    if (norm === "movies" || norm === "movie") return <Film size={16} />;
    return <Tv size={16} />;
  };

  return (
    <div className="search-suggestions-dropdown" ref={containerRef}>
      {!isQueryMode && history.length > 0 && (
        <>
          <div className="search-suggestions-header">
            <span>
              <History size={13} /> Recent Searches
            </span>
            <button
              type="button"
              className="search-clear-all-btn"
              onClick={onClearHistory}
            >
              Clear all
            </button>
          </div>
          <ul className="search-suggestions-list" role="listbox">
            {history.map((item, idx) => {
              const isActive = activeIndex === idx;
              return (
                <li
                  key={`${item.query}-${idx}`}
                  className={`search-suggestion-item search-history-item ${isActive ? "active" : ""}`}
                  onClick={() => onSelectQuery(item.query)}
                  role="option"
                  aria-selected={isActive}
                >
                  <div className="search-suggestion-main">
                    <span className="search-suggestion-icon">
                      <History size={15} />
                    </span>
                    <span className="search-suggestion-text">{item.query}</span>
                    {item.type && (
                      <span className="search-suggestion-type-badge">
                        {item.type}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="search-remove-btn"
                    title="Remove from history"
                    onClick={(e) => onRemoveHistory(item.query, e)}
                  >
                    <X size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {isQueryMode && (
        <>
          {person && (
            <div className="search-person-suggestion-section">
              <div
                className={`search-person-card ${activeIndex === -2 ? "active" : ""}`}
                onClick={() => {
                  if (onSelectPerson) {
                    onSelectPerson(person);
                  } else {
                    onSelectQuery(person.name);
                  }
                }}
                role="button"
                tabIndex={0}
                title={`Browse ${person.name}'s filmography`}
              >
                <div className="search-person-avatar-wrapper">
                  {person.image ? (
                    <img
                      src={person.image}
                      alt={person.name}
                      className="search-person-avatar"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src =
                          "/images/image-404.png";
                      }}
                    />
                  ) : (
                    <div className="search-person-avatar-fallback">
                      <User size={20} />
                    </div>
                  )}
                </div>

                <div className="search-person-info">
                  <div className="search-person-name-row">
                    <span className="search-person-name">
                      {renderHighlighted(person.name, searchQuery)}
                    </span>
                    <span className="search-person-dept-badge">
                      {person.department || "Cast & Crew"}
                    </span>
                  </div>
                  <div className="search-person-meta-row">
                    {person.creditCount != null && person.creditCount > 0 && (
                      <span className="search-person-credits-badge">
                        <Clapperboard size={12} /> {person.creditCount} Credits
                      </span>
                    )}
                    {person.biography && (
                      <span className="search-person-bio">{person.biography}</span>
                    )}
                  </div>
                </div>

                <div className="search-person-action">
                  <span className="search-person-action-label">Filmography</span>
                  <ChevronRight size={16} />
                </div>
              </div>
            </div>
          )}

          <div className="search-suggestions-header">
            <span>
              <Search size={13} /> Quick Results (Click to view details directly)
            </span>
          </div>
          {isLoadingSuggestions ? (
            <div className="search-suggestions-loading">
              <Loader2 size={18} className="spin" color="var(--accent)" />
              <span>Finding matching titles...</span>
            </div>
          ) : suggestions.length === 0 ? (
            <div className="search-suggestions-loading">
              <span>Press enter to search "{searchQuery}"</span>
            </div>
          ) : (
            <ul className="search-suggestions-list search-rich-cards-list" role="listbox">
              {suggestions.map((item, idx) => {
                const isActive = activeIndex === idx;
                const formattedType =
                  (item.type || "").toLowerCase() === "tv"
                    ? "TV Series"
                    : (item.type || "").toLowerCase() === "movie"
                      ? "Movie"
                      : item.type || "Title";

                return (
                  <li
                    key={`${item.title}-${idx}`}
                    className={`search-suggestion-card ${isActive ? "active" : ""}`}
                    onClick={() => {
                      if (onSelectSuggestion) {
                        onSelectSuggestion(item);
                      } else {
                        onSelectQuery(item.title);
                      }
                    }}
                    role="option"
                    aria-selected={isActive}
                    title={`Open ${item.title} details`}
                  >
                    <div className="search-card-poster-wrapper">
                      {item.image ? (
                        <img
                          src={item.image}
                          alt={item.title}
                          className="search-card-poster"
                          loading="lazy"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src =
                              "/images/image-404.png";
                          }}
                        />
                      ) : (
                        <div className="search-card-poster-fallback">
                          {getMediaIcon(item.type)}
                        </div>
                      )}
                    </div>

                    <div className="search-card-content">
                      <div className="search-card-title-row">
                        <span className="search-card-title">
                          {renderHighlighted(item.title, searchQuery)}
                        </span>
                        {item.rating != null && (
                          <span className="search-card-rating">
                            <Star size={11} fill="#f1e05a" stroke="#f1e05a" />
                            {item.rating}
                          </span>
                        )}
                      </div>

                      <div className="search-card-meta-row">
                        <span className="search-card-badge">{formattedType}</span>
                        {item.year && (
                          <span className="search-card-year">{item.year}</span>
                        )}
                        {Array.isArray(item.genres) && item.genres.length > 0 && (
                          <span className="search-card-genre">
                            {item.genres.join(" • ")}
                          </span>
                        )}
                      </div>

                      {item.overview && (
                        <p className="search-card-overview">{item.overview}</p>
                      )}
                    </div>

                    <div className="search-card-action">
                      <span className="search-card-action-text">Details</span>
                      <ChevronRight size={16} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
};
