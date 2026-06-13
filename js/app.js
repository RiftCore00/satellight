const App = (() => {
  const WS_URL = 'ws://localhost:8080';
  let _ws = null;
  let _reconnectTimer = null;
  let _geoStop = null;
  let _reconnectDelay = 1000;      // starts at 1 s
  const _reconnectDelayMax = 30000; // caps at 30 s

  const dom = {
    overlay: document.getElementById('permission-overlay'),
    overlayCard: document.querySelector('.overlay-card'),
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

    // Focus trap: keep keyboard focus inside the overlay while it is visible
    dom.overlay.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const focusable = Array.from(
        dom.overlay.querySelectorAll('button:not([disabled]), [tabindex="0"]')
      ).filter(el => !el.closest('.hidden') && el.offsetParent !== null);
      if (!focusable.length) { e.preventDefault(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
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

    // Move focus into the overlay for keyboard/screen-reader users
    requestAnimationFrame(() => {
      const focusTarget = dom.retryBtn.classList.contains('hidden')
        ? dom.overlayCard
        : dom.retryBtn;
      focusTarget.focus();
    });

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
        break;
      case Geolocation.STATE.UNAVAILABLE:
        dom.permIcon.textContent = '⚠️';
        dom.permTitle.textContent = 'Location Unavailable';
        dom.permMessage.textContent = 'Your location could not be determined. This may be due to weak GPS signal, disabled location services, or hardware limitations.';
        dom.retryBtn.classList.remove('hidden');
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
      _reconnectDelay = 1000; // reset backoff on successful connection
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
    // Add ±20% jitter to spread reconnect storms
    const jitter = _reconnectDelay * 0.2 * (Math.random() * 2 - 1);
    const delay = Math.min(_reconnectDelay + jitter, _reconnectDelayMax);
    _reconnectDelay = Math.min(_reconnectDelay * 2, _reconnectDelayMax);
    _reconnectTimer = setTimeout(() => {
      connectWebSocket();
    }, delay);
  }

  // --- Boot ---
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { init };
})();
