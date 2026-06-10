const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });

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

for (const t of TARGETS) {
  const rad = (t.heading * Math.PI) / 180;
  t.dlat = t.speed * Math.cos(rad);
  t.dlng = t.speed * Math.sin(rad);
}

wss.on('connection', (ws, req) => {
  const clientIp = req.socket.remoteAddress;
  console.log(`[connect] ${clientIp}`);

  const interval = setInterval(() => {
    if (ws.readyState !== ws.OPEN) return;

    for (const t of TARGETS) {
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
