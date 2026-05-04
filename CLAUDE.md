# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Ambient HUD is a sci-fi styled desktop weather station for Ubuntu built with **Tauri 2 + React + TypeScript**. It connects to a personal weather station on the [Ambient Weather](https://ambientweather.net) network and displays real-time data in a cyan-on-dark HUD interface.

## Commands

```bash
# Install JS dependencies
npm install

# Run in development (hot-reload, opens native window)
npm run tauri dev

# Type-check only
npx tsc --noEmit

# Production build → produces .deb in src-tauri/target/release/bundle/deb/
npm run tauri build
```

First `tauri dev` compiles Rust (~2-3 minutes); subsequent runs are fast.

## Architecture

The app is split into two layers that communicate via Tauri's IPC:

**Rust backend (`src-tauri/src/lib.rs`)**
- Single Tauri command: `fetch_weather(api_key, app_key) → StationPayload`
- Makes an HTTPS request to `https://rt.ambientweather.net/v1/devices` using `reqwest`
- Deserializes the first device's `lastData` blob into `WeatherData` (all fields optional)
- Returns `StationPayload` (station name, location, MAC, data, raw_keys) to the frontend
- `raw_keys` is included for debugging — shows every field the API actually returned

**React frontend (`src/App.tsx`)**
- Calls `invoke("fetch_weather", { apiKey, appKey })` every `REFRESH_INTERVAL` (60s)
- API credentials are stored in `localStorage` (`ambient_api_key`, `ambient_app_key`)
- On first launch (no keys in localStorage), renders `<ConfigScreen>` instead of the HUD
- All weather fields are optional; `fmt()` renders `---` for undefined values

**Key data flow:** `localStorage keys → invoke() → Rust HTTP → Ambient Weather API → StationPayload → React state → HUD panels`

## Customization Points

| What | Where |
|---|---|
| Refresh interval | `REFRESH_INTERVAL` constant in `src/App.tsx` |
| Window size | `app.windows` in `src-tauri/tauri.conf.json` |
| Color palette | `:root` CSS variables at top of `src/App.css` |
| Multi-station selection | `fetch_weather` in `src-tauri/src/lib.rs` — currently takes `devices.into_iter().next()` |

## Tauri IPC Pattern

New backend commands follow this pattern in `lib.rs`:
```rust
#[tauri::command]
async fn my_command(param: String) -> Result<MyReturn, String> { ... }
```
Then register in `run()`:
```rust
.invoke_handler(tauri::generate_handler![fetch_weather, my_command])
```
And call from React:
```typescript
const result = await invoke<MyReturn>("my_command", { param: "value" });
```

## Ambient Weather API Notes

- Free tier: 1 request/second max — the 60s interval stays well within limits
- API endpoint: `GET https://rt.ambientweather.net/v1/devices?apiKey=...&applicationKey=...`
- Returns an array of devices; app uses only the first one
- All sensor fields in `lastData` are optional and snake_case on the wire; `WeatherData` maps them via `#[serde(rename)]`
