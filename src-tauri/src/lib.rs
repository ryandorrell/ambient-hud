use serde::{Deserialize, Serialize};

/// Represents the weather data we extract from the Ambient Weather API response.
/// Field names match the Ambient Weather API's lastData keys.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct WeatherData {
    // Timestamps
    #[serde(default, rename(deserialize = "dateutc"))]
    pub date_utc: Option<u64>,
    #[serde(default)]
    pub date: Option<String>,

    // Outdoor
    #[serde(default, rename(deserialize = "tempf"))]
    pub temp_f: Option<f64>,
    #[serde(default)]
    pub humidity: Option<f64>,
    #[serde(default)]
    pub feels_like: Option<f64>,
    #[serde(default)]
    pub dew_point: Option<f64>,
    #[serde(default, rename(deserialize = "feelsLikein"))]
    pub feels_like_in: Option<f64>,

    // Indoor
    #[serde(default, rename(deserialize = "tempinf"))]
    pub temp_in_f: Option<f64>,
    #[serde(default, rename(deserialize = "humidityin"))]
    pub humidity_in: Option<f64>,

    // Wind
    #[serde(default, rename(deserialize = "windspeedmph"))]
    pub wind_speed_mph: Option<f64>,
    #[serde(default, rename(deserialize = "windgustmph"))]
    pub wind_gust_mph: Option<f64>,
    #[serde(default, rename(deserialize = "winddir"))]
    pub wind_dir: Option<f64>,
    #[serde(default, rename(deserialize = "winddir_avg10m"))]
    pub wind_dir_avg10m: Option<f64>,
    #[serde(default, rename(deserialize = "maxdailygust"))]
    pub max_daily_gust: Option<f64>,

    // Pressure
    #[serde(default, rename(deserialize = "baromrelin"))]
    pub barom_rel_in: Option<f64>,
    #[serde(default, rename(deserialize = "baromabsin"))]
    pub barom_abs_in: Option<f64>,

    // Rain
    #[serde(default, rename(deserialize = "hourlyrainin"))]
    pub hourly_rain_in: Option<f64>,
    #[serde(default, rename(deserialize = "dailyrainin"))]
    pub daily_rain_in: Option<f64>,
    #[serde(default, rename(deserialize = "weeklyrainin"))]
    pub weekly_rain_in: Option<f64>,
    #[serde(default, rename(deserialize = "monthlyrainin"))]
    pub monthly_rain_in: Option<f64>,
    #[serde(default, rename(deserialize = "yearlyrainin"))]
    pub yearly_rain_in: Option<f64>,
    #[serde(default, rename(deserialize = "eventrainin"))]
    pub event_rain_in: Option<f64>,

    // Solar / UV
    #[serde(default)]
    pub uv: Option<f64>,
    #[serde(default, rename(deserialize = "solarradiation"))]
    pub solar_radiation: Option<f64>,

    // Battery & meta
    #[serde(default, rename(deserialize = "battout"))]
    pub batt_out: Option<f64>,
    #[serde(default, rename(deserialize = "battin"))]
    pub batt_in: Option<f64>,
}

/// Full device response from the Ambient Weather API
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeviceResponse {
    mac_address: Option<String>,
    last_data: Option<serde_json::Value>,
    info: Option<DeviceInfo>,
}

#[derive(Debug, Deserialize)]
struct LatLng {
    lat: Option<f64>,
    lng: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct CoordsWrapper {
    coords: Option<LatLng>,
}

#[derive(Debug, Deserialize)]
struct DeviceInfo {
    name: Option<String>,
    location: Option<String>,
    coords: Option<CoordsWrapper>,
}

/// What we send back to the React frontend
#[derive(Debug, Serialize)]
pub struct StationPayload {
    pub station_name: String,
    pub location: String,
    pub mac_address: String,
    pub lat: Option<f64>,
    pub lon: Option<f64>,
    pub data: WeatherData,
    pub raw_keys: Vec<String>,
}

#[tauri::command]
async fn fetch_weather(api_key: String, app_key: String) -> Result<StationPayload, String> {
    let url = format!(
        "https://rt.ambientweather.net/v1/devices?apiKey={}&applicationKey={}",
        api_key, app_key
    );

    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("API returned status {}", resp.status()));
    }

    let devices: Vec<DeviceResponse> = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    let device = devices
        .into_iter()
        .next()
        .ok_or_else(|| "No devices found on this account".to_string())?;

    let last_data_value = device
        .last_data
        .ok_or_else(|| "Device has no recent data".to_string())?;

    // Collect all raw keys for debugging
    let raw_keys: Vec<String> = last_data_value
        .as_object()
        .map(|obj| obj.keys().cloned().collect())
        .unwrap_or_default();

    // Deserialize into our struct (unknown fields are silently ignored)
    let data: WeatherData = serde_json::from_value(last_data_value)
        .map_err(|e| format!("Failed to parse weather data: {}", e))?;

    let info = device.info.unwrap_or(DeviceInfo {
        name: None,
        location: None,
        coords: None,
    });

    let (lat, lon) = info
        .coords
        .as_ref()
        .and_then(|c| c.coords.as_ref())
        .map(|ll| (ll.lat, ll.lng))
        .unwrap_or((None, None));

    Ok(StationPayload {
        station_name: info.name.unwrap_or_else(|| "Unknown Station".into()),
        location: info.location.unwrap_or_else(|| "Unknown Location".into()),
        mac_address: device.mac_address.unwrap_or_default(),
        lat,
        lon,
        data,
        raw_keys,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![fetch_weather])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
