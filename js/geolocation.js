/**
 * @fileoverview Geolocation — browser Geolocation API wrapper with permission states.
 *
 * Provides a simple event-emitter interface around `navigator.geolocation.watchPosition`
 * and the Permissions API, normalising browser differences into four well-defined states.
 */

const Geolocation = (() => {
  /**
   * Enumeration of permission/availability states.
   *
   * @readonly
   * @enum {string}
   */
  const STATE = Object.freeze({
    /** The browser is waiting for the user to respond to a permission prompt. */
    PROMPTING: 'prompting',
    /** The user has explicitly denied location access. */
    DENIED: 'denied',
    /** Geolocation hardware or services are unavailable. */
    UNAVAILABLE: 'unavailable',
    /** Location access has been granted and positions are being received. */
    AVAILABLE: 'available',
  });

  /** @type {string} Current permission/availability state. */
  let _state = STATE.PROMPTING;
  /** @type {number|null} watchPosition watch ID, or null when not watching. */
  let _watchId = null;
  let _permissionPromise = null;
  const _listeners = {};

  /**
   * Emit an event to all registered listeners.
   *
   * @param {string} event - Event name.
   * @param {*} data - Payload passed to each listener.
   */
  function _emit(event, data) {
    (_listeners[event] || []).slice().forEach(fn => fn(data));
  }

  /**
   * Register a listener for a named event.
   *
   * @param {string} event - Event name (`'change'`, `'position'`, or `'error'`).
   * @param {Function} fn - Callback invoked with the event payload.
   * @returns {Function} Unsubscribe function — call it to remove the listener.
   */
  function on(event, fn) {
    (_listeners[event] = _listeners[event] || []).push(fn);
    return () => {
      _listeners[event] = (_listeners[event] || []).filter(f => f !== fn);
    };
  }

  /**
   * Return the current permission/availability state.
   *
   * @returns {string} One of the {@link STATE} values.
   */
  function getState() {
    return _state;
  }

  /**
   * Query the Permissions API for the current geolocation permission state and
   * update `_state` accordingly.  Concurrent calls share the same promise so
   * `_state` is never written by two callers simultaneously.
   *
   * Emits a `'change'` event when the state is determined.
   *
   * @returns {Promise<string>} Resolves with the current {@link STATE} value.
   */
  async function checkPermission() {
    // Serialize concurrent calls: return the same promise if one is already in flight
    if (_permissionPromise) return _permissionPromise;

    _permissionPromise = (async () => {
      if (!('geolocation' in navigator)) {
        _state = STATE.UNAVAILABLE;
        _emit('change', _state);
        return _state;
      }

      if (!('permissions' in navigator) || !navigator.permissions.query) {
        return _state;
      }

      try {
        const result = await navigator.permissions.query({ name: 'geolocation' });
        if (result.state === 'denied') {
          _state = STATE.DENIED;
        } else if (result.state === 'prompt') {
          _state = STATE.PROMPTING;
        } else if (result.state === 'granted') {
          _state = STATE.AVAILABLE;
        }
        _emit('change', _state);

        result.addEventListener('change', () => {
          if (result.state === 'denied') {
            _state = STATE.DENIED;
            _emit('change', _state);
          } else if (result.state === 'granted') {
            _state = STATE.AVAILABLE;
            _emit('change', _state);
          }
        });
      } catch {
        // permissions API unavailable, will learn from watchPosition errors
      }

      return _state;
    })();

    try {
      return await _permissionPromise;
    } finally {
      _permissionPromise = null;
    }
  }

  /**
   * @typedef {Object} PositionPayload
   * @property {number} lat - Latitude in decimal degrees.
   * @property {number} lng - Longitude in decimal degrees.
   * @property {number} accuracy - Horizontal accuracy radius in metres.
   * @property {number|null} altitude - Altitude in metres above the WGS84 ellipsoid, or null.
   * @property {number|null} altitudeAccuracy - Altitude accuracy in metres, or null.
   * @property {number|null} heading - Heading in degrees clockwise from true north, or null.
   * @property {number|null} speed - Speed in metres per second, or null.
   * @property {number} timestamp - Timestamp of the fix (ms since Unix epoch).
   */

  /**
   * @typedef {Object} StartCallbacks
   * @property {function(string): void} [onChange] - Called when permission/availability state changes.
   * @property {function(PositionPayload): void} [onPosition] - Called on each new position fix.
   * @property {function(GeolocationPositionError): void} [onError] - Called on geolocation errors.
   */

  /**
   * Start watching the device's geolocation.
   *
   * Registers the provided callbacks as event listeners and begins a
   * `watchPosition` call (after first checking permission).
   *
   * @param {StartCallbacks} [callbacks={}] - Event callbacks to register.
   * @returns {Function} Stop function — call it to clear the watch and stop tracking.
   */
  function start(callbacks = {}) {
    if (callbacks.onChange) on('change', callbacks.onChange);
    if (callbacks.onPosition) on('position', callbacks.onPosition);
    if (callbacks.onError) on('error', callbacks.onError);

    if (!('geolocation' in navigator)) {
      _state = STATE.UNAVAILABLE;
      _emit('change', _state);
      return () => stop();
    }

    checkPermission().then(() => {
      if (_state === STATE.DENIED) return;

      _watchId = navigator.geolocation.watchPosition(
        (pos) => {
          if (_state !== STATE.AVAILABLE) {
            _state = STATE.AVAILABLE;
            _emit('change', _state);
          }
          _emit('position', {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            altitude: pos.coords.altitude,
            altitudeAccuracy: pos.coords.altitudeAccuracy,
            heading: pos.coords.heading,
            speed: pos.coords.speed,
            timestamp: pos.timestamp,
          });
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            _state = STATE.DENIED;
            _emit('change', _state);
          } else if (err.code === err.POSITION_UNAVAILABLE) {
            _state = STATE.UNAVAILABLE;
            _emit('change', _state);
          }
          _emit('error', err);
        },
        {
          enableHighAccuracy: true,
          maximumAge: 5000,
          timeout: 15000,
        }
      );
    });

    return () => stop();
  }

  /**
   * Stop the active geolocation watch, if any.
   */
  function stop() {
    if (_watchId !== null) {
      navigator.geolocation.clearWatch(_watchId);
      _watchId = null;
    }
  }

  return { start, stop, on, getState, checkPermission, STATE };
})();
