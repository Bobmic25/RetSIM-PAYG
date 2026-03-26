import { X } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { formatCurrency } from '../lib/formatters';

export interface PortfolioSlice {
  label: string;
  value: number;
  color: string;
}

interface PortfolioBreakdownModalProps {
  title: string;
  subtitle: string;
  slices: PortfolioSlice[];
  total: number;
  onClose: () => void;
}

const RADIAN = Math.PI / 180;

function renderCustomLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }: {
  cx?: number;
  cy?: number;
  midAngle?: number;
  innerRadius?: number;
  outerRadius?: number;
  percent?: number;
}) {
  if (
    cx == null ||
    cy == null ||
    midAngle == null ||
    innerRadius == null ||
    outerRadius == null ||
    percent == null
  ) {
    return null;
  }
  if (percent < 0.04) return null;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.55;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={600}>
      {`${(percent * 100).toFixed(1)}%`}
    </text>
  );
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: PortfolioSlice }> }) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-4 py-3 min-w-[180px]">
      <p className="text-sm font-semibold text-gray-800 mb-1">{item.label}</p>
      <p className="text-base font-bold text-gray-900">{formatCurrency(item.value)}</p>
    </div>
  );
}

export default function PortfolioBreakdownModal({
  title,
  subtitle,
  slices,
  total,
  onClose,
}: PortfolioBreakdownModalProps) {
  const activeSlices = slices.filter(s => s.value > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{title}</h2>
            <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>
          </div>
          <button
            onClick={onClose}
            className="ml-4 p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5">
          {activeSlices.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <p className="text-sm">No account balances to display.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-center mb-1">
                <div className="text-center">
                  <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Total Portfolio</p>
                  <p className="text-2xl font-bold text-gray-900 mt-0.5">{formatCurrency(total)}</p>
                </div>
              </div>

              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={activeSlices}
                      dataKey="value"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      innerRadius={40}
                      labelLine={false}
                      label={renderCustomLabel}
                    >
                      {activeSlices.map((slice, index) => (
                        <Cell key={index} fill={slice.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                    <Legend
                      formatter={(value) => (
                        <span className="text-xs text-gray-600 font-medium">{value}</span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-4 space-y-2">
                {activeSlices.map((slice, i) => {
                  const pct = total > 0 ? (slice.value / total) * 100 : 0;
                  return (
                    <div key={i} className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50">
                      <div className="flex items-center gap-2.5">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: slice.color }} />
                        <span className="text-sm font-medium text-gray-700">{slice.label}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-400 font-medium w-12 text-right">{pct.toFixed(1)}%</span>
                        <span className="text-sm font-semibold text-gray-900 w-28 text-right">{formatCurrency(slice.value)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
