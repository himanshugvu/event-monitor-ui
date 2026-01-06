import { type ReactNode, useCallback, useEffect, useState } from "react";
import { fetchJson, postNoContent } from "./api/client";
import { DateField } from "./components/DateField";
import { RefreshMenu } from "./components/RefreshMenu";
import { EventDetailsScreen } from "./screens/EventDetailsScreen";
import { HomeScreen } from "./screens/HomeScreen";
import type { DayMode, EventCatalogItem, LatencyMetric, ScreenMode, ThemeMode } from "./types";
import { toLocalDayString } from "./utils/date";
import { isAbortError } from "./utils/errors";
import { getInitialLatencyMetric, LATENCY_METRIC_STORAGE_KEY } from "./utils/latency";
import { resolveCatalogEntry } from "./utils/search";
import { getInitialTheme, THEME_STORAGE_KEY } from "./utils/theme";

const navItems = [
  { id: "home", label: "Global Aggregation", icon: "dashboard", screen: "home" as ScreenMode },
  { id: "event", label: "Events Log", icon: "list", screen: "event" as ScreenMode },
  { id: "failures", label: "Failure Analysis", icon: "bug_report", screen: "event" as ScreenMode },
];

export default function App() {
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);
  const [latencyMetric, setLatencyMetric] = useState<LatencyMetric>(getInitialLatencyMetric);
  const [screen, setScreen] = useState<ScreenMode>("home");
  const [activeNav, setActiveNav] = useState("home");
  const [eventHeaderControls, setEventHeaderControls] = useState<ReactNode>(null);
  const [homeRefreshIndex, setHomeRefreshIndex] = useState(0);
  const [homeForceRefreshToken, setHomeForceRefreshToken] = useState(0);
  const [homeForceRefreshError, setHomeForceRefreshError] = useState<string | null>(null);
  const [dayMode, setDayMode] = useState<DayMode>("today");
  const [day, setDay] = useState(() => toLocalDayString(new Date()));
  const [eventCatalog, setEventCatalog] = useState<EventCatalogItem[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<string>("");
  const activeMeta = resolveCatalogEntry(selectedEvent, eventCatalog);
  const headerTitle = screen === "home" ? "Global Event Aggregation" : activeMeta.name;
  const headerSub = screen === "home" ? "" : "Events Log";

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem(LATENCY_METRIC_STORAGE_KEY, latencyMetric);
  }, [latencyMetric]);

  const cycleLatencyMetric = useCallback(() => {
    setLatencyMetric((current) => {
      if (current === "p95") {
        return "p99";
      }
      if (current === "p99") {
        return "max";
      }
      return "p95";
    });
  }, []);

  const handleHomeRefresh = useCallback(() => {
    setHomeRefreshIndex((value) => value + 1);
  }, []);

  const handleHomeForceRefresh = useCallback(() => {
    setHomeForceRefreshError(null);
    postNoContent("/api/v1/refresh/home")
      .then(() => {
        setHomeForceRefreshToken(Date.now());
      })
      .catch((error) => {
        console.error("Home force refresh failed", error);
        setHomeForceRefreshError(error instanceof Error ? error.message : String(error));
      });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setCatalogError(null);
    fetchJson<EventCatalogItem[]>("/api/v1/events", controller.signal)
      .then((data) => {
        setEventCatalog(data ?? []);
      })
      .catch((error) => {
        if (!isAbortError(error)) {
          setCatalogError(error instanceof Error ? error.message : String(error));
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!selectedEvent && eventCatalog.length > 0) {
      setSelectedEvent(eventCatalog[0].eventKey);
    }
  }, [selectedEvent, eventCatalog]);

  useEffect(() => {
    if (dayMode === "today") {
      setDay(toLocalDayString(new Date()));
    } else if (dayMode === "yesterday") {
      setDay(toLocalDayString(new Date(Date.now() - 24 * 60 * 60 * 1000)));
    }
  }, [dayMode]);

  const homeHeaderControls =
    screen === "home" ? (
      <div className="control-row header-control-row">
        <div className="day-toggle">
          <span className="day-label">Day:</span>
          <div className="segmented">
            <button
              className={dayMode === "today" ? "segment active" : "segment"}
              onClick={() => setDayMode("today")}
              type="button"
            >
              Today
            </button>
            <button
              className={dayMode === "yesterday" ? "segment active" : "segment"}
              onClick={() => setDayMode("yesterday")}
              type="button"
            >
              Yesterday
            </button>
          </div>
          <DateField day={day} onDayChange={setDay} onDayModeChange={setDayMode} />
        </div>
        <RefreshMenu onRefresh={handleHomeRefresh} onHardRefresh={handleHomeForceRefresh} />
      </div>
    ) : null;

  const headerControlsNode = screen === "event" ? eventHeaderControls : homeHeaderControls;

  return (
    <div className="layout auto-sidebar">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-badge">
            <span className="material-symbols-outlined">monitor_heart</span>
          </div>
          <span className="sidebar-text">EventMonitor</span>
        </div>
        <nav className="sidebar-nav">
          {navItems.map((item) => {
            const isActive = item.id === activeNav;
            return (
              <button
                key={item.id}
                className={isActive ? "sidebar-link active" : "sidebar-link"}
                onClick={() => {
                  if (item.screen) {
                    setScreen(item.screen);
                    setActiveNav(item.id);
                  }
                }}
                aria-current={isActive ? "page" : undefined}
                type="button"
                title={item.label}
              >
                <span className="material-symbols-outlined">{item.icon}</span>
                <span className="sidebar-text">{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <div className="avatar-circle">
            <span className="material-symbols-outlined">person</span>
          </div>
          <div className="sidebar-meta">
            <div className="sidebar-user">Admin User</div>
            <div className="sidebar-email">admin@eventflow.com</div>
          </div>
        </div>
      </aside>
      <main className="main">
        <header className={screen === "event" ? "top-header event-header" : "top-header"}>
          <div className="header-left">
            <div className="header-title">
              {screen === "event" ? (
                <div className="header-breadcrumbs">
                  <button
                    className="header-link"
                    type="button"
                    onClick={() => {
                      setScreen("home");
                      setActiveNav("home");
                    }}
                  >
                    Dashboard
                  </button>
                  <span>/</span>
                  <span>{headerTitle}</span>
                </div>
              ) : (
                <h1>{headerTitle}</h1>
              )}
              {screen === "event" && <span className="badge header-badge">Live View</span>}
            </div>
            {screen !== "event" && headerSub && (
              <>
                <span className="header-sep">/</span>
                <span className="header-sub">{headerSub}</span>
              </>
            )}
          </div>
          {headerControlsNode ? <div className="header-controls">{headerControlsNode}</div> : null}
          <div className="header-actions">
            <button
              className="icon-button"
              aria-label="Toggle theme"
              onClick={() => setTheme((mode) => (mode === "light" ? "dark" : "light"))}
            >
              <span className="material-symbols-outlined">
                {theme === "light" ? "dark_mode" : "light_mode"}
              </span>
            </button>
          </div>
        </header>
        <div className="content">
          {catalogError && (
            <div className="banner error">Failed to load event list: {catalogError}</div>
          )}
          {screen === "home" ? (
            <HomeScreen
              day={day}
              refreshIndex={homeRefreshIndex}
              forceRefreshToken={homeForceRefreshToken}
              forceRefreshError={homeForceRefreshError}
              latencyMetric={latencyMetric}
              onLatencyMetricToggle={cycleLatencyMetric}
              onOpenEvent={(eventKey) => {
                setSelectedEvent(eventKey);
                setScreen("event");
                setActiveNav("event");
              }}
            />
          ) : (
            <EventDetailsScreen
              day={day}
              dayMode={dayMode}
              onDayModeChange={setDayMode}
              onDayChange={setDay}
              selectedEvent={selectedEvent}
              onSelectEvent={setSelectedEvent}
              eventCatalog={eventCatalog}
              latencyMetric={latencyMetric}
              onLatencyMetricToggle={cycleLatencyMetric}
              onHeaderControls={setEventHeaderControls}
            />
          )}
        </div>
      </main>
    </div>
  );
}
