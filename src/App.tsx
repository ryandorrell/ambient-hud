import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./App.css";

/* ── Types ────────────────────────────────────────── */

interface WeatherData {
  tempF?: number;
  humidity?: number;
  feelsLike?: number;
  dewPoint?: number;
  tempInF?: number;
  humidityIn?: number;
  windSpeedMph?: number;
  windGustMph?: number;
  windDir?: number;
  windDirAvg10m?: number;
  maxDailyGust?: number;
  baromRelIn?: number;
  baromAbsIn?: number;
  hourlyRainIn?: number;
  dailyRainIn?: number;
  weeklyRainIn?: number;
  monthlyRainIn?: number;
  yearlyRainIn?: number;
  eventRainIn?: number;
  uv?: number;
  solarRadiation?: number;
  battOut?: number;
  battIn?: number;
  dateUtc?: number;
  date?: string;
}

interface StationPayload {
  station_name: string;
  location: string;
  mac_address: string;
  lat?: number;
  lon?: number;
  data: WeatherData;
  raw_keys: string[];
}

/* ── Helpers ──────────────────────────────────────── */

function degToCompass(deg: number): string {
  const dirs = [
    "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
    "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
  ];
  return dirs[Math.round(deg / 22.5) % 16];
}

function fmt(val: number | undefined, decimals = 1): string {
  if (val === undefined || val === null) return "---";
  return val.toFixed(decimals);
}

function uvLabel(uv: number): { label: string; color: string } {
  if (uv <= 2) return { label: "LOW", color: "#00ff88" };
  if (uv <= 5) return { label: "MODERATE", color: "#ffdd00" };
  if (uv <= 7) return { label: "HIGH", color: "#ff8800" };
  if (uv <= 10) return { label: "VERY HIGH", color: "#ff2200" };
  return { label: "EXTREME", color: "#cc00ff" };
}

function pressureTrend(val: number | undefined): string {
  if (!val) return "";
  if (val > 30.2) return "HIGH";
  if (val < 29.8) return "LOW";
  return "NORMAL";
}

/* ── Config Screen ────────────────────────────────── */

function ConfigScreen({
  onConnect,
}: {
  onConnect: (apiKey: string, appKey: string) => void;
}) {
  const [apiKey, setApiKey] = useState(
    () => localStorage.getItem("ambient_api_key") || ""
  );
  const [appKey, setAppKey] = useState(
    () => localStorage.getItem("ambient_app_key") || ""
  );

  const handleConnect = () => {
    if (apiKey.trim() && appKey.trim()) {
      localStorage.setItem("ambient_api_key", apiKey.trim());
      localStorage.setItem("ambient_app_key", appKey.trim());
      onConnect(apiKey.trim(), appKey.trim());
    }
  };

  return (
    <div className="config-screen">
      <div className="config-box">
        <div className="config-title">
          <span className="bracket">[</span> AMBIENT HUD{" "}
          <span className="bracket">]</span>
        </div>
        <div className="config-subtitle">STATION LINK REQUIRED</div>
        <div className="config-field">
          <label>API KEY</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Enter your Ambient Weather API key"
            spellCheck={false}
          />
        </div>
        <div className="config-field">
          <label>APPLICATION KEY</label>
          <input
            type="password"
            value={appKey}
            onChange={(e) => setAppKey(e.target.value)}
            placeholder="Enter your application key"
            spellCheck={false}
          />
        </div>
        <button className="connect-btn" onClick={handleConnect}>
          <span className="btn-icon">▶</span> ESTABLISH LINK
        </button>
        <div className="config-hint">
          Generate keys at{" "}
          <span className="cyan">ambientweather.net/account</span>
        </div>
      </div>
      <ScanLines />
    </div>
  );
}

/* ── Scan Lines Overlay ───────────────────────────── */

function ScanLines() {
  return <div className="scanlines" />;
}

/* ── Radar Map ────────────────────────────────────── */

interface RainViewerFrame {
  time: number;
  path: string;
  nowcast?: boolean;
}

