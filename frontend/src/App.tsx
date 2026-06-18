import { useState, useCallback } from 'react';
import type { Location, AnalysisWeights } from './types';
import { analyze } from './api';
import MapComponent from './components/MapComponent';
import Sidebar from './components/Sidebar';

const DEFAULT_WEIGHTS: AnalysisWeights = {
  traffic: 20,
  population: 20,
  jobs: 15,
  income: 15,
  competition: 15,
  transit: 15,
};

let locationCounter = 0;

function generateId(): string {
  return `loc-${++locationCounter}-${Date.now()}`;
}

export default function App() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [activeLocationId, setActiveLocationId] = useState<string | null>(null);
  const [weights, setWeights] = useState<AnalysisWeights>(DEFAULT_WEIGHTS);
  const [showWeights, setShowWeights] = useState(false);
  const [maxLocationsWarning, setMaxLocationsWarning] = useState(false);

  const handleLocationSelect = useCallback(async (lat: number, lon: number) => {
    if (locations.length >= 3) {
      setMaxLocationsWarning(true);
      setTimeout(() => setMaxLocationsWarning(false), 3000);
      return;
    }

    const id = generateId();
    const label = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;

    const newLocation: Location = {
      id,
      lat,
      lon,
      label,
      loading: true,
    };

    setLocations(prev => [...prev, newLocation]);
    setActiveLocationId(id);

    try {
      const result = await analyze(lat, lon, weights);
      setLocations(prev =>
        prev.map(loc =>
          loc.id === id
            ? { ...loc, loading: false, result, label: `${lat.toFixed(4)}, ${lon.toFixed(4)}` }
            : loc
        )
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Tuntematon virhe';
      setLocations(prev =>
        prev.map(loc =>
          loc.id === id ? { ...loc, loading: false, error: message } : loc
        )
      );
    }
  }, [locations.length, weights]);

  const handleLocationRemove = useCallback((id: string) => {
    setLocations(prev => {
      const next = prev.filter(loc => loc.id !== id);
      return next;
    });
    setActiveLocationId(prev => {
      if (prev !== id) return prev;
      const remaining = locations.filter(loc => loc.id !== id);
      return remaining.length > 0 ? remaining[remaining.length - 1].id : null;
    });
  }, [locations]);

  const handleWeightsChange = useCallback((newWeights: AnalysisWeights) => {
    setWeights(newWeights);
  }, []);

  const handleToggleWeights = useCallback(() => {
    setShowWeights(prev => !prev);
  }, []);

  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden">
      {/* Map area */}
      <div className="flex-1 relative">
        <MapComponent
          locations={locations}
          activeLocationId={activeLocationId}
          onLocationSelect={handleLocationSelect}
          onLocationActivate={setActiveLocationId}
        />

        {/* Max locations warning */}
        {maxLocationsWarning && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-amber-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm font-medium animate-pulse">
            Voit vertailla enintään 3 sijaintia
          </div>
        )}
      </div>

      {/* Sidebar */}
      <div className="w-96 flex flex-col bg-gray-900 border-l border-gray-700 overflow-hidden">
        <Sidebar
          locations={locations}
          activeLocationId={activeLocationId}
          weights={weights}
          showWeights={showWeights}
          onLocationSelect={handleLocationSelect}
          onLocationActivate={setActiveLocationId}
          onLocationRemove={handleLocationRemove}
          onWeightsChange={handleWeightsChange}
          onToggleWeights={handleToggleWeights}
        />
      </div>
    </div>
  );
}
