import { type ReactNode, useCallback, useEffect, useState } from "react";
import { fetchJson, postNoContent } from "./api/client";
import { DateField } from "./components/DateField";
import { RefreshMenu } from "./components/RefreshMenu";
import { EventDetailsScreen } from "./screens/EventDetailsScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { JobAuditScreen } from "./screens/JobAuditScreen";
import { ReplayAuditScreen } from "./screens/ReplayAuditScreen";
import type { DayMode, EventCatalogItem, LatencyMetric, ScreenMode, ThemeMode } from "./types";
import { toLocalDayString } from "./utils/date";
import { isAbortError } from "./utils/errors";
import { getInitialLatencyMetric, LATENCY_METRIC_STORAGE_KEY } from "./utils/latency";
import { resolveCatalogEntry } from "./utils/search";
import { getInitialTheme, THEME_STORAGE_KEY } from "./utils/theme";

const navItems = [
  { id: "home", label: "Dashboard", icon: "dashboard", screen: "home" as ScreenMode },
  { id: "event", label: "Events Log", icon: "list", screen: "event" as ScreenMode },
  { id: "replay", label: "Replay Audit", icon: "history", screen: "replay" as ScreenMode },
  { id: "jobs", label: "Job Audit", icon: "fact_check", screen: "jobs" as ScreenMode },
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
  const headerTitle =
    screen === "event"
      ? activeMeta.name
      : screen === "replay"
      ? "Replay Audit"
      : screen === "jobs"
      ? "Job Audit"
      : "Dashboard";
  const headerSub =
    screen === "event"
      ? "Events Log"
      : screen === "replay"
      ? "Replay Audit Trail"
      : screen === "jobs"
      ? "Housekeeping Tracker"
      : "Global Aggregation";

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

  useEffect(() => {
    if (screen !== "event") {
      setEventHeaderControls(null);
    }
  }, [screen]);

  const headerControlsNode =
    screen === "event" ? eventHeaderControls : screen === "home" ? homeHeaderControls : null;

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
          ) : screen === "event" ? (
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
          ) : screen === "jobs" ? (
            <JobAuditScreen eventCatalog={eventCatalog} />
          ) : (
            <ReplayAuditScreen />
          )}
        </div>
      </main>
    </div>
  );
}
