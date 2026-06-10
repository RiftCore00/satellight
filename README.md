# Satellight: Live Geolocation Interface

A single-page web application that leverages **Leaflet.js** and the browser's **Geolocation API** to provide real-time location visualization on an interactive map. Satellight streams live geolocation data and renders smooth, responsive map experiences directly in the browser.

---

## Features

- **Real-Time Location Tracking** — Uses the browser's native Geolocation API to watch the user's position and plot it on a Leaflet-powered map.
- **WebSocket Integration** — Connects to a WebSocket endpoint to receive live coordinate updates from remote sources.
- **Smooth Marker Interpolation** — Animates marker movements between WebSocket updates using cubic ease-out interpolation for a fluid visual experience.
- **Graceful Permission Handling** — Detects when location access is denied, delayed, or unavailable and renders clear, informative UI states to guide the user.
- **Responsive Map Layout** — Built with a flexible CSS grid that adapts the map container to mobile, tablet, and desktop viewports.
- **Zero-Friction Setup** — No build step required; open `index.html` in any modern browser to get started.

---

## Getting Started

```bash
git clone <repository-url>
cd "Live Geolocation Interface"
```

Open `index.html` in a modern browser (Chrome, Firefox, Edge, or Safari).

> **Note:** The Geolocation API requires a secure context (`https://` or `localhost`). If testing from `file://`, some browsers may block location access. Use a local dev server:

```bash
python3 -m http.server 8000
# or
npx serve .
```

Then visit `http://localhost:8000`.

### Mock WebSocket Server (Optional)

For testing remote coordinate streaming, start the mock server:

```bash
cd server
npm install
npm start
```

The server broadcasts three simulated drone positions every 2 seconds on `ws://localhost:8080`.

---

## Project Structure

```
├── index.html              Entry point and map container
├── css/
│   └── style.css           Responsive grid layout and map styles
├── js/
│   ├── app.js             Application bootstrap and WebSocket setup
│   ├── map.js             Leaflet map initialization and marker logic
│   └── geolocation.js     Geolocation API wrapper with permission states
├── server/
│   ├── index.js           Mock WebSocket server for development
│   └── package.json       Server dependencies
├── .github/workflows/
│   └── ci.yml             CI pipeline (HTML validation + syntax checks)
└── README.md
```

---

## Tech Stack

| Layer          | Technology                              |
|----------------|-----------------------------------------|
| Mapping        | [Leaflet.js](https://leafletjs.com/)    |
| Tile Provider  | OpenStreetMap (configurable)            |
| Real-Time Comms| WebSocket API                           |
| Geolocation    | [W3C Geolocation API](https://w3c.github.io/geolocation-api/) |
| Layout         | CSS Grid + Flexbox                      |
| CI/CD          | GitHub Actions (html5validator + syntax checks) |

---

## Browser Support

Satellight targets modern browsers that implement the W3C Geolocation API and WebSocket protocol:

- Chrome 49+
- Firefox 55+
- Safari 12.1+
- Edge 79+

---

## Contributing

Contributions are welcome! Focus areas for upcoming waves:

1. **Smooth Interpolation (High — 200 pts)** — Refine the marker animation between WebSocket coordinate updates for buttery-smooth movement.
2. **Permission UX (Medium — 150 pts)** — Enhance the permission-denied and permission-pending UI states with more helpful messaging and recovery flows.
3. **Responsive Grid Fix (Trivial — 100 pts)** — Audit and fix the map container grid layout on narrow mobile viewports.

---

## License

[MIT](LICENSE)
