const App = (() => {
  const WS_URL = 'ws://localhost:8080';
  let _ws = null;
  let _reconnectTimer = null;
  let _geoStop = null;

  const dom = {
    overlay: document.getElementById('permission-overlay'),
    permIcon: document.getElementById('perm-icon'),
    permTitle: document.getElementById('perm-title'),
    permMessage: document.getElementById('perm-message'),
    retryBtn: document.getElementById('retry-btn'),
    indicator: document.getElementById('status-indicator'),
    statusText: document.getElementById('status-text'),
    latDisplay: document.getElementById('lat-display'),
    lngDisplay: document.getElementById('lng-display'),
  };

  function init() {
    LiveMap.init('map');

    dom.retryBtn.addEventListener('click', () => {
      dom.overlay.classList.add('hidden');
      startGeolocation();
    });

    Geolocation.checkPermission().then(state => {
      handlePermChange(state);
      if (state !== Geolocation.STATE.DENIED) {
        startGeolocation();
      }
    });

    connectWebSocket();
  }

  function startGeolocation() {
    if (_geoStop) _geoStop();
    _geoStop = Geolocation.start({
      onChange: handlePermChange,
      onPosition: handlePosition,
      onError: handleGeoError,
    });
  }

  function handlePermChange(state) {
    if (state === Geolocation.STATE.AVAILABLE) {
      dom.overlay.classList.add('hidden');
      return;
    }

    dom.overlay.classList.remove('hidden');
    dom.retryBtn.classList.add('hidden');

    switch (state) {
      case Geolocation.STATE.PROMPTING:
        dom.permIcon.textContent = '📍';
        dom.permTitle.textContent = 'Location Access Required';
        dom.permMessage.textContent = 'Satellight needs your location to show your position on the map. Please allow location access when prompted.';
        break;
      case Geolocation.STATE.DENIED:
        dom.permIcon.textContent = '🚫';
        dom.permTitle.textContent = 'Location Access Denied';
        dom.permMessage.textContent = 'Location access was blocked. To use Satellight, enable location permissions in your browser settings, then click "Try Again".';
        dom.retryBtn.classList.remove('hidden');
        dom.retryBtn.focus();
        break;
      case Geolocation.STATE.UNAVAILABLE:
        dom.permIcon.textContent = '⚠️';
        dom.permTitle.textContent = 'Location Unavailable';
        dom.permMessage.textContent = 'Your location could not be determined. This may be due to weak GPS signal, disabled location services, or hardware limitations.';
        dom.retryBtn.classList.remove('hidden');
        break;
      case Geolocation.STATE.AVAILABLE:
        dom.overlay.classList.add('hidden');
        break;
    }
  }

  function handlePosition(pos) {
    LiveMap.setUserPosition(pos.lat, pos.lng, pos.accuracy);
    dom.latDisplay.textContent = pos.lat.toFixed(6);
    dom.lngDisplay.textContent = pos.lng.toFixed(6);
  }

  function handleGeoError(err) {
    console.warn('[Geolocation]', err.message || err);
  }

  // --- WebSocket ---

  function connectWebSocket() {
    try {
      _ws = new WebSocket(WS_URL);
    } catch {
      setConnectionStatus('error');
      scheduleReconnect();
      return;
    }

    let connectionTimeout = setTimeout(() => {
      if (_ws && _ws.readyState !== WebSocket.OPEN) {
        _ws.close();
        setConnectionStatus('error');
        scheduleReconnect();
      }
    }, 5000);

    _ws.onopen = () => {
      clearTimeout(connectionTimeout);
      setConnectionStatus('connected');
    };

    _ws.onclose = () => {
      clearTimeout(connectionTimeout);
      setConnectionStatus('disconnected');
      scheduleReconnect();
    };

    _ws.onerror = () => {
      clearTimeout(connectionTimeout);
      setConnectionStatus('error');
    };

    _ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'location' && data.id && data.lat != null && data.lng != null) {
          LiveMap.interpolateTo(String(data.id), data.lat, data.lng);
        }
      } catch {
        // ignore malformed messages
      }
    };
  }

  function setConnectionStatus(status) {
    dom.indicator.className = 'indicator ' + (
      status === 'connected' ? 'online' : 'offline'
    );
    dom.statusText.textContent = (
      status === 'connected' ? 'Connected' :
      status === 'error' ? 'Connection failed' :
      'Disconnected'
    );
  }

  function scheduleReconnect() {
    if (_reconnectTimer) clearTimeout(_reconnectTimer);
    _reconnectTimer = setTimeout(() => {
      connectWebSocket();
    }, 5000);
  }

  // --- Boot ---
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { init };
})();
