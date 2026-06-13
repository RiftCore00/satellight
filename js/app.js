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

  /** @type {Object.<string, HTMLElement>} Cached DOM references. */
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

    Geolocation.checkPermission().then(state => {
      handlePermChange(state);
      if (state !== Geolocation.STATE.DENIED) {
        startGeolocation();
      }
    });

    connectWebSocket();
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

  /**
   * Handle a new geolocation position fix: update the map marker and coords bar.
   *
   * @param {import('./geolocation').PositionPayload} pos - Position data from the Geolocation module.
   */
  function handlePosition(pos) {
    LiveMap.setUserPosition(pos.lat, pos.lng, pos.accuracy);
    dom.latDisplay.textContent = pos.lat.toFixed(6);
    dom.lngDisplay.textContent = pos.lng.toFixed(6);
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
