import type { TrafficResult, PopulationResult, CafeResult, TransitResult, PedestrianResult } from '../types';

// ---- Shared card wrapper ----
function Card({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        <h3 className="text-sm font-semibold text-gray-200">{title}</h3>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function DataRow({ label, value, muted }: { label: string; value: React.ReactNode; muted?: boolean }) {
  return (
    <div className="flex justify-between items-start gap-2">
      <span className="text-xs text-gray-500 flex-shrink-0">{label}</span>
      <span className={`text-xs text-right ${muted ? 'text-gray-500 italic' : 'text-gray-200'}`}>
        {value}
      </span>
    </div>
  );
}

function Note({ text }: { text: string }) {
  if (!text) return null;
  return (
    <p className="text-xs text-amber-400 bg-amber-400/10 rounded px-2 py-1.5 mt-1">
      {text}
    </p>
  );
}

function formatNum(n: number | null | undefined, unit = ''): string {
  if (n == null) return '–';
  return `${n.toLocaleString('fi-FI')}${unit}`;
}

// ---- Traffic Card ----
export function TrafficCard({ data }: { data: TrafficResult }) {
  return (
    <Card icon="🚗" title="Liikenne">
      <DataRow
        label="KVL-arvo"
        value={data.kvl_value != null ? formatNum(data.kvl_value, ' ajoneuvoa/vrk') : '–'}
      />
      <DataRow
        label="Laskenta-asema"
        value={data.station_name ?? '–'}
      />
      <DataRow
        label="Etäisyys asemalle"
        value={data.distance_m != null ? formatNum(data.distance_m, ' m') : '–'}
      />
      {data.note && <Note text={data.note} />}
    </Card>
  );
}

// ---- Population Card ----
export function PopulationCard({ data }: { data: PopulationResult }) {
  const ageGroups = [
    { label: '0–14', value: data.age_0_14, color: '#60a5fa' },
    { label: '15–24', value: data.age_15_24, color: '#34d399' },
    { label: '25–64', value: data.age_25_64, color: '#a78bfa' },
    { label: '65+', value: data.age_65_plus, color: '#f87171' },
  ];

  return (
    <Card icon="👥" title="Väestö (15 min kävely)">
      <DataRow
        label="Väestö alueella"
        value={<span className="font-medium text-blue-400">{formatNum(data.total_population)} henkilöä</span>}
      />
      <DataRow
        label="Medianitulo"
        value={data.median_income != null ? formatNum(data.median_income, ' €/v') : '–'}
      />
      <DataRow
        label="Työpaikat"
        value={formatNum(data.jobs_count, ' kpl')}
      />

      {/* Age distribution */}
      <div className="mt-2">
        <p className="text-xs text-gray-500 mb-2">Ikärakenne</p>
        <div className="flex gap-1 h-16 items-end">
          {ageGroups.map(group => {
            // group.value is a fraction 0–1 (e.g. 0.15 = 15%)
            const pct = group.value * 100;
            return (
              <div key={group.label} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-xs text-gray-400">{Math.round(pct)}%</span>
                <div
                  className="w-full rounded-t transition-all duration-500"
                  style={{
                    height: `${Math.max(4, pct * 0.8)}px`,
                    background: group.color,
                    opacity: 0.8,
                  }}
                />
                <span className="text-xs text-gray-500">{group.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {data.area_name && (
        <DataRow label="Postinumeroalue" value={data.area_name} />
      )}
      {data.avg_rent_m2 != null && (
        <DataRow
          label="Vuokra-arvio (60m²)"
          value={<span className="text-amber-400">{Math.round(data.avg_rent_m2 * 60).toLocaleString('fi-FI')} €/kk</span>}
        />
      )}

      {data.data_source && (
        <p className="text-xs text-gray-600 mt-1">Lähde: {data.data_source}</p>
      )}
    </Card>
  );
}

// ---- Cafes Card ----
export function CafesCard({ data }: { data: CafeResult }) {
  const topCafes = data.cafes?.slice(0, 5) ?? [];

  return (
    <Card icon="☕" title="Kahvilat ja kilpailijat">
      <div className="grid grid-cols-3 gap-2 py-1">
        <div className="bg-gray-700/50 rounded p-2 text-center">
          <div className="text-lg font-bold text-white">{data.count_500m}</div>
          <div className="text-xs text-gray-500 mt-0.5">500 m</div>
        </div>
        <div className="bg-gray-700/50 rounded p-2 text-center">
          <div className="text-lg font-bold text-white">{data.count_1km}</div>
          <div className="text-xs text-gray-500 mt-0.5">1 km</div>
        </div>
        <div className="bg-gray-700/50 rounded p-2 text-center">
          <div className="text-lg font-bold text-white">{data.count_isochrone}</div>
          <div className="text-xs text-gray-500 mt-0.5">Iso (15 min)</div>
        </div>
      </div>

      {data.nearest_m != null && (
        <DataRow
          label="Lähin kilpailija"
          value={<span className="text-amber-400">{formatNum(data.nearest_m, ' m')}</span>}
        />
      )}

      {topCafes.length > 0 && (
        <div className="mt-1">
          <p className="text-xs text-gray-500 mb-1.5">Lähimmät kilpailijat</p>
          <div className="space-y-1.5">
            {topCafes.map((cafe, i) => (
              <div key={i} className="flex justify-between items-center text-xs">
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                  <span className="text-gray-300 truncate">{cafe.name}</span>
                </div>
                <span className="text-gray-500 flex-shrink-0 ml-2">{formatNum(Math.round(cafe.distance_m), ' m')}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {data.note && <Note text={data.note} />}
    </Card>
  );
}

// ---- Transit Card ----
export function TransitCard({ data }: { data: TransitResult }) {
  return (
    <Card icon="🚌" title="Julkinen liikenne">
      <DataRow
        label="Lähin pysäkki"
        value={data.nearest_stop ?? '–'}
      />
      <DataRow
        label="Etäisyys"
        value={data.distance_m != null ? formatNum(data.distance_m, ' m') : '–'}
      />
      {data.routes && data.routes.length > 0 && (
        <div className="flex items-start gap-2">
          <span className="text-xs text-gray-500 flex-shrink-0 pt-0.5">Linjat</span>
          <div className="flex flex-wrap gap-1">
            {data.routes.map((route, i) => (
              <span
                key={i}
                className="text-xs bg-blue-600/30 text-blue-300 border border-blue-600/40 rounded px-1.5 py-0.5"
              >
                {route}
              </span>
            ))}
          </div>
        </div>
      )}
      {data.note && <Note text={data.note} />}
    </Card>
  );
}

// ---- Pedestrians Card ----
export function PedestriansCard({ data }: { data: PedestrianResult }) {
  return (
    <Card icon="🚶" title="Jalankulkijat">
      <DataRow
        label="Laskenta-asema"
        value={data.station_name ?? '–'}
      />
      <DataRow
        label="Etäisyys"
        value={data.distance_m != null ? formatNum(data.distance_m, ' m') : '–'}
      />
      <DataRow
        label="Tyypillinen vrk-määrä"
        value={
          data.typical_daily != null
            ? <span className="text-green-400">{formatNum(data.typical_daily, ' henkilöä/vrk')}</span>
            : '–'
        }
      />
      {data.note && <Note text={data.note} />}
    </Card>
  );
}

// ---- All module cards together ----
interface ModuleCardsProps {
  traffic: TrafficResult;
  population: PopulationResult;
  cafes: CafeResult;
  transit: TransitResult;
  pedestrians: PedestrianResult;
}

export default function ModuleCards({ traffic, population, cafes, transit, pedestrians }: ModuleCardsProps) {
  return (
    <div className="space-y-3">
      <PopulationCard data={population} />
      <CafesCard data={cafes} />
      <TrafficCard data={traffic} />
      <TransitCard data={transit} />
      <PedestriansCard data={pedestrians} />
    </div>
  );
}
