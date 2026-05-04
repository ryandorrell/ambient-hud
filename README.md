# ◆ Ambient HUD

A sci-fi styled desktop weather station display for Ubuntu, built with **Tauri 2 + React**. Connects to a personal weather station on the [Ambient Weather](https://ambientweather.net) network and displays real-time data in a cyan-on-dark HUD interface.

![Ambient HUD](docs/screenshot.png)

## Features

- **Real-time weather data** from your Ambient Weather station (60s auto-refresh)
- **HUD-style interface** with scan lines, glowing borders, and animated elements
- **Wind compass** with directional arrow and speed readouts
- **Full sensor coverage**: temperature, humidity, barometric pressure, wind, rain, UV, solar radiation, indoor climate, and battery status
- **Lightweight native app** via Tauri (< 10MB installed)

## Prerequisites

### 1. System Dependencies (Ubuntu)

```bash
# Tauri v2 requires these system libraries
sudo apt update
sudo apt install -y \
  libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

### 2. Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env
```

### 3. Node.js (v18+)

You likely already have this. If not:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

### 4. Ambient Weather API Keys

1. Go to [ambientweather.net/account](https://ambientweather.net/account)
2. Scroll to **API Keys**
3. Generate an **API Key** and an **Application Key**
4. You'll enter these in the app on first launch

## Setup & Run

```bash
cd ambient-hud

# Install JS dependencies
npm install

# Run in development mode (hot-reload)
npm run tauri dev
```

First launch will compile the Rust backend (~2-3 minutes the first time, fast after that). The app will open and prompt for your API credentials.

## Build for Production

```bash
npm run tauri build
```

This produces a `.deb` package in `src-tauri/target/release/bundle/deb/` that you can install with:

```bash
sudo dpkg -i src-tauri/target/release/bundle/deb/ambient-hud_1.0.0_amd64.deb
```

## Project Structure

```
ambient-hud/
├── src/                    # React frontend
│   ├── App.tsx             # Main HUD component
│   ├── App.css             # All HUD styling
│   ├── main.tsx            # React entry point
│   └── vite-env.d.ts
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── lib.rs          # Tauri commands + Ambient Weather API
│   │   └── main.rs         # Entry point
│   ├── Cargo.toml
│   └── tauri.conf.json
├── index.html
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## Configuration

- **Refresh interval**: Change `REFRESH_INTERVAL` in `src/App.tsx` (default: 60 seconds)
- **Window size**: Adjust in `src-tauri/tauri.conf.json` under `app.windows`
- **Colors**: All CSS variables are in `:root` at the top of `src/App.css`
- **API credentials**: Stored in localStorage; click the ✕ button in the top bar to disconnect and re-enter keys

## Ambient Weather API Notes

- The free tier allows **1 request per second** — the 60s refresh interval stays well within limits
- The app fetches the **first device** on your account. If you have multiple stations, you can modify `lib.rs` to select a specific MAC address
- All sensor fields are optional — the UI gracefully shows `---` for any missing data

## Customization Ideas

- Swap the cyan palette for garnet/gold (FSU variant) by changing the CSS variables
- Add historical charts using the Ambient Weather history endpoint
- Add alert thresholds (e.g., flash the panel red if wind gusts exceed a threshold)
- Add a mini-map showing the station location

## License

MIT
