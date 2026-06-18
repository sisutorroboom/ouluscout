import type { Location, AnalysisWeights } from '../types';
import AddressSearch from './AddressSearch';
import WeightsPanel from './WeightsPanel';
import ScoreCard from './ScoreCard';
import ModuleCards from './ModuleCards';

interface SidebarProps {
  locations: Location[];
  activeLocationId: string | null;
  weights: AnalysisWeights;
  showWeights: boolean;
  onLocationSelect: (lat: number, lon: number) => void;
  onLocationActivate: (id: string) => void;
  onLocationRemove: (id: string) => void;
  onWeightsChange: (weights: AnalysisWeights) => void;
  onToggleWeights: () => void;
}

function Spinner() {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <svg className="animate-spin w-10 h-10 text-blue-500" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      <p className="text-gray-400 text-sm">Analysoidaan sijaintia...</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4 text-center px-4">
      <div className="text-5xl">📍</div>
      <div>
        <p className="text-gray-300 font-medium">Ei valittua sijaintia</p>
        <p className="text-gray-500 text-sm mt-1">
          Napsauta kartalta tai hae osoite
        </p>
      </div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="mx-4 my-4 bg-red-900/30 border border-red-700/50 rounded-lg p-4">
      <p className="text-red-400 text-sm font-medium">Analyysivirhe</p>
      <p className="text-red-300 text-xs mt-1">{message}</p>
    </div>
  );
}

export default function Sidebar({
  locations,
  activeLocationId,
  weights,
  showWeights,
  onLocationSelect,
  onLocationActivate,
  onLocationRemove,
  onWeightsChange,
  onToggleWeights,
}: SidebarProps) {
  const activeLoc = locations.find(l => l.id === activeLocationId) ?? null;

  const handleAddressSelect = (lat: number, lon: number) => {
    onLocationSelect(lat, lon);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-gray-700 flex-shrink-0">
        <div className="flex items-baseline gap-2">
          <h1 className="text-xl font-bold text-white tracking-tight">OuluScout</h1>
          <span className="text-xs text-blue-400 font-medium">Sijaintianalyysi</span>
        </div>
        <p className="text-xs text-gray-500 mt-0.5">
          Oulu, Finland · Enintään 3 sijaintia
        </p>
      </div>

      {/* Search bar */}
      <div className="px-4 py-3 border-b border-gray-700 flex-shrink-0">
        <AddressSearch onSelect={handleAddressSelect} />
      </div>

      {/* Location tabs */}
      {locations.length > 0 && (
        <div className="px-4 py-2 border-b border-gray-700 flex-shrink-0">
          <div className="flex gap-1.5 flex-wrap">
            {locations.map((loc, index) => {
              const isActive = loc.id === activeLocationId;
              return (
                <div
                  key={loc.id}
                  className={`flex items-center gap-1 rounded-md text-xs transition-colors ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  <button
                    onClick={() => onLocationActivate(loc.id)}
                    className="pl-2.5 pr-1 py-1.5 font-medium"
                  >
                    <span className="inline-flex items-center gap-1">
                      <span className={`w-4 h-4 rounded-full text-xs flex items-center justify-center font-bold ${
                        isActive ? 'bg-white/20' : 'bg-gray-600'
                      }`}>
                        {index + 1}
                      </span>
                      Sijainti {index + 1}
                      {loc.loading && (
                        <svg className="animate-spin w-3 h-3 ml-0.5" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      )}
                    </span>
                  </button>
                  <button
                    onClick={() => onLocationRemove(loc.id)}
                    className={`pr-1.5 pl-0.5 py-1.5 hover:text-red-400 transition-colors`}
                    title="Poista sijainti"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Weights toggle */}
      <div className="px-4 py-2 border-b border-gray-700 flex-shrink-0">
        <button
          onClick={onToggleWeights}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
            showWeights
              ? 'bg-blue-600/20 text-blue-400 border border-blue-600/30'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700'
          }`}
        >
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
            Säädä painotuksia
          </span>
          <svg
            className={`w-4 h-4 transition-transform ${showWeights ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto">
        {/* Weights panel */}
        {showWeights && (
          <div className="px-4 py-3 border-b border-gray-700">
            <WeightsPanel weights={weights} onChange={onWeightsChange} />
          </div>
        )}

        {/* Active location info */}
        {!activeLoc && (
          <EmptyState />
        )}

        {activeLoc && activeLoc.loading && (
          <Spinner />
        )}

        {activeLoc && !activeLoc.loading && activeLoc.error && (
          <ErrorState message={activeLoc.error} />
        )}

        {activeLoc && !activeLoc.loading && !activeLoc.error && activeLoc.result && (
          <div className="px-4 py-4 space-y-4">
            {/* Location coordinates */}
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>{activeLoc.lat.toFixed(5)}, {activeLoc.lon.toFixed(5)}</span>
            </div>

            {/* Score */}
            <ScoreCard score={activeLoc.result.score} />

            {/* Module cards */}
            <ModuleCards
              traffic={activeLoc.result.traffic}
              population={activeLoc.result.population}
              cafes={activeLoc.result.cafes}
              transit={activeLoc.result.transit}
              pedestrians={activeLoc.result.pedestrians}
            />
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-gray-700 flex-shrink-0">
        <p className="text-xs text-gray-600 text-center">
          OuluScout · Sijaintianalyysi Ouluun
        </p>
      </div>
    </div>
  );
}
