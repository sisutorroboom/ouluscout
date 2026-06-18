import { useState, useRef, useEffect, useCallback } from 'react';
import { geocode } from '../api';

interface GeocodeResult {
  lat: number;
  lon: number;
  display_name: string;
}

interface AddressSearchProps {
  onSelect: (lat: number, lon: number, displayName: string) => void;
}

export default function AddressSearch({ onSelect }: AddressSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setOpen(true);
    try {
      const data = await geocode(query);
      if (Array.isArray(data)) {
        setResults(data);
        if (data.length === 0) {
          setError('Ei tuloksia');
        }
      } else {
        setResults([]);
        setError('Ei tuloksia');
      }
    } catch {
      setResults([]);
      setError('Hakuvirhe – tarkista yhteys');
    } finally {
      setLoading(false);
    }
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch();
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const handleSelect = (result: GeocodeResult) => {
    setOpen(false);
    setQuery(result.display_name.split(',')[0]);
    onSelect(result.lat, result.lon, result.display_name);
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Hae osoite Oulusta..."
          className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
        />
        <button
          onClick={handleSearch}
          disabled={loading || !query.trim()}
          className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white px-3 py-2 rounded-lg transition-colors flex items-center justify-center"
          title="Hae"
        >
          {loading ? (
            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          )}
        </button>
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full mt-1 left-0 right-0 z-50 bg-gray-800 border border-gray-600 rounded-lg shadow-xl overflow-hidden max-h-60 overflow-y-auto">
          {error ? (
            <div className="px-3 py-3 text-sm text-gray-400 text-center">{error}</div>
          ) : results.length === 0 && !loading ? (
            <div className="px-3 py-3 text-sm text-gray-400 text-center">Ei tuloksia</div>
          ) : (
            results.map((result, i) => (
              <button
                key={i}
                onClick={() => handleSelect(result)}
                className="w-full text-left px-3 py-2.5 text-sm text-gray-200 hover:bg-gray-700 transition-colors border-b border-gray-700 last:border-0 focus:outline-none focus:bg-gray-700"
              >
                <div className="font-medium truncate">{result.display_name.split(',')[0]}</div>
                <div className="text-gray-500 text-xs truncate mt-0.5">
                  {result.display_name.split(',').slice(1, 3).join(',')}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
