import React, { useState, useEffect, useRef, useCallback } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import Dropdown from "../common/Dropdown";
import {
  SearchSuggestionsDropdown,
  TitleSuggestion,
  PersonSuggestion,
} from "./SearchSuggestionsDropdown";
import {
  getSearchHistory,
  addSearchHistory,
  removeSearchHistory,
  clearSearchHistory,
  SearchHistoryEntry,
} from "../../utils/searchHistory";

export interface CatalogHeaderProps {
  provider: string;
  type: string;
  discoverTab?: string;
  onSubTabChange?: (tab: string) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  onSearchSubmit: (e?: React.FormEvent, explicitQuery?: string) => void;
  onTypeChange?: (type: string) => void;
  showTypeToggle?: boolean;
  catalogSource?: string;
  isFilterOpen?: boolean;
  onToggleFilter?: () => void;
  activeFilterCount?: number;
  showFilterToggle?: boolean;
  linkingMalItem?: any;
  onCatalogSourceChange?: (source: string) => void;
  availableProviders?: any[];
  onSelectPerson?: (person: PersonSuggestion) => void;
  onSelectMedia?: (
    id: string | number,
    prov?: string,
    backText?: string,
    autoPlay?: boolean,
    targetNum?: number,
    targetSeason?: number,
    effectiveType?: string,
  ) => void;
}

