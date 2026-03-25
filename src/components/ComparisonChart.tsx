import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts';
import { ComparisonDataPoint, ComparisonSeriesDefinition } from '../types/retirement';
import { formatCurrency } from '../lib/formatters';

interface ComparisonChartProps {
  title: string;
  subtitle: string;
  data: ComparisonDataPoint[];
  series: ComparisonSeriesDefinition[];
  visibleLines: Record<string, boolean>;
  onToggleLine: (key: string) => void;
  onShowAll: () => void;
  yAxisLabel: string;
}

function ComparisonTooltip({
  active,
  label,
  payload,
  seriesMap,
}: TooltipProps<number, string> & { seriesMap: Map<string, ComparisonSeriesDefinition> }) {
  if (!active || !payload || payload.length === 0) return null;

  const rows = payload
    .filter(entry => entry.dataKey && typeof entry.value === 'number')
    .map(entry => {
      const dataKey = String(entry.dataKey);
      const definition = seriesMap.get(dataKey);
      return {
        key: dataKey,
        label: definition?.label ?? dataKey,
        color: definition?.color ?? entry.color ?? '#111827',
        value: Number(entry.value ?? 0),
      };
    })
    .sort((left, right) => right.value - left.value);

  return (
    <div className="min-w-[280px] rounded-xl border border-gray-200 bg-white/95 px-4 py-3 shadow-xl backdrop-blur-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Age {label}</p>
      <div className="mt-3 space-y-2">
        {rows.map(row => (
          <div key={row.key} className="flex items-center justify-between gap-4 text-sm">
            <div className="flex min-w-0 items-center gap-2">
              <span className="h-0.5 w-5 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
              <span className="truncate text-gray-700">{row.label}</span>
            </div>
            <span className="font-semibold text-gray-900">{formatCurrency(row.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ComparisonChart({
  title,
  subtitle,
  data,
  series,
  visibleLines,
  onToggleLine,
  onShowAll,
  yAxisLabel,
}: ComparisonChartProps) {
  const activeSeries = series.filter(item => visibleLines[item.key] !== false);
  const seriesMap = new Map(series.map(item => [item.key, item]));
  const hasHiddenSeries = series.some(item => visibleLines[item.key] === false);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {series.map(item => {
          const isVisible = visibleLines[item.key] !== false;
          return (
            <label
              key={item.key}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                isVisible ? 'border-gray-300 bg-white text-gray-800' : 'border-gray-200 bg-gray-50 text-gray-400'
              }`}
            >
              <input
                type="checkbox"
                checked={isVisible}
                onChange={() => onToggleLine(item.key)}
                className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="h-0.5 w-5 rounded-full" style={{ backgroundColor: item.color }} />
              <span>{item.label}</span>
            </label>
          );
        })}
        {hasHiddenSeries && (
          <button
            type="button"
            onClick={onShowAll}
            className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100"
          >
            Show All
          </button>
        )}
      </div>

      <div className="mt-5 h-[420px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 12, right: 18, bottom: 16, left: 8 }}>
            <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
            <XAxis
              dataKey="age"
              tick={{ fill: '#6b7280', fontSize: 12 }}
              label={{ value: 'Age', position: 'insideBottom', offset: -6 }}
            />
            <YAxis
              tick={{ fill: '#6b7280', fontSize: 12 }}
              tickFormatter={(value) => `$${Math.round(Number(value) / 1000)}k`}
              label={{ value: yAxisLabel, angle: -90, position: 'insideLeft' }}
            />
            <Tooltip content={<ComparisonTooltip seriesMap={seriesMap} />} />
            {activeSeries.map(item => (
              <Line
                key={item.key}
                type="monotone"
                dataKey={item.key}
                name={item.label}
                stroke={item.color}
                strokeWidth={2.5}
                strokeDasharray={item.strokeDasharray}
                dot={false}
                activeDot={{ r: 5 }}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}