import type { AnalysisWeights } from '../types';

interface WeightsPanelProps {
  weights: AnalysisWeights;
  onChange: (weights: AnalysisWeights) => void;
}

const DEFAULT_WEIGHTS: AnalysisWeights = {
  traffic: 30,
  population: 25,
  jobs: 15,
  income: 10,
  competition: 20,
};

const WEIGHT_LABELS: Record<keyof AnalysisWeights, string> = {
  traffic: 'Liikenne',
  population: 'Väestö',
  jobs: 'Työpaikat',
  income: 'Tulotaso',
  competition: 'Kilpailu',
};

const WEIGHT_KEYS = Object.keys(DEFAULT_WEIGHTS) as (keyof AnalysisWeights)[];

export default function WeightsPanel({ weights, onChange }: WeightsPanelProps) {
  const total = WEIGHT_KEYS.reduce((sum, k) => sum + weights[k], 0);

  const handleChange = (key: keyof AnalysisWeights, newVal: number) => {
    const oldVal = weights[key];
    const diff = newVal - oldVal;
    if (diff === 0) return;

    // Adjust others proportionally
    const others = WEIGHT_KEYS.filter(k => k !== key);
    const otherTotal = others.reduce((s, k) => s + weights[k], 0);

    let newWeights = { ...weights, [key]: newVal };

    if (otherTotal === 0) {
      // Distribute equally among others
      const share = Math.round((100 - newVal) / others.length);
      others.forEach((k, i) => {
        newWeights[k] = i === others.length - 1
          ? 100 - newVal - share * (others.length - 1)
          : share;
      });
    } else {
      // Proportional distribution
      const remaining = 100 - newVal;
      let allocated = 0;
      others.forEach((k, i) => {
        if (i === others.length - 1) {
          newWeights[k] = Math.max(0, remaining - allocated);
        } else {
          const proportion = weights[k] / otherTotal;
          const alloc = Math.max(0, Math.round(proportion * remaining));
          newWeights[k] = alloc;
          allocated += alloc;
        }
      });
    }

    // Clamp all to 0-100
    WEIGHT_KEYS.forEach(k => {
      newWeights[k] = Math.max(0, Math.min(100, newWeights[k]));
    });

    onChange(newWeights);
  };

  const handleReset = () => {
    onChange({ ...DEFAULT_WEIGHTS });
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-400">
          Yhteensä: <span className={total !== 100 ? 'text-amber-400' : 'text-green-400'}>{total}%</span>
        </span>
        <button
          onClick={handleReset}
          className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
        >
          Palauta oletuksiin
        </button>
      </div>

      {WEIGHT_KEYS.map(key => (
        <div key={key} className="space-y-1">
          <div className="flex justify-between items-center">
            <label className="text-sm text-gray-300">{WEIGHT_LABELS[key]}</label>
            <span className="text-sm font-mono text-blue-400 w-8 text-right">{weights[key]}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={weights[key]}
            onChange={e => handleChange(key, Number(e.target.value))}
            className="w-full h-1.5 bg-gray-600 rounded-full appearance-none cursor-pointer accent-blue-500"
          />
        </div>
      ))}

      {total !== 100 && (
        <p className="text-xs text-amber-400 mt-2">
          Painotukset eivät ole tasapainossa. Kokonaissumma on {total}%.
        </p>
      )}
    </div>
  );
}