function RadarMap({ lat, lon }: { lat: number; lon: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const radarLayerRef = useRef<L.TileLayer | null>(null);
  const framesRef = useRef<RainViewerFrame[]>([]);
  const frameIdxRef = useRef(0);
  const animTimerRef = useRef<ReturnType<typeof setInterval>>();
  const [frameTime, setFrameTime] = useState<Date | null>(null);
  const [isNowcast, setIsNowcast] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [lat, lon],
      zoom: 7,
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: false,
    });

    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      { subdomains: "abcd", maxZoom: 19 }
    ).addTo(map);

    // Station marker
    L.circleMarker([lat, lon], {
      radius: 5,
      color: "#00e5ff",
      fillColor: "#00e5ff",
      fillOpacity: 0.9,
      weight: 2,
    }).addTo(map);

    mapRef.current = map;

    async function loadRadar() {
      try {
        const res = await fetch("https://api.rainviewer.com/public/weather-maps.json");
        const json = await res.json();
        const past: RainViewerFrame[] = (json.radar?.past ?? []).map((f: RainViewerFrame) => ({ ...f, nowcast: false }));
        const nowcast: RainViewerFrame[] = (json.radar?.nowcast ?? []).map((f: RainViewerFrame) => ({ ...f, nowcast: true }));
        const frames = [...past, ...nowcast];
        if (!frames.length) return;
        framesRef.current = frames;
        frameIdxRef.current = frames.length - 1;

        const showFrame = (idx: number) => {
          const prev = radarLayerRef.current;
          const f = frames[idx];
          const next = L.tileLayer(
            `https://tilecache.rainviewer.com${f.path}/256/{z}/{x}/{y}/2/1_1.png`,
            { opacity: 0.7, maxZoom: 19 }
          ).addTo(map);
          next.once("load", () => {
            if (prev) map.removeLayer(prev);
          });
          radarLayerRef.current = next;
          setFrameTime(new Date(f.time * 1000));
          setIsNowcast(!!f.nowcast);
        };

        showFrame(frameIdxRef.current);

        animTimerRef.current = setInterval(() => {
          frameIdxRef.current = (frameIdxRef.current + 1) % frames.length;
          showFrame(frameIdxRef.current);
        }, 4500);
      } catch (_) {}
    }

    loadRadar();
    const refreshTimer = setInterval(loadRadar, 5 * 60 * 1000);

    return () => {
      clearInterval(animTimerRef.current);
      clearInterval(refreshTimer);
      map.remove();
      mapRef.current = null;
    };
  }, [lat, lon]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={containerRef} className="radar-map" />
      {frameTime && (
        <div className="radar-timestamp">
          {frameTime.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}
          {" · "}
          {frameTime.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          {isNowcast && <span className="radar-nowcast"> FCST</span>}
        </div>
      )}
    </div>
  );
}

/* ── Wind Compass ─────────────────────────────────── */

function WindCompass({
  dir,
  speed,
  gust,
}: {
  dir?: number;
  speed?: number;
  gust?: number;
}) {
  const angle = dir ?? 0;
  return (
    <div className="compass-container">
      <svg viewBox="0 0 120 120" className="compass-svg">
        {/* Outer ring */}
        <circle
          cx="60"
          cy="60"
          r="55"
          fill="none"
          stroke="var(--cyan-dim)"
          strokeWidth="1"
        />
        <circle
          cx="60"
          cy="60"
          r="45"
          fill="none"
          stroke="var(--cyan-dim)"
          strokeWidth="0.5"
          strokeDasharray="2 4"
        />
        {/* Cardinal markers */}
        {[0, 90, 180, 270].map((d) => {
          const rad = ((d - 90) * Math.PI) / 180;
          const labels = ["N", "E", "S", "W"];
          return (
            <text
              key={d}
              x={60 + 50 * Math.cos(rad)}
              y={60 + 50 * Math.sin(rad) + 3}
              textAnchor="middle"
              className="compass-label"
              fill={d === 0 ? "var(--cyan)" : "var(--cyan-dim)"}
            >
              {labels[d / 90]}
            </text>
          );
        })}
        {/* Tick marks */}
        {Array.from({ length: 36 }).map((_, i) => {
          const deg = i * 10;
          const rad = ((deg - 90) * Math.PI) / 180;
          const r1 = deg % 90 === 0 ? 38 : deg % 30 === 0 ? 40 : 42;
          return (
            <line
              key={deg}
              x1={60 + r1 * Math.cos(rad)}
              y1={60 + r1 * Math.sin(rad)}
              x2={60 + 44 * Math.cos(rad)}
              y2={60 + 44 * Math.sin(rad)}
              stroke="var(--cyan-dim)"
              strokeWidth={deg % 90 === 0 ? 1.5 : 0.5}
            />
          );
        })}
        {/* Wind direction arrow */}
        <g
          transform={`rotate(${angle}, 60, 60)`}
          className="wind-arrow"
        >
          <polygon
            points="60,18 55,40 60,35 65,40"
            fill="var(--cyan)"
            opacity="0.9"
          />
          <line
            x1="60"
            y1="35"
            x2="60"
            y2="85"
            stroke="var(--cyan)"
            strokeWidth="1.5"
            opacity="0.4"
          />
        </g>
        {/* Center dot */}
        <circle cx="60" cy="60" r="2" fill="var(--cyan)" />
      </svg>
      <div className="compass-readout">
        <span className="compass-deg">{angle.toFixed(0)}°</span>
        <span className="compass-dir">
          {dir !== undefined ? degToCompass(dir) : "---"}
        </span>
      </div>
    </div>
  );
}

