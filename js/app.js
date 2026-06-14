/**
 * @fileoverview App — application bootstrap, WebSocket client, and UI controller.
 *
 * Wires together the {@link LiveMap} and {@link Geolocation} modules, manages
 * the WebSocket connection to the mock server, and keeps the permission overlay
 * and coords bar in sync with application state.
 */

const App = (() => {
  /** @type {string} WebSocket server URL. */
  const WS_URL = 'ws://localhost:8080';
  /** @type {WebSocket|null} Active WebSocket connection. */
  let _ws = null;
  /** @type {number|null} Pending reconnect timer handle. */
  let _reconnectTimer = null;
  /** @type {Function|null} Stop function returned by {@link Geolocation.start}. */
  let _geoStop = null;
  let _reconnectDelay = 1000;      // starts at 1 s
  const _reconnectDelayMax = 30000; // caps at 30 s
  let _coordFormat = 'dd';
  let _lastPosition = null;

  /** @type {Object.<string, HTMLElement>} Cached DOM references. */
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
    accDisplay: document.getElementById('acc-display'),
  };

  /**
   * Initialise the application: set up the map, check geolocation permission,
   * register event handlers, and open the WebSocket connection.
   */
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

    const formatToggle = document.getElementById('coord-format-toggle');
    if (formatToggle) {
      formatToggle.addEventListener('click', () => {
        _coordFormat = _coordFormat === 'dd' ? 'dms' : 'dd';
        formatToggle.textContent = _coordFormat.toUpperCase();
        if (_lastPosition) _updateCoords(_lastPosition);
      });
    }

    Geolocation.checkPermission().then(state => {
      handlePermChange(state);
      if (state !== Geolocation.STATE.DENIED) {
        startGeolocation();
      }
    });

    connectWebSocket();
  }

  function _toDMS(deg, isLat) {
    const abs = Math.abs(deg);
    const d = Math.floor(abs);
    const m = Math.floor((abs - d) * 60);
    const s = ((abs - d - m / 60) * 3600).toFixed(2);
    const dir = isLat ? (deg >= 0 ? 'N' : 'S') : (deg >= 0 ? 'E' : 'W');
    return `${d}\u00B0${m}'${s}"${dir}`;
  }

  function _updateCoords(pos) {
    if (_coordFormat === 'dms') {
      dom.latDisplay.textContent = _toDMS(pos.lat, true);
      dom.lngDisplay.textContent = _toDMS(pos.lng, false);
    } else {
      dom.latDisplay.textContent = pos.lat.toFixed(6);
      dom.lngDisplay.textContent = pos.lng.toFixed(6);
    }
    if (pos.accuracy != null) {
      dom.accDisplay.textContent = pos.accuracy < 1000
        ? `±${Math.round(pos.accuracy)}m`
        : `±${(pos.accuracy / 1000).toFixed(1)}km`;
    }
  }

  /**
   * (Re-)start geolocation watching, stopping any previous watch first.
   */
  function startGeolocation() {
    if (_geoStop) _geoStop();
    _geoStop = Geolocation.start({
      onChange: handlePermChange,
      onPosition: handlePosition,
      onError: handleGeoError,
    });
  }

  /**
   * React to a geolocation permission/availability state change.
   * Shows or hides the permission overlay and updates its content.
   *
   * @param {string} state - One of the `Geolocation.STATE` values.
   */
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

  /**
   * Handle a new geolocation position fix: update the map marker and coords bar.
   *
   * @param {import('./geolocation').PositionPayload} pos - Position data from the Geolocation module.
   */
  function handlePosition(pos) {
    LiveMap.setUserPosition(pos.lat, pos.lng, pos.accuracy);
    _lastPosition = pos;
    _updateCoords(pos);
  }

  /**
   * Log a non-fatal geolocation error to the console.
   *
   * @param {GeolocationPositionError} err
   */
  function handleGeoError(err) {
    console.warn('[Geolocation]', err.message || err);
  }

  // --- WebSocket ---

  /**
   * Open a new WebSocket connection to {@link WS_URL}.
   * Guards against creating a duplicate connection if one is already open.
   */
  function connectWebSocket() {
    // Guard: don't open a second socket while one is already live
    if (_ws && (_ws.readyState === WebSocket.OPEN || _ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    // Tear down any lingering socket before creating a new one
    if (_ws) {
      _ws.onclose = null; // prevent scheduleReconnect from firing again
      _ws.onerror = null;
      _ws.close();
      _ws = null;
    }

    try {
      _ws = new WebSocket(WS_URL);
    } catch {
      setConnectionStatus('error');
      scheduleReconnect();
      return;
    }

    let connectionTimeout = setTimeout(() => {
      if (_ws && _ws.readyState !== WebSocket.OPEN) {
        _ws.onclose = null;
        _ws.close();
        _ws = null;
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
      // onclose will fire after onerror; let it call scheduleReconnect
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

  /**
   * Update the connection status indicator and label in the top bar.
   *
   * @param {'connected'|'disconnected'|'error'} status - New connection status.
   */
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

  /**
   * Schedule a WebSocket reconnect attempt after a 5-second delay.
   * Cancels any previously scheduled reconnect to avoid duplicates.
   */
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
