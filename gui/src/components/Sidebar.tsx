import React from "react";
import "./css/Sidebar.css";
import {
  Search,
  Library,
  SlidersHorizontal,
  Download,
  Terminal,
  Settings,
  ShoppingBag,
  ChevronLeft,
  ChevronRight,
  Video,
  LucideIcon,
} from "lucide-react";

export interface SidebarProps {
  currentView: string;
  setView: (view: string) => void;
  isCollapsed: boolean;
  toggleCollapse: () => void;
  developerMode?: boolean;
}

interface MenuItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

export default function Sidebar({
  currentView,
  setView,
  isCollapsed,
  toggleCollapse,
  developerMode = false,
}: SidebarProps): React.JSX.Element {
  const menuItems: MenuItem[] = [
    { id: "home", label: "Home", icon: Library },
    { id: "discover", label: "Discover", icon: Search },
    { id: "filters", label: "Filters", icon: SlidersHorizontal },
    { id: "downloads", label: "Downloads", icon: Download },
    { id: "webmedia", label: "Web Downloader", icon: Video },
    { id: "marketplace", label: "Extensions", icon: ShoppingBag },
    { id: "logs", label: "Logs", icon: Terminal },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  const filteredMenuItems = menuItems.filter((item) => {
    if (item.id === "logs") {
      return developerMode;
    }
    return true;
  });

  const settingsItem = filteredMenuItems.find((item) => item.id === "settings");
  const mainItems = filteredMenuItems.filter((item) => item.id !== "settings");

  return (
    <aside className={`sidebar ${isCollapsed ? "collapsed" : ""}`}>
      <div className="sidebar-header">
        <div className="sidebar-logo-wrapper">
          <img
            src="/images/logo.png"
            alt="Airbox"
            className="sidebar-logo-img"
          />
          {!isCollapsed && (
            <span className="sidebar-logo-text">Airbox</span>
          )}
        </div>
        <button
          onClick={toggleCollapse}
          className="sidebar-toggle-btn"
          title={isCollapsed ? "Expand Menu" : "Collapse Menu"}
        >
          {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      <nav className="sidebar-nav">
        {mainItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;

          return (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              className={`sidebar-item ${isActive ? "active" : ""}`}
              title={item.label}
            >
              <Icon
                size={22}
                color={
                  isActive
                    ? "var(--sidebar-active-color, var(--accent))"
                    : "#9ca3af"
                }
              />
            </button>
          );
        })}
      </nav>

      {settingsItem &&
        (() => {
          const Icon = settingsItem.icon;
          const isActive = currentView === settingsItem.id;
          return (
            <div className="sidebar-footer">
              <button
                onClick={() => setView(settingsItem.id)}
                className={`sidebar-item ${isActive ? "active" : ""}`}
                title={settingsItem.label}
              >
                <Icon
                  size={22}
                  color={
                    isActive
                      ? "var(--sidebar-active-color, var(--accent))"
                      : "#9ca3af"
                  }
                />
              </button>
            </div>
          );
        })()}
    </aside>
  );
}
