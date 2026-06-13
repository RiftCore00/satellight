/**
 * @fileoverview LiveMap — Leaflet map initialisation and marker management.
 *
 * Exposes a single `LiveMap` IIFE module that owns the Leaflet map instance,
 * the user-position marker/accuracy-circle, and a collection of animated
 * remote markers received over WebSocket.
 */

const LiveMap = (() => {
  /** @type {import('leaflet').Map|null} */
  let _map = null;
  /** @type {import('leaflet').Marker|null} */
  let _userMarker = null;
  /** @type {import('leaflet').Circle|null} */
  let _accuracyCircle = null;
  let _followMe = true;
  const _remoteMarkers = new Map();
  /** @type {Map<string, number>} rAF handle per remote marker id */
  const _animFrames = new Map();

  // Explicitly set default icon URLs to HTTPS to prevent Leaflet from
  // auto-detecting a potentially HTTP or broken relative path from the CSS.
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  });

  const defaultIcon = L.icon({
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  });

  /**
   * Initialise the Leaflet map inside the given DOM element.
   *
   * @param {string} elementId - ID of the container element.
   * @param {import('leaflet').MapOptions} [options={}] - Additional Leaflet map options.
   * @returns {import('leaflet').Map} The created Leaflet map instance.
   */
  function init(elementId, options = {}) {
    _map = L.map(elementId, {
      zoomControl: true,
      attributionControl: true,
      fadeAnimation: true,
      ...options,
    }).setView([0, 0], 2);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>',
      detectRetina: true,
    }).addTo(_map);

    // Fix map rendering on initial load
    setTimeout(() => _map.invalidateSize(), 200);

    return _map;
  }

  /**
   * Place or update the user-position marker and accuracy circle.
   *
   * On the first call a pulsing div-icon marker and an accuracy circle are
   * created and the map is panned to the position.  Subsequent calls just
   * move the existing marker and resize the circle.
   *
   * @param {number} lat - Latitude in decimal degrees.
   * @param {number} lng - Longitude in decimal degrees.
   * @param {number|null} accuracy - Horizontal accuracy radius in metres, or null.
   */
  function setUserPosition(lat, lng, accuracy) {
    if (!_map) return;

    if (!_userMarker) {
      const icon = L.divIcon({
        className: 'user-marker',
        html: '<div class="pulse"></div>',
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });
      _userMarker = L.marker([lat, lng], { icon, zIndexOffset: 1000 }).addTo(_map);
      _accuracyCircle = L.circle([lat, lng], {
        radius: accuracy != null ? accuracy : 50,
        className: 'accuracy-circle',
        interactive: false,
      }).addTo(_map);
      if (_followMe) _map.setView([lat, lng], 15);
    } else {
      _userMarker.setLatLng([lat, lng]);
      if (_accuracyCircle) {
        _accuracyCircle.setLatLng([lat, lng]);
        if (accuracy != null) _accuracyCircle.setRadius(accuracy);
      }
      if (_followMe) _map.panTo([lat, lng]);
    }
  }

  /**
   * Smoothly animate a remote marker to a new position using cubic ease-out.
   *
   * If the marker does not yet exist it is created immediately at the target
   * position.  Any in-flight animation for the same `id` is cancelled before
   * the new one starts.
   *
   * @param {string} id - Unique identifier for the remote entity.
   * @param {number} targetLat - Destination latitude in decimal degrees.
   * @param {number} targetLng - Destination longitude in decimal degrees.
   */
  function interpolateTo(id, targetLat, targetLng) {
    if (!_map) return;

    const existing = _remoteMarkers.get(id);

    if (!existing) {
      const marker = L.marker([targetLat, targetLng], { icon: defaultIcon }).addTo(_map);
      _remoteMarkers.set(id, { marker, lat: targetLat, lng: targetLng });
      return;
    }

    // Cancel any in-flight animation for this marker
    if (_animFrames.has(id)) {
      cancelAnimationFrame(_animFrames.get(id));
      _animFrames.delete(id);
    }

    const fromLat = existing.lat;
    const fromLng = existing.lng;

    // If position hasn't changed, skip
    if (fromLat === targetLat && fromLng === targetLng) return;

    existing.lat = targetLat;
    existing.lng = targetLng;

    const duration = 1200;
    const startTime = performance.now();

    function animate(now) {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      // Cubic ease-out for smooth deceleration
      const ease = 1 - Math.pow(1 - t, 3);
      const lat = fromLat + (targetLat - fromLat) * ease;
      const lng = fromLng + (targetLng - fromLng) * ease;
      existing.marker.setLatLng([lat, lng]);

      if (t < 1) {
        _animFrames.set(id, requestAnimationFrame(animate));
      } else {
        _animFrames.delete(id);
      }
    }

    _animFrames.set(id, requestAnimationFrame(animate));
  }

  /**
   * Add a new remote marker at the given position (no-op if already exists).
   *
   * @param {string} id - Unique identifier for the remote entity.
   * @param {number} lat - Latitude in decimal degrees.
   * @param {number} lng - Longitude in decimal degrees.
   */
  function addRemoteMarker(id, lat, lng) {
    if (!_map) return;
    if (_remoteMarkers.has(id)) return;
    const marker = L.marker([lat, lng], { icon: defaultIcon }).addTo(_map);
    _remoteMarkers.set(id, { marker, lat, lng });
  }

  /**
   * Remove a remote marker from the map, cancelling any active animation.
   *
   * @param {string} id - Unique identifier for the remote entity.
   */
  function removeRemoteMarker(id) {
    if (!_map) return;
    const existing = _remoteMarkers.get(id);
    if (!existing) return;

    if (_animFrames.has(id)) {
      cancelAnimationFrame(_animFrames.get(id));
      _animFrames.delete(id);
    }
    _map.removeLayer(existing.marker);
    _remoteMarkers.delete(id);
  }

  function setFollowMe(enabled) {
    _followMe = !!enabled;
  }

  function getMap() {
    return _map;
  }

  /**
   * Recalculate the map container size and redraw tiles.
   * Call this after a programmatic resize of the container element.
   */
  function invalidateSize() {
    if (_map) _map.invalidateSize();
  }

  return {
    init, setUserPosition, interpolateTo,
    addRemoteMarker, removeRemoteMarker,
    getMap, invalidateSize, setFollowMe,
  };
})();
