const Geolocation = (() => {
  const STATE = Object.freeze({
    PROMPTING: 'prompting',
    DENIED: 'denied',
    UNAVAILABLE: 'unavailable',
    AVAILABLE: 'available',
  });

  let _state = STATE.PROMPTING;
  let _watchId = null;
  const _listeners = {};

  function _emit(event, data) {
    (_listeners[event] || []).slice().forEach(fn => fn(data));
  }

  function on(event, fn) {
    (_listeners[event] = _listeners[event] || []).push(fn);
    return () => {
      _listeners[event] = (_listeners[event] || []).filter(f => f !== fn);
    };
  }

  function getState() {
    return _state;
  }

  async function checkPermission() {
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
      }
      _emit('change', _state);

      result.addEventListener('change', () => {
        if (result.state === 'denied') {
          _state = STATE.DENIED;
          _emit('change', _state);
        }
      });
    } catch {
      // permissions API unavailable, will learn from watchPosition errors
    }

    return _state;
  }

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

  function stop() {
    if (_watchId !== null) {
      navigator.geolocation.clearWatch(_watchId);
      _watchId = null;
    }
  }

  return { start, stop, on, getState, checkPermission, STATE };
})();