export default function CatalogHeader({
  provider,
  type,
  discoverTab,
  onSubTabChange,
  searchQuery,
  onSearchQueryChange,
  onSearchSubmit,
  onTypeChange,
  showTypeToggle = true,
  catalogSource = "mal",
  isFilterOpen,
  onToggleFilter,
  activeFilterCount = 0,
  showFilterToggle = false,
  onSelectPerson,
  onSelectMedia,
}: CatalogHeaderProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [history, setHistory] = useState<SearchHistoryEntry[]>([]);
  const [suggestions, setSuggestions] = useState<TitleSuggestion[]>([]);
  const [person, setPerson] = useState<PersonSuggestion | null>(null);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const debounceTimerRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load search history when type changes or dropdown opens
  useEffect(() => {
    setHistory(getSearchHistory(type));
  }, [type]);

  // Debounced suggestions fetch
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setPerson(null);
      setIsLoadingSuggestions(false);
      setActiveIndex(-1);
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    setIsLoadingSuggestions(true);
    debounceTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/${type}/suggestions?q=${encodeURIComponent(trimmed)}`,
        );
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.suggestions)) {
            setSuggestions(data.suggestions);
          } else {
            setSuggestions([]);
          }
          if (data.person) {
            setPerson(data.person);
          } else {
            setPerson(null);
          }
        }
      } catch (_) {
        setSuggestions([]);
        setPerson(null);
      } finally {
        setIsLoadingSuggestions(false);
      }
    }, 220);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [searchQuery, type]);

  const handleInputFocus = () => {
    const currentHist = getSearchHistory(type);
    setHistory(currentHist);
    setIsDropdownOpen(true);
    setActiveIndex(-1);
  };

  const handleSelectQuery = useCallback(
    (query: string) => {
      onSearchQueryChange(query);
      const updated = addSearchHistory(query, type);
      setHistory(updated);
      setIsDropdownOpen(false);
      setActiveIndex(-1);
      if (onSearchSubmit) {
        onSearchSubmit(undefined, query);
      }
    },
    [onSearchQueryChange, onSearchSubmit, type],
  );

  const handleSelectSuggestion = useCallback(
    (item: TitleSuggestion) => {
      setIsDropdownOpen(false);
      setActiveIndex(-1);
      if (item.title) {
        const updated = addSearchHistory(item.title, type);
        setHistory(updated);
      }
      if (onSelectMedia && item.id) {
        const effectiveType =
          (item.type || "").toLowerCase() === "tv" ||
          (item.type || "").toLowerCase() === "movie" ||
          type === "Movies"
            ? "Movies"
            : type;
        onSelectMedia(
          item.id,
          "provider",
          "Discover",
          false,
          undefined,
          undefined,
          effectiveType,
        );
      } else if (onSearchSubmit && item.title) {
        onSearchQueryChange(item.title);
        onSearchSubmit(undefined, item.title);
      }
    },
    [onSelectMedia, onSearchSubmit, onSearchQueryChange, type],
  );

  const handleSelectPerson = useCallback(
    (p: PersonSuggestion) => {
      setIsDropdownOpen(false);
      setActiveIndex(-1);
      if (onSelectPerson) {
        onSelectPerson(p);
      } else if (onSearchSubmit) {
        onSearchQueryChange(p.name);
        onSearchSubmit(undefined, p.name);
      }
    },
    [onSelectPerson, onSearchSubmit, onSearchQueryChange],
  );

  const handleRemoveHistory = useCallback(
    (queryToRemove: string, e: React.MouseEvent) => {
      e.stopPropagation();
      const updated = removeSearchHistory(queryToRemove, type);
      setHistory(updated);
    },
    [type],
  );

  const handleClearHistory = useCallback(() => {
    clearSearchHistory(type);
    setHistory([]);
  }, [type]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const isQueryMode = searchQuery.trim().length >= 2;
    const totalItems = isQueryMode ? suggestions.length : history.length;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!isDropdownOpen) {
        setIsDropdownOpen(true);
        setActiveIndex(0);
      } else if (totalItems > 0) {
        setActiveIndex((prev) => (prev + 1) % totalItems);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (isDropdownOpen && totalItems > 0) {
        setActiveIndex((prev) => (prev - 1 + totalItems) % totalItems);
      }
    } else if (e.key === "Enter") {
      if (isDropdownOpen && activeIndex >= 0 && totalItems > 0) {
        e.preventDefault();
        const selectedQuery = isQueryMode
          ? suggestions[activeIndex]?.title
          : history[activeIndex]?.query;
        if (selectedQuery) {
          handleSelectQuery(selectedQuery);
        }
      } else {
        // Normal form submit
        if (searchQuery.trim()) {
          const updated = addSearchHistory(searchQuery.trim(), type);
          setHistory(updated);
        }
        setIsDropdownOpen(false);
      }
    } else if (e.key === "Escape") {
      setIsDropdownOpen(false);
      setActiveIndex(-1);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      const updated = addSearchHistory(searchQuery.trim(), type);
      setHistory(updated);
    }
    setIsDropdownOpen(false);
    if (onSearchSubmit) {
      onSearchSubmit(e);
    }
  };

  const typeOptions = [
    { value: "Movies", label: "Movies & Series" },
    { value: "Anime", label: "Anime" },
    { value: "Manga", label: "Manga" },
  ];

  return (
    <header className="catalog-header">
      <div className="header-left-section">
        <div className="header-title-group">
          {provider === "local" && <h1 className="catalog-title">Home</h1>}
          {provider === "provider" && (
            <h1 className="catalog-title">Discover</h1>
          )}
          {provider === "mal" && <h1 className="catalog-title">Filters</h1>}
          {provider === "provider" && type === "Anime" && (
            <div className="discover-sub-tabs">
              <button
                onClick={() => onSubTabChange && onSubTabChange("latest")}
                className={`discover-sub-tab ${discoverTab === "latest" ? "active" : ""}`}
              >
                Latest
              </button>
              <button
                onClick={() => onSubTabChange && onSubTabChange("calendar")}
                className={`discover-sub-tab ${discoverTab === "calendar" ? "active" : ""}`}
              >
                Airing Calendar
              </button>
            </div>
          )}
        </div>

        {showTypeToggle && (
          <div className="mobile-only">
            <Dropdown
              value={type}
              onChange={(val) => onTypeChange && onTypeChange(val)}
              options={typeOptions}
              className="header-type-dropdown"
              minWidth={140}
            />
          </div>
        )}
      </div>

      <div className="header-search-section">
        <div className="search-and-filter-wrapper">
          <div className="search-input-wrapper" style={{ position: "relative", flex: 1 }}>
            <form onSubmit={handleFormSubmit} className="search-form">
              <input
                ref={inputRef}
                type="text"
                placeholder={
                  provider === "mal" && catalogSource?.startsWith("unique:")
                    ? `Search unmapped ${type.toLowerCase()}...`
                    : type === "Movies"
                      ? "Search Movies & Series..."
                      : `Search ${type}...`
                }
                value={searchQuery}
                onFocus={handleInputFocus}
                onChange={(e) => onSearchQueryChange(e.target.value)}
                onKeyDown={handleKeyDown}
                className="search-input"
              />
              <button type="submit" className="btn-search">
                <Search size={18} />
              </button>
            </form>

            <SearchSuggestionsDropdown
              isOpen={isDropdownOpen}
              searchQuery={searchQuery}
              mediaType={type}
              history={history}
              suggestions={suggestions}
              person={person}
              isLoadingSuggestions={isLoadingSuggestions}
              activeIndex={activeIndex}
              onSelectQuery={handleSelectQuery}
              onSelectSuggestion={handleSelectSuggestion}
              onSelectPerson={handleSelectPerson}
              onRemoveHistory={handleRemoveHistory}
              onClearHistory={handleClearHistory}
              onClose={() => setIsDropdownOpen(false)}
            />
          </div>

          {showFilterToggle && onToggleFilter && (
            <button
              type="button"
              onClick={onToggleFilter}
              className={`catalog-filter-btn ${isFilterOpen ? "active" : ""} ${activeFilterCount > 0 ? "has-filters" : ""}`}
              title="Toggle filters panel"
            >
              <SlidersHorizontal size={16} />
              <span>Filters</span>
              {activeFilterCount > 0 && (
                <span className="filter-badge">{activeFilterCount}</span>
              )}
            </button>
          )}
        </div>
      </div>

      {showTypeToggle && (
        <div className="header-right-section desktop-only">
          <Dropdown
            value={type}
            onChange={(val) => onTypeChange && onTypeChange(val)}
            options={typeOptions}
            className="header-type-dropdown"
            minWidth={160}
          />
        </div>
      )}
    </header>
  );
}