/* ── HUD Panel ────────────────────────────────────── */

function Panel({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`panel ${className}`}>
      <div className="panel-header">
        <span className="panel-dot" />
        <span className="panel-title">{title}</span>
        <span className="panel-line" />
      </div>
      <div className="panel-body">{children}</div>
    </div>
  );
}

/* ── Main HUD App ─────────────────────────────────── */

const REFRESH_INTERVAL = 15_000; // 15 seconds

export default function App() {
  const [apiKey, setApiKey] = useState<string | null>(
    () => localStorage.getItem("ambient_api_key")
  );
  const [appKey, setAppKey] = useState<string | null>(
    () => localStorage.getItem("ambient_app_key")
  );
  const [station, setStation] = useState<StationPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [clock, setClock] = useState(new Date());
  const tickRef = useRef<ReturnType<typeof setInterval>>();

  // Clock tick
  useEffect(() => {
    tickRef.current = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(tickRef.current);
  }, []);

  const fetchData = useCallback(async () => {
    if (!apiKey || !appKey) return;
    try {
      const result = await invoke<StationPayload>("fetch_weather", {
        apiKey,
        appKey,
      });
      setStation(result);
      setError(null);
      setLastFetch(new Date());
      setIsLive(true);
    } catch (e: any) {
      setError(typeof e === "string" ? e : e.message || "Unknown error");
      setIsLive(false);
    }
  }, [apiKey, appKey]);

  // Initial fetch + interval
  useEffect(() => {
    if (!apiKey || !appKey) return;
    fetchData();
    const id = setInterval(fetchData, REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [fetchData, apiKey, appKey]);

  const handleConnect = (ak: string, apk: string) => {
    setApiKey(ak);
    setAppKey(apk);
  };

  const handleDisconnect = () => {
    localStorage.removeItem("ambient_api_key");
    localStorage.removeItem("ambient_app_key");
    setApiKey(null);
    setAppKey(null);
    setStation(null);
    setIsLive(false);
  };

  // Show config if no keys
  if (!apiKey || !appKey) {
    return <ConfigScreen onConnect={handleConnect} />;
  }

  const d = station?.data;
  const uvInfo = d?.uv !== undefined ? uvLabel(d.uv) : null;
  const pTrend = pressureTrend(d?.baromRelIn);

  return (
    <div className="hud-root">
      <ScanLines />

      {/* ── Top Bar ──────────────── */}
      <header className="topbar">
        <div className="topbar-left">
          <span className="hud-logo">◆ AMBIENT HUD</span>
          <span className="station-name">
            // {station?.station_name || "CONNECTING..."}
          </span>
        </div>
        <div className="topbar-right">
          <span className={`live-badge ${isLive ? "live" : "offline"}`}>
            <span className="live-dot" />
            {isLive ? "LIVE" : "OFFLINE"}
          </span>
          <span className="clock">
            {clock.toLocaleTimeString("en-US", { hour12: false })}
          </span>
          <button className="disconnect-btn" onClick={handleDisconnect} title="Disconnect">
            ✕
          </button>
        </div>
      </header>

      {/* ── Error Banner ─────────── */}
      {error && (
        <div className="error-banner">
          ⚠ LINK ERROR: {error}
        </div>
      )}

      {/* ── Main Grid ────────────── */}
      <main className="hud-grid">
        {/* Row 1: Core weather */}
        <Panel title="TEMPERATURE" className="panel-temp">
          <div className="big-value">
            {fmt(d?.tempF)}
            <span className="unit">°F</span>
          </div>
          <div className="sub-row">
            <span className="sub-label">DEW PT</span>
            <span className="sub-value">{fmt(d?.dewPoint)}°</span>
          </div>
        </Panel>

        <Panel title="FEELS LIKE" className="panel-feels">
          <div className="big-value secondary">
            {fmt(d?.feelsLike)}
            <span className="unit">°F</span>
          </div>
          <div className="sub-row">
            <span className="sub-label">HEAT IDX</span>
            <span className="sub-value">
              {d?.feelsLike && d?.tempF
                ? (d.feelsLike > d.tempF ? "▲" : d.feelsLike < d.tempF ? "▼" : "═")
                : "---"}
            </span>
          </div>
        </Panel>

        <Panel title="HUMIDITY" className="panel-humid">
          <div className="big-value">
            {fmt(d?.humidity, 0)}
            <span className="unit">%</span>
          </div>
          <div className="humidity-bar">
            <div
              className="humidity-fill"
              style={{ width: `${d?.humidity ?? 0}%` }}
            />
          </div>
        </Panel>

        <Panel title="WIND" className="panel-wind">
          <div className="wind-layout">
            <WindCompass dir={d?.windDir} speed={d?.windSpeedMph} gust={d?.windGustMph} />
            <div className="wind-bottom">
              <div className="wind-speed">
                <span className="wind-val">{fmt(d?.windSpeedMph)}</span>
                <span className="wind-unit">MPH</span>
              </div>
              <div className="wind-gusts">
                <div className="wind-detail">
                  <span className="sub-label">GUST</span>
                  <span className="sub-value">{fmt(d?.windGustMph)}</span>
                </div>
                <div className="wind-detail">
                  <span className="sub-label">MAX</span>
                  <span className="sub-value">{fmt(d?.maxDailyGust)}</span>
                </div>
              </div>
            </div>
          </div>
        </Panel>

        {/* Row 2: Pressure + Rain */}
        <Panel title="BAROMETER" className="panel-baro">
          <div className="big-value">
            {fmt(d?.baromRelIn, 2)}
            <span className="unit">inHg</span>
          </div>
          <div className="sub-row">
            <span className="sub-label">ABS</span>
            <span className="sub-value">{fmt(d?.baromAbsIn, 2)} inHg</span>
          </div>
          {pTrend && (
            <div className={`pressure-tag tag-${pTrend.toLowerCase()}`}>
              {pTrend}
            </div>
          )}
        </Panel>

        <Panel title="PRECIPITATION" className="panel-rain">
          <div className="rain-grid">
            <div className="rain-cell">
              <span className="rain-label">TODAY</span>
              <span className="rain-val">{fmt(d?.dailyRainIn, 2)}"</span>
            </div>
            <div className="rain-cell">
              <span className="rain-label">WEEK</span>
              <span className="rain-val">{fmt(d?.weeklyRainIn, 2)}"</span>
            </div>
          </div>
        </Panel>

        {/* Radar: col 3-4, rows 2-3 */}
        <div className="panel panel-radar">
          <div className="panel-header">
            <span className="panel-dot" />
            <span className="panel-title">RADAR</span>
            <span className="panel-line" />
          </div>
          <div className="radar-body">
            <RadarMap lat={28.300479} lon={-82.223837} />
          </div>
        </div>

        {/* Row 3: UV/Solar + Indoor */}
        <Panel title="UV / SOLAR" className="panel-uv">
          <div className="uv-row">
            <div className="uv-index">
              <span
                className="big-value"
                style={{ color: uvInfo?.color || "var(--cyan)" }}
              >
                {d?.uv !== undefined ? d.uv.toFixed(0) : "---"}
              </span>
              {uvInfo && (
                <span className="uv-tag" style={{ borderColor: uvInfo.color, color: uvInfo.color }}>
                  {uvInfo.label}
                </span>
              )}
            </div>
            <div className="solar-block">
              <span className="sub-label">SOLAR RAD</span>
              <span className="solar-val">
                {fmt(d?.solarRadiation, 0)}
                <span className="unit"> W/m²</span>
              </span>
            </div>
          </div>
        </Panel>

        <Panel title="INDOOR" className="panel-indoor">
          <div className="indoor-row">
            <div>
              <span className="sub-label">TEMP</span>
              <span className="indoor-val">
                {fmt(d?.tempInF)}
                <span className="unit">°F</span>
              </span>
            </div>
            <div>
              <span className="sub-label">HUMIDITY</span>
              <span className="indoor-val">
                {fmt(d?.humidityIn, 0)}
                <span className="unit">%</span>
              </span>
            </div>
          </div>
        </Panel>
      </main>

      {/* ── Footer ───────────────── */}
      <footer className="hud-footer">
        <span className={`batt-indicator ${d?.battOut !== undefined && d.battOut !== 1 ? "batt-low" : ""}`}>
          BATT: {d?.battOut !== undefined ? (d.battOut === 1 ? "● OK" : "○ LOW") : "---"}
        </span>
        <span>
          LAST UPDATE:{" "}
          {lastFetch
            ? lastFetch.toLocaleTimeString("en-US", { hour12: false })
            : "---"}
        </span>
        <span>
          {station?.location || "---"} // {station?.mac_address || "---"}
        </span>
        <span>REFRESH: {REFRESH_INTERVAL / 1_000}s</span>
      </footer>
    </div>
  );
}
