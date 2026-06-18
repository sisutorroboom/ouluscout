import { useRef, useEffect, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import type { Location } from '../types';

const OULU_BBOX = {
  min_lat: 64.85,
  max_lat: 65.15,
  min_lon: 25.20,
  max_lon: 25.80,
};

const OULU_CENTER: [number, number] = [25.4651, 65.0121];

const MAP_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    'osm-tiles': {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  },
  layers: [
    {
      id: 'osm-tiles',
      type: 'raster',
      source: 'osm-tiles',
      paint: {
        'raster-opacity': 0.85,
        'raster-brightness-min': 0,
        'raster-brightness-max': 0.4,
        'raster-saturation': -0.3,
        'raster-contrast': 0.1,
      },
    },
  ],
};

const ISOCHRONE_COLORS: Record<string, Record<string, string>> = {
  'foot-walking': {
    '15': 'rgba(59, 130, 246, 0.2)',
    '10': 'rgba(59, 130, 246, 0.3)',
    '5': 'rgba(59, 130, 246, 0.4)',
  },
  'driving-car': {
    '15': 'rgba(34, 197, 94, 0.15)',
    '10': 'rgba(34, 197, 94, 0.2)',
    '5': 'rgba(34, 197, 94, 0.25)',
  },
};

const ISOCHRONE_BORDER_COLORS: Record<string, string> = {
  'foot-walking': 'rgba(59, 130, 246, 0.7)',
  'driving-car': 'rgba(34, 197, 94, 0.7)',
};

interface MapProps {
  locations: Location[];
  activeLocationId: string | null;
  onLocationSelect: (lat: number, lon: number) => void;
  onLocationActivate: (id: string) => void;
}

