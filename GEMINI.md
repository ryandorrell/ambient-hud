# Project Instructions: Ambient HUD

Ambient HUD is a sci-fi styled desktop weather station built with **Tauri 2**, **React**, and **TypeScript**. It retrieves real-time weather data from the [Ambient Weather API](https://ambientweather.net) and displays it in a dark-themed, high-contrast HUD interface.

## Tech Stack
- **Frontend:** React 18 (TypeScript), Vite, Vanilla CSS.
- **Backend:** Rust (Tauri 2), `reqwest` for API calls, `serde` for JSON handling.
- **API:** Ambient Weather RT API (REST).

## Core Architecture & Patterns

### 1. Tauri IPC Bridge
The frontend communicates with the Rust backend via Tauri's `invoke` system.
- **Commands:** Defined in `src-tauri/src/lib.rs` using `#[tauri::command]`.
- **Frontend Calls:** Use `invoke` from `@tauri-apps/api/core` in `src/App.tsx`.
- **Registration:** All new commands must be added to the `.invoke_handler(tauri::generate_handler![...])` in `lib.rs`.

### 2. Data Flow
`LocalStorage (Keys)` -> `React (invoke)` -> `Rust (HTTP Request)` -> `Ambient API` -> `Rust (Deserialization)` -> `React (State Update)` -> `UI (Panels)`.

### 3. Styling & HUD Aesthetics
- **CSS Variables:** Standardized colors (cyan, red, yellow) are defined in `:root` within `src/App.css`. Use these for all UI elements to maintain the HUD theme.
- **Scanlines:** A global overlay `ScanLines` component provides the retro-CRT effect.
- **Panels:** The `Panel` component in `App.tsx` should be reused for all discrete data sections.

### 4. API Handling
- **Credentials:** `apiKey` and `appKey` are required and stored in `localStorage`.
- **Rate Limiting:** The default `REFRESH_INTERVAL` is 15 seconds. Avoid lowering this below 1 second to respect Ambient Weather's rate limits.
- **Error Handling:** Backend errors (network, parsing) are returned as `Result<T, String>` and displayed in an `error-banner` in the frontend.

## Development Workflows

### Setup & Run
```bash
# Install dependencies
npm install

# Run in development mode (with hot-reload)
npm run tauri dev
```

### Building for Production
```bash
# Produces platform-specific bundles (e.g., .deb for Linux)
npm run tauri build
```

### Code Standards
- **TypeScript:** Use interfaces for all data structures (see `WeatherData` in `App.tsx`).
- **Rust:** Use `serde(rename)` to map API snake_case fields to idiomatic Rust camelCase or snake_case struct fields as needed.
- **Testing:** (Add tests here once a testing framework is established).

## Key Files
- `src/App.tsx`: Main UI logic, state management, and HUD rendering.
- `src/App.css`: Core styling, HUD themes, and animations.
- `src-tauri/src/lib.rs`: Rust backend logic, API client, and Tauri command definitions.
- `src-tauri/tauri.conf.json`: App configuration, window settings, and security permissions.
