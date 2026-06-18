import type { ScoreBreakdown } from '../types';

interface ScoreCardProps {
  score: ScoreBreakdown;
}

const SCORE_LABELS: Record<keyof Omit<ScoreBreakdown, 'total'>, string> = {
  traffic: 'Liikenne',
  population: 'Väestö',
  jobs: 'Työpaikat',
  income: 'Tulotaso',
  competition: 'Kilpailu',
  transit: 'Saavutettavuus',
};

const SCORE_KEYS = Object.keys(SCORE_LABELS) as (keyof Omit<ScoreBreakdown, 'total'>)[];

function getScoreColor(score: number): string {
  if (score >= 70) return '#22c55e'; // green
  if (score >= 40) return '#f59e0b'; // yellow/amber
  return '#ef4444'; // red
}

function getScoreLabel(score: number): string {
  if (score >= 70) return 'Hyvä';
  if (score >= 40) return 'Kohtalainen';
  return 'Heikko';
}

function CircularScore({ score }: { score: number }) {
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = getScoreColor(score);

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-28 h-28">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          {/* Background circle */}
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke="#374151"
            strokeWidth="8"
          />
          {/* Progress circle */}
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.5s ease' }}
          />
        </svg>
        {/* Score text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold" style={{ color }}>
            {Math.round(score)}
          </span>
          <span className="text-xs text-gray-400">/100</span>
        </div>
      </div>
      <div className="mt-1 text-sm font-medium" style={{ color }}>
        {getScoreLabel(score)}
      </div>
    </div>
  );
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  const color = getScoreColor(score);
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <span className="text-xs text-gray-400">{label}</span>
        <span className="text-xs font-mono font-medium" style={{ color }}>
          {Math.round(score)}
        </span>
      </div>
      <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.min(100, score)}%`, background: color }}
        />
      </div>
    </div>
  );
}

export default function ScoreCard({ score }: ScoreCardProps) {
  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <h3 className="text-sm font-semibold text-gray-300 mb-4 uppercase tracking-wide">
        Kokonaisarvio
      </h3>
      <div className="flex flex-col items-center mb-5">
        <CircularScore score={score.total} />
      </div>
      <div className="space-y-2.5">
        {SCORE_KEYS.map(key => (
          <ScoreBar key={key} label={SCORE_LABELS[key]} score={score[key]} />
        ))}
      </div>
    </div>
  );
}
