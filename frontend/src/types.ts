export interface AnalysisWeights {
  traffic: number;
  population: number;
  jobs: number;
  income: number;
  competition: number;
  transit: number;
}

export interface IsochroneResult {
  polygons: Record<string, Record<string, number[][]>>;  // profile -> minutes -> coords
}

export interface CafeItem {
  name: string;
  lat: number;
  lon: number;
  distance_m: number;
}

export interface CafeResult {
  count_500m: number;
  count_1km: number;
  count_isochrone: number;
  cafes: CafeItem[];
  nearest_m: number;
}

export interface PopulationResult {
  total_population: number;
  age_0_14: number;
  age_15_24: number;
  age_25_64: number;
  age_65_plus: number;
  median_income: number | null;
  jobs_count: number;
  data_source: string;
}

export interface TrafficResult {
  nearest_count: number | null;
  station_name: string | null;
  distance_m: number | null;
  kvl_value: number | null;
  note: string;
}

export interface PedestrianResult {
  nearest_count: number | null;
  station_name: string | null;
  distance_m: number | null;
  typical_daily: number | null;
  note: string;
}

export interface TransitResult {
  nearest_stop: string | null;
  distance_m: number | null;
  routes: string[];
  note: string;
}

export interface ScoreBreakdown {
  traffic: number;
  population: number;
  jobs: number;
  income: number;
  competition: number;
  transit: number;
  total: number;
}

export interface AnalyzeResponse {
  lat: number;
  lon: number;
  isochrones: IsochroneResult;
  cafes: CafeResult;
  population: PopulationResult;
  traffic: TrafficResult;
  pedestrians: PedestrianResult;
  transit: TransitResult;
  score: ScoreBreakdown;
}

export interface Location {
  id: string;
  lat: number;
  lon: number;
  label: string;
  result?: AnalyzeResponse;
  loading?: boolean;
  error?: string;
}