export default function MapComponent({
  locations,
  activeLocationId,
  onLocationSelect,
  onLocationActivate,
}: MapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const warningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningElRef = useRef<HTMLDivElement | null>(null);
  const isochrone_layersRef = useRef<string[]>([]);
  const cafe_layersRef = useRef<string[]>([]);

  // Initialize map once
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLE,
      center: OULU_CENTER,
      zoom: 13,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-left');
    map.addControl(
      new maplibregl.ScaleControl({ unit: 'metric' }),
      'bottom-left'
    );

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Show outside-bbox warning
  const showOutsideWarning = useCallback(() => {
    if (!mapContainerRef.current) return;
    if (warningElRef.current) {
      clearTimeout(warningTimeoutRef.current!);
      warningElRef.current.remove();
      warningElRef.current = null;
    }
    const el = document.createElement('div');
    el.className =
      'absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-red-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm font-medium pointer-events-none';
    el.style.cssText =
      'position:absolute;top:16px;left:50%;transform:translateX(-50%);z-index:50;background:#dc2626;color:white;padding:8px 16px;border-radius:8px;font-size:14px;font-weight:500;box-shadow:0 4px 12px rgba(0,0,0,0.5);pointer-events:none;';
    el.textContent = 'Valittu sijainti on Oulun alueen ulkopuolella';
    mapContainerRef.current.appendChild(el);
    warningElRef.current = el;
    warningTimeoutRef.current = setTimeout(() => {
      el.remove();
      warningElRef.current = null;
    }, 3000);
  }, []);

  // Handle map click
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const onClick = (e: maplibregl.MapMouseEvent) => {
      const { lng: lon, lat } = e.lngLat;
      if (
        lat < OULU_BBOX.min_lat ||
        lat > OULU_BBOX.max_lat ||
        lon < OULU_BBOX.min_lon ||
        lon > OULU_BBOX.max_lon
      ) {
        showOutsideWarning();
        return;
      }
      onLocationSelect(lat, lon);
    };

    map.on('click', onClick);
    return () => {
      map.off('click', onClick);
    };
  }, [onLocationSelect, showOutsideWarning]);

  // Update markers when locations change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentIds = new Set(locations.map(l => l.id));

    // Remove markers for deleted locations
    for (const [id, marker] of markersRef.current.entries()) {
      if (!currentIds.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }

    // Add/update markers for current locations
    locations.forEach((loc, index) => {
      if (markersRef.current.has(loc.id)) {
        // Update position
        markersRef.current.get(loc.id)!.setLngLat([loc.lon, loc.lat]);
        return;
      }

      const isActive = loc.id === activeLocationId;
      const el = document.createElement('div');
      el.style.cssText = `
        width: 32px;
        height: 32px;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        cursor: pointer;
        border: 2px solid white;
        background: ${isActive ? '#3b82f6' : '#6366f1'};
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 8px rgba(0,0,0,0.4);
        transition: background 0.2s;
      `;

      const inner = document.createElement('div');
      inner.style.cssText = `
        transform: rotate(45deg);
        color: white;
        font-weight: 700;
        font-size: 13px;
        font-family: sans-serif;
        line-height: 1;
      `;
      inner.textContent = String(index + 1);
      el.appendChild(inner);

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        onLocationActivate(loc.id);
      });

      const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([loc.lon, loc.lat])
        .addTo(map);

      markersRef.current.set(loc.id, marker);
    });
  }, [locations, activeLocationId, onLocationActivate]);

  // Update marker colors when active changes
  useEffect(() => {
    for (const [id, marker] of markersRef.current.entries()) {
      const el = marker.getElement();
      const isActive = id === activeLocationId;
      el.style.background = isActive ? '#3b82f6' : '#6366f1';
    }
  }, [activeLocationId]);

  // Fly to active location
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !activeLocationId) return;
    const loc = locations.find(l => l.id === activeLocationId);
    if (!loc) return;
    map.flyTo({
      center: [loc.lon, loc.lat],
      zoom: Math.max(map.getZoom(), 14),
      duration: 800,
      essential: true,
    });
  }, [activeLocationId, locations]);

  // Draw isochrones and cafe markers for active location
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Wait for map to be loaded
    const drawData = () => {
      // Clean up previous isochrone layers/sources
      for (const layerId of isochrone_layersRef.current) {
        if (map.getLayer(layerId)) map.removeLayer(layerId);
        if (map.getSource(layerId)) map.removeSource(layerId);
      }
      isochrone_layersRef.current = [];

      // Clean up previous cafe layers/sources
      for (const layerId of cafe_layersRef.current) {
        if (map.getLayer(layerId)) map.removeLayer(layerId);
        if (map.getSource(layerId)) map.removeSource(layerId);
      }
      cafe_layersRef.current = [];

      if (!activeLocationId) return;

      const activeLoc = locations.find(l => l.id === activeLocationId);
      if (!activeLoc?.result) return;

      const { isochrones, cafes } = activeLoc.result;

      // Draw isochrones - sort by descending minutes so largest is drawn first
      if (isochrones?.polygons) {
        const profiles = Object.keys(isochrones.polygons);
        for (const profile of profiles) {
          const minutesMap = isochrones.polygons[profile];
          const minuteKeys = Object.keys(minutesMap).sort(
            (a, b) => Number(b) - Number(a)
          );

          for (const minuteStr of minuteKeys) {
            const coords = minutesMap[minuteStr];
            if (!coords || coords.length === 0) continue;

            const sourceId = `iso-${profile}-${minuteStr}`;
            const fillLayerId = `iso-fill-${profile}-${minuteStr}`;
            const lineLayerId = `iso-line-${profile}-${minuteStr}`;

            const color =
              ISOCHRONE_COLORS[profile]?.[minuteStr] ?? 'rgba(100,100,100,0.2)';
            const borderColor =
              ISOCHRONE_BORDER_COLORS[profile] ?? 'rgba(100,100,100,0.7)';

            // coords from backend: array of [lon, lat] pairs forming a ring
            const geojsonCoords: number[][][] = [coords];

            try {
              map.addSource(sourceId, {
                type: 'geojson',
                data: {
                  type: 'Feature',
                  geometry: {
                    type: 'Polygon',
                    coordinates: geojsonCoords,
                  },
                  properties: {},
                },
              });

              map.addLayer({
                id: fillLayerId,
                type: 'fill',
                source: sourceId,
                paint: {
                  'fill-color': color,
                  'fill-opacity': 1,
                },
              });

              map.addLayer({
                id: lineLayerId,
                type: 'line',
                source: sourceId,
                paint: {
                  'line-color': borderColor,
                  'line-width': 1.5,
                  'line-opacity': 0.7,
                },
              });

              isochrone_layersRef.current.push(sourceId, fillLayerId, lineLayerId);
            } catch (e) {
              // Source might already exist if rapid updates
              console.warn('Error adding isochrone layer:', e);
            }
          }
        }
      }

      // Draw cafe markers as a GeoJSON circle layer
      if (cafes?.cafes && cafes.cafes.length > 0) {
        const cafeSourceId = 'cafe-markers';
        const cafeLayerId = 'cafe-circles';

        const features = cafes.cafes.map(cafe => ({
          type: 'Feature' as const,
          geometry: {
            type: 'Point' as const,
            coordinates: [cafe.lon, cafe.lat],
          },
          properties: {
            name: cafe.name,
            distance_m: cafe.distance_m,
          },
        }));

        try {
          map.addSource(cafeSourceId, {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features,
            },
          });

          map.addLayer({
            id: cafeLayerId,
            type: 'circle',
            source: cafeSourceId,
            paint: {
              'circle-radius': 6,
              'circle-color': '#ef4444',
              'circle-stroke-color': 'white',
              'circle-stroke-width': 1.5,
              'circle-opacity': 0.9,
            },
          });

          cafe_layersRef.current.push(cafeSourceId, cafeLayerId);
        } catch (e) {
          console.warn('Error adding cafe layer:', e);
        }
      }
    };

    if (!map.loaded()) {
      map.once('load', drawData);
    } else {
      drawData();
    }
  }, [activeLocationId, locations]);

  return (
    <div ref={mapContainerRef} className="w-full h-full relative">
      {/* Map legend */}
      <div className="absolute bottom-8 right-4 z-10 bg-gray-900 bg-opacity-90 rounded-lg p-3 text-xs text-gray-300 space-y-1.5">
        <div className="text-gray-400 font-medium mb-2">Saavutettavuus</div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-sm" style={{ background: 'rgba(59, 130, 246, 0.5)' }} />
          <span>Kävellen (5–15 min)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-sm" style={{ background: 'rgba(34, 197, 94, 0.35)' }} />
          <span>Autolla (5–15 min)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500 border border-white" />
          <span>Kilpailijat (kahvilat)</span>
        </div>
      </div>
    </div>
  );
}
