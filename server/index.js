/**
 * @fileoverview Mock WebSocket server for Satellight development and testing.
 *
 * Simulates three drone targets broadcasting live position updates every 2 seconds
 * to all connected WebSocket clients. Each message conforms to the Satellight
 * location protocol: `{ type: 'location', id, lat, lng, timestamp }`.
 *
 * Usage:
 * ```
 * PORT=8080 node index.js
 * ```
 */

'use strict';

const { WebSocketServer } = require('ws');

/** @type {number} Listening port (overridable via PORT env var). */
const PORT = process.env.PORT || 8080;

const wss = new WebSocketServer({ port: PORT });

/**
 * @typedef {Object} DroneTarget
 * @property {string} id       - Unique drone identifier sent in each message.
 * @property {number} lat      - Current latitude in decimal degrees.
 * @property {number} lng      - Current longitude in decimal degrees.
 * @property {number} speed    - Base movement magnitude per tick (degrees).
 * @property {number} heading  - Initial heading in degrees (0 = north, 90 = east).
 * @property {number} [dlat]   - Computed latitude delta per tick.
 * @property {number} [dlng]   - Computed longitude delta per tick.
 */

/** @type {DroneTarget[]} Simulated targets broadcast to all clients. */
const TARGETS = [
  {
    id: 'drone-alpha',
    lat: 40.7128,
    lng: -74.0060,
    speed: 0.0015,
    heading: 45,
  },
  {
    id: 'drone-bravo',
    lat: 34.0522,
    lng: -118.2437,
    speed: 0.001,
    heading: 180,
  },
  {
    id: 'drone-charlie',
    lat: 51.5074,
    lng: -0.1278,
    speed: 0.002,
    heading: 270,
  },
];

// Pre-compute per-tick lat/lng deltas from heading and speed.
for (const t of TARGETS) {
  const rad = (t.heading * Math.PI) / 180;
  t.dlat = t.speed * Math.cos(rad);
  t.dlng = t.speed * Math.sin(rad);
}

/**
 * Handle a new WebSocket client connection.
 *
 * Starts a 2-second broadcast interval that sends a `location` message for
 * each {@link DroneTarget}.  The interval is cleared when the client
 * disconnects or encounters an error.
 *
 * @param {import('ws').WebSocket} ws  - The newly connected WebSocket client.
 * @param {import('http').IncomingMessage} req - The underlying HTTP upgrade request.
 */
wss.on('connection', (ws, req) => {
  const clientIp = req.socket.remoteAddress;
  console.log(`[connect] ${clientIp}`);

  const interval = setInterval(() => {
    if (ws.readyState !== ws.OPEN) return;

    for (const t of TARGETS) {
      // Advance position with a small random jitter to simulate real movement.
      t.lat += t.dlat + (Math.random() - 0.5) * 0.0008;
      t.lng += t.dlng + (Math.random() - 0.5) * 0.0008;

      ws.send(JSON.stringify({
        type: 'location',
        id: t.id,
        lat: Math.round(t.lat * 1e6) / 1e6,
        lng: Math.round(t.lng * 1e6) / 1e6,
        timestamp: Date.now(),
      }));
    }
  }, 2000);

  ws.on('close', () => {
    console.log(`[disconnect] ${clientIp}`);
    clearInterval(interval);
  });

  ws.on('error', (err) => {
    console.error(`[error] ${clientIp}:`, err.message);
    clearInterval(interval);
  });
});

console.log(`Satellight mock server running on ws://localhost:${PORT}`);
