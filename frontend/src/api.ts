import type { AnalysisWeights, AnalyzeResponse } from './types';

const BASE = '/api';

export async function geocode(q: string) {
  const res = await fetch(`${BASE}/geocode?q=${encodeURIComponent(q)}`);
  return res.json();
}

export async function analyze(lat: number, lon: number, weights: AnalysisWeights): Promise<AnalyzeResponse> {
  const res = await fetch(`${BASE}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat, lon, weights }),
  });
  if (!res.ok) throw new Error(`Analysis failed: ${res.status}`);
  return res.json() as Promise<AnalyzeResponse>;
}
