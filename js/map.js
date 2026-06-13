const LiveMap = (() => {
  let _map = null;
  let _userMarker = null;
  let _accuracyCircle = null;
  const _remoteMarkers = new Map();
  const _animFrames = new Map();

  const defaultIcon = L.icon({
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  });

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
      _map.setView([lat, lng], 15);
    } else {
      _userMarker.setLatLng([lat, lng]);
      if (_accuracyCircle) {
        _accuracyCircle.setLatLng([lat, lng]);
        if (accuracy != null) _accuracyCircle.setRadius(accuracy);
      }
    }
  }

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

  function addRemoteMarker(id, lat, lng) {
    if (!_map) return;
    if (_remoteMarkers.has(id)) return;
    const marker = L.marker([lat, lng], { icon: defaultIcon }).addTo(_map);
    _remoteMarkers.set(id, { marker, lat, lng });
  }

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

  function getMap() {
    return _map;
  }

  function invalidateSize() {
    if (_map) _map.invalidateSize();
  }

  return {
    init, setUserPosition, interpolateTo,
    addRemoteMarker, removeRemoteMarker,
    getMap, invalidateSize,
  };
})();
