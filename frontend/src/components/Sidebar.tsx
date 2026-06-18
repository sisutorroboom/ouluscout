import { useState, useMemo } from 'react';
import type { Location, AnalysisWeights, ScoreBreakdown } from '../types';
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

type BadgeType = 'paras' | 'kallis' | 'kasvava';

const BADGE_CONFIG: Record<BadgeType, { label: string; icon: string; className: string }> = {
  paras: { label: 'Paras', icon: '⭐', className: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/40' },
  kallis: { label: 'Kallis', icon: '🔥', className: 'bg-orange-500/15 text-orange-400 border-orange-500/40' },
  kasvava: { label: 'Kasvava', icon: '📈', className: 'bg-green-500/15 text-green-400 border-green-500/40' },
};

function getScoreColor(score: number): string {
  if (score >= 70) return '#22c55e';
  if (score >= 40) return '#f59e0b';
  return '#ef4444';
}

function computeBadges(locations: Location[]): Record<string, BadgeType | null> {
  const result: Record<string, BadgeType | null> = {};
  locations.forEach(l => { result[l.id] = null; });

  const loaded = locations.filter(l => l.result && !l.loading);
  if (loaded.length < 2) return result;

  const used = new Set<string>();

  // Paras: highest total score
  const byScore = [...loaded].sort((a, b) => b.result!.score.total - a.result!.score.total);
  if (byScore[0] && !used.has(byScore[0].id)) {
    result[byScore[0].id] = 'paras';
    used.add(byScore[0].id);
  }

  // Kallis: highest rent estimate
  const byRent = [...loaded].sort((a, b) =>
    (b.result!.population.avg_rent_m2 ?? 0) - (a.result!.population.avg_rent_m2 ?? 0)
  );
  if (byRent[0] && !used.has(byRent[0].id)) {
    result[byRent[0].id] = 'kallis';
    used.add(byRent[0].id);
  }

  // Kasvava: highest pedestrian count (or jobs as fallback)
  const byActivity = [...loaded].sort((a, b) => {
    const ap = a.result!.pedestrians.typical_daily ?? (a.result!.population.jobs_count / 10);
    const bp = b.result!.pedestrians.typical_daily ?? (b.result!.population.jobs_count / 10);
    return bp - ap;
  });
  if (byActivity[0] && !used.has(byActivity[0].id)) {
    result[byActivity[0].id] = 'kasvava';
    used.add(byActivity[0].id);
  }

  return result;
}

function computeValueRating(score: number, rentMonthly: number): { label: string; color: string } {
  const ratio = score / (rentMonthly / 100);
  if (ratio >= 7.5 || (score >= 65 && rentMonthly <= 1000)) return { label: 'Hyvä', color: 'text-green-400' };
  if (ratio < 4 || (score < 45 && rentMonthly > 1100)) return { label: 'Heikko', color: 'text-red-400' };
  return { label: 'Kohtalainen', color: 'text-amber-400' };
}

function Spinner({ small = false }: { small?: boolean }) {
  const size = small ? 'w-5 h-5' : 'w-8 h-8';
  return (
    <svg className={`animate-spin ${size} text-blue-500`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4 text-center px-4">
      <div className="text-5xl">📍</div>
      <div>
        <p className="text-gray-300 font-medium">Ei valittua sijaintia</p>
        <p className="text-gray-500 text-sm mt-1">Napsauta kartalta tai hae osoite</p>
      </div>
    </div>
  );
}

function SmallScoreDonut({ score }: { score: number }) {
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = getScoreColor(score);
  return (
    <div className="relative w-16 h-16">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 70 70">
        <circle cx="35" cy="35" r={radius} fill="none" stroke="#374151" strokeWidth="6" />
        <circle cx="35" cy="35" r={radius} fill="none" stroke={color} strokeWidth="6"
          strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xl font-bold" style={{ color }}>{Math.round(score)}</span>
      </div>
    </div>
  );
}

interface LocationCardProps {
  location: Location;
  index: number;
  badge: BadgeType | null;
  isActive: boolean;
  isCompact: boolean;
  onActivate: () => void;
  onRemove: () => void;
}

function LocationCard({ location, index, badge, isActive, isCompact, onActivate, onRemove }: LocationCardProps) {
  const score = location.result?.score;
  const pop = location.result?.population;
  const rentMonthly = pop?.avg_rent_m2 != null ? Math.round(pop.avg_rent_m2 * 60) : null;
  const valueRating = score && rentMonthly ? computeValueRating(score.total, rentMonthly) : null;

  return (
    <div
      className={`rounded-xl border cursor-pointer transition-all duration-200 ${
        isActive
          ? 'bg-gray-700/50 border-blue-500/60 shadow-lg shadow-blue-500/10'
          : 'bg-gray-800 border-gray-700 hover:border-gray-500'
      }`}
      onClick={onActivate}
      style={{ padding: isCompact ? '10px' : '14px' }}
    >
      {/* Top row: badge + remove */}
      <div className="flex items-start justify-between mb-1.5">
        {badge ? (
          <span className={`text-xs px-1.5 py-0.5 rounded-md border flex items-center gap-0.5 ${BADGE_CONFIG[badge].className}`}>
            <span className="text-xs">{BADGE_CONFIG[badge].icon}</span>
            <span className="font-medium">{BADGE_CONFIG[badge].label}</span>
          </span>
        ) : (
          <span className="text-xs font-bold text-gray-600 mt-0.5">{index + 1}</span>
        )}
        <button
          onClick={e => { e.stopPropagation(); onRemove(); }}
          className="text-gray-600 hover:text-red-400 transition-colors ml-1"
          title="Poista"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Location label */}
      <p className="text-xs text-gray-400 truncate mb-2" title={location.label}>
        {location.label}
      </p>

      {/* Score area */}
      {location.loading ? (
        <div className="flex flex-col items-center py-3 gap-2">
          <Spinner small />
          <span className="text-xs text-gray-500">Ladataan...</span>
        </div>
      ) : location.error ? (
        <div className="text-xs text-red-400 text-center py-3">Virhe</div>
      ) : score ? (
        <div className="flex flex-col items-center gap-0.5">
          <SmallScoreDonut score={score.total} />
          <span className="text-xs text-gray-600">/ 100</span>
        </div>
      ) : (
        <div className="h-16 flex items-center justify-center">
          <span className="text-xs text-gray-600">–</span>
        </div>
      )}

      {/* Rent estimate */}
      {rentMonthly != null && !isCompact && (
        <div className="mt-2 pt-2 border-t border-gray-700/60 text-center">
          <div className="text-xs text-gray-500 mb-0.5">Vuokra-arvio</div>
          <div className="text-sm font-semibold text-white">{rentMonthly.toLocaleString('fi-FI')} €<span className="text-xs font-normal text-gray-400">/kk</span></div>
        </div>
      )}
      {rentMonthly != null && isCompact && (
        <div className="mt-1.5 text-center">
          <div className="text-xs text-gray-300 font-medium">{rentMonthly.toLocaleString('fi-FI')} €/kk</div>
        </div>
      )}

      {/* Value rating */}
      {valueRating && !isCompact && (
        <div className="text-center mt-1">
          <div className="text-xs text-gray-500">Potentiaali/vuokra</div>
          <div className={`text-xs font-semibold ${valueRating.color}`}>{valueRating.label}</div>
        </div>
      )}
    </div>
  );
}

const FACTORS: { key: keyof ScoreBreakdown; label: string; icon: string; color: string }[] = [
  { key: 'pedestrians', label: 'Jalankulkijat', icon: '🚶', color: '#60a5fa' },
  { key: 'traffic', label: 'Liikenne', icon: '🚗', color: '#34d399' },
  { key: 'population', label: 'Väestö', icon: '👥', color: '#a78bfa' },
  { key: 'competition', label: 'Kilpailijat', icon: '☕', color: '#fb923c' },
  { key: 'income', label: 'Tulotaso', icon: '💰', color: '#fbbf24' },
  { key: 'jobs', label: 'Työpaikat', icon: '💼', color: '#38bdf8' },
];

function FactorComparison({ location }: { location: Location }) {
  if (!location.result) return null;
  const { score } = location.result;

  return (
    <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Tekijöiden vertailu</p>
      <p className="text-sm font-semibold text-gray-200 mb-4 truncate">{location.label}</p>
      <div className="space-y-3">
        {FACTORS.map(f => {
          const val = (score[f.key] as number) ?? 0;
          return (
            <div key={f.key} className="flex items-center gap-2">
              <span className="text-base w-5 flex-shrink-0">{f.icon}</span>
              <span className="text-xs text-gray-400 w-28 flex-shrink-0">{f.label}</span>
              <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${Math.min(100, val)}%`, background: f.color }}
                />
              </div>
              <span className="text-xs font-mono w-7 text-right flex-shrink-0" style={{ color: f.color }}>
                {Math.round(val)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RaporttiTab({ location }: { location: Location | null }) {
  if (!location?.result) return <EmptyState />;
  const { score, population, traffic, cafes, pedestrians } = location.result;

  const lines: string[] = [
    `Kokonaispistemäärä: ${Math.round(score.total)} / 100`,
    `Väestö (15 min kävely): ${population.total_population.toLocaleString('fi-FI')} henkilöä`,
    `Medianitulo alueella: ${population.median_income != null ? population.median_income.toLocaleString('fi-FI') + ' €/v' : '–'}`,
    `Kahvilakilpailijat 1 km: ${cafes.count_1km} kpl`,
    `Jalankulkijoita/vrk: ${pedestrians.typical_daily != null ? pedestrians.typical_daily.toLocaleString('fi-FI') : '–'}`,
    `Ajoneuvoliikenne (KVL): ${traffic.kvl_value != null ? traffic.kvl_value.toLocaleString('fi-FI') + ' ajoneuvoa/vrk' : '–'}`,
    population.avg_rent_m2 != null ? `Vuokra-arvio (60 m²): ${Math.round(population.avg_rent_m2 * 60).toLocaleString('fi-FI')} €/kk` : '',
  ].filter(Boolean);

  return (
    <div className="px-4 py-4">
      <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 space-y-2">
        <p className="text-sm font-semibold text-gray-200 mb-3">Sijaintiraportti</p>
        {lines.map((line, i) => (
          <p key={i} className="text-xs text-gray-300 flex items-start gap-2">
            <span className="text-gray-600 mt-0.5">•</span>
            <span>{line}</span>
          </p>
        ))}
      </div>
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
  const [activeTab, setActiveTab] = useState<'vertailu' | 'pisteet' | 'raportti'>('vertailu');

  const badges = useMemo(() => computeBadges(locations), [locations]);

  const activeLoc = locations.find(l => l.id === activeLocationId) ?? locations[0] ?? null;

  const isCompact = locations.length === 3;

  const tabs = [
    { id: 'vertailu' as const, label: 'Vertailu' },
    { id: 'pisteet' as const, label: 'Pisteet' },
    { id: 'raportti' as const, label: 'Raportti' },
  ];

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* ── Header ── */}
      <div className="px-5 pt-5 pb-3 flex-shrink-0">
        <p className="text-xs font-semibold uppercase tracking-widest text-blue-400 mb-0.5">
          Sijainnin pisteytys
        </p>
        <div className="flex items-end justify-between">
          <h1 className="text-xl font-bold text-white tracking-tight">Vertaile sijainteja</h1>
          {locations.length < 3 && (
            <span className="text-xs text-gray-500 mb-0.5">Enintään 3</span>
          )}
        </div>
      </div>

      {/* ── Search ── */}
      <div className="px-4 pb-3 flex-shrink-0">
        <AddressSearch onSelect={onLocationSelect} />
      </div>

      {/* ── Tab bar ── */}
      <div className="px-4 flex-shrink-0 border-b border-gray-700/60 mb-0">
        <div className="flex gap-0">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto">
        {/* ════ VERTAILU TAB ════ */}
        {activeTab === 'vertailu' && (
          <div>
            {locations.length === 0 ? (
              <EmptyState />
            ) : (
              <>
                {/* Location cards */}
                <div className="px-4 pt-4 pb-2">
                  <div
                    className={`grid gap-2.5 ${
                      locations.length === 1
                        ? 'grid-cols-1 max-w-xs mx-auto'
                        : locations.length === 2
                        ? 'grid-cols-2'
                        : 'grid-cols-3'
                    }`}
                  >
                    {locations.map((loc, idx) => (
                      <LocationCard
                        key={loc.id}
                        location={loc}
                        index={idx}
                        badge={badges[loc.id]}
                        isActive={loc.id === activeLocationId}
                        isCompact={isCompact}
                        onActivate={() => onLocationActivate(loc.id)}
                        onRemove={() => onLocationRemove(loc.id)}
                      />
                    ))}
                  </div>
                </div>

                {/* Factor comparison */}
                {activeLoc?.result && (
                  <div className="px-4 pb-3">
                    <FactorComparison location={activeLoc} />
                  </div>
                )}

                {/* Weights accordion */}
                <div className="px-4 pb-4 border-t border-gray-700/60 pt-3">
                  <button
                    onClick={onToggleWeights}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                      showWeights
                        ? 'bg-blue-600/15 text-blue-400 border border-blue-600/30'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700/80 border border-gray-700'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                      </svg>
                      Säädä painotuksia
                    </span>
                    <svg className={`w-4 h-4 transition-transform ${showWeights ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {showWeights && (
                    <div className="mt-2">
                      <WeightsPanel weights={weights} onChange={onWeightsChange} />
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ════ PISTEET TAB ════ */}
        {activeTab === 'pisteet' && (
          <div>
            {!activeLoc ? (
              <EmptyState />
            ) : activeLoc.loading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Spinner />
                <p className="text-gray-400 text-sm">Analysoidaan...</p>
              </div>
            ) : activeLoc.error ? (
              <div className="mx-4 my-4 bg-red-900/30 border border-red-700/50 rounded-lg p-4">
                <p className="text-red-400 text-sm font-medium">Analyysivirhe</p>
                <p className="text-red-300 text-xs mt-1">{activeLoc.error}</p>
              </div>
            ) : activeLoc.result ? (
              <div className="px-4 py-4 space-y-4">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span>{activeLoc.lat.toFixed(5)}, {activeLoc.lon.toFixed(5)}</span>
                </div>
                <ScoreCard score={activeLoc.result.score} />
                <ModuleCards
                  traffic={activeLoc.result.traffic}
                  population={activeLoc.result.population}
                  cafes={activeLoc.result.cafes}
                  transit={activeLoc.result.transit}
                  pedestrians={activeLoc.result.pedestrians}
                />
              </div>
            ) : null}
          </div>
        )}

        {/* ════ RAPORTTI TAB ════ */}
        {activeTab === 'raportti' && (
          <RaporttiTab location={activeLoc} />
        )}
      </div>

      {/* ── Footer ── */}
      <div className="px-4 py-2 border-t border-gray-700/60 flex-shrink-0">
        <p className="text-xs text-gray-700 text-center">OuluScout · Sijaintianalyysi Ouluun</p>
      </div>
    </div>
  );
}
