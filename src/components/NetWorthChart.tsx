import { useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer
} from 'recharts';
import { YearlyProjection, MonteCarloResult } from '../types/retirement';
import { formatCurrency } from '../lib/formatters';
import { presentValue } from '../lib/benefitsEngine';

interface HoverData {
  age: number;
  year: number;
  net_worth: number;
  total_withdrawals: number;
  total_income: number;
  taxable_income: number;
  total_tax: number;
  after_tax_income: number;
}

interface NetWorthChartProps {
  projections: YearlyProjection[];
  monteCarloResult?: MonteCarloResult;
  optimizedProjections?: YearlyProjection[] | null;
  showInflationAdjusted?: boolean;
  inflationRate?: number;
  onHover?: (data: HoverData | null) => void;
}

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="bg-white border border-gray-200 shadow-lg rounded-lg p-3 text-xs space-y-1">
      <p className="font-semibold text-gray-900 mb-1">Age {d.age} — Year {d.year}</p>
      <p className="text-blue-700">Net Worth: {formatCurrency(d.total_balance)}</p>
      {d.rrsp_balance > 0 && <p className="text-gray-600">RRSP: {formatCurrency(d.rrsp_balance)}</p>}
      {d.tfsa_balance > 0 && <p className="text-gray-600">TFSA: {formatCurrency(d.tfsa_balance)}</p>}
      {d.non_reg_balance > 0 && <p className="text-gray-600">Non-Reg: {formatCurrency(d.non_reg_balance)}</p>}
    </div>
  );
};

export default function NetWorthChart({
  projections,
  monteCarloResult,
  optimizedProjections,
  showInflationAdjusted = false,
  inflationRate = 2.5,
  onHover
}: NetWorthChartProps) {
  const [hoveredData, setHoveredData] = useState<HoverData | null>(null);

  if (!projections.length) return null;

  const startYear = projections[0]?.year ?? 0;
  const pv = (v: number, yearIndex: number) =>
    showInflationAdjusted ? presentValue(v, yearIndex, inflationRate) : v;

  const chartData = projections.map((p, i) => {
    const optimizedP = optimizedProjections?.[i];
    return {
      age: p.age,
      year: p.year,
      total_balance: Math.max(0, pv(p.total_balance, i)),
      rrsp_balance: Math.max(0, pv(p.rrsp_balance, i)),
      tfsa_balance: Math.max(0, pv(p.tfsa_balance, i)),
      fhsa_balance: Math.max(0, pv(p.fhsa_balance, i)),
      non_reg_balance: Math.max(0, pv(p.non_reg_balance, i)),
      optimized_balance: optimizedP ? Math.max(0, pv(optimizedP.total_balance, i)) : undefined,
      p10: monteCarloResult ? Math.max(0, pv(monteCarloResult.percentile_10[projections.indexOf(p)]?.total_balance || 0, i)) : undefined,
      p90: monteCarloResult ? Math.max(0, pv(monteCarloResult.percentile_90[projections.indexOf(p)]?.total_balance || 0, i)) : undefined
    };
  });

  const handleMouseMove = (data: any) => {
    if (data?.activePayload?.[0]) {
      const p = projections.find(pr => pr.age === data.activePayload[0].payload.age);
      if (p) {
        const yearIndex = p.year - startYear;
        const hd: HoverData = {
          age: p.age,
          year: p.year,
          net_worth: pv(p.total_balance, yearIndex),
          total_withdrawals: pv(p.total_withdrawals, yearIndex),
          total_income: pv(p.total_income, yearIndex),
          taxable_income: pv(p.salary + p.cpp + p.oas + p.rrsp_withdrawal + p.non_reg_capital_gain_inclusion - (p.rrsp_salary_deduction ?? 0), yearIndex),
          total_tax: pv(p.total_tax, yearIndex),
          after_tax_income: pv(p.after_tax_income, yearIndex),
        };
        setHoveredData(hd);
        onHover?.(hd);
      }
    }
  };

  const handleMouseLeave = () => {
    setHoveredData(null);
    onHover?.(null);
  };

  return (
    <div className="relative">
      <div className="flex gap-4">
        <div className="flex-1">
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart
              data={chartData}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
            >
              <defs>
                <linearGradient id="rrspGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.1} />
                </linearGradient>
                <linearGradient id="tfsaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.1} />
                </linearGradient>
                <linearGradient id="nonRegGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.1} />
                </linearGradient>
                <linearGradient id="fhsaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="age"
                label={{ value: 'Age', position: 'insideBottom', offset: -3, fontSize: 12 }}
                tick={{ fontSize: 11 }}
              />
              <YAxis
                tickFormatter={v => `$${(v / 1000).toFixed(0)}k`}
                tick={{ fontSize: 11 }}
                width={60}
                label={{
                  value: showInflationAdjusted ? "Net Worth (Today's $)" : 'Net Worth ($)',
                  angle: -90,
                  position: 'insideLeft',
                  fontSize: 11,
                }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="rrsp_balance" name="RRSP" stackId="1"
                stroke="#3b82f6" fill="url(#rrspGrad)" strokeWidth={1.5} />
              <Area type="monotone" dataKey="tfsa_balance" name="TFSA" stackId="1"
                stroke="#10b981" fill="url(#tfsaGrad)" strokeWidth={1.5} />
              <Area type="monotone" dataKey="fhsa_balance" name="FHSA" stackId="1"
                stroke="#6366f1" fill="url(#fhsaGrad)" strokeWidth={1.5} />
              <Area type="monotone" dataKey="non_reg_balance" name="Non-Reg" stackId="1"
                stroke="#f59e0b" fill="url(#nonRegGrad)" strokeWidth={1.5} />
              {optimizedProjections && (
                <Area type="monotone" dataKey="optimized_balance" name="Optimized Plan" stackId="2"
                  stroke="#8b5cf6" fill="none" strokeWidth={2.5} strokeDasharray="5 5" />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {hoveredData && (
          <div className="w-52 shrink-0 bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm">
            <p className="font-semibold text-gray-900 mb-3">Age {hoveredData.age}</p>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Net Worth</span>
                <span className="font-semibold text-blue-700">{formatCurrency(hoveredData.net_worth)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Withdrawals</span>
                <span className="font-medium text-gray-800">{formatCurrency(hoveredData.total_withdrawals)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Income</span>
                <span className="font-medium text-gray-800">{formatCurrency(hoveredData.total_income)}</span>
              </div>
              <div className="border-t border-gray-200 pt-2 flex justify-between">
                <span className="text-gray-600">Taxable Inc.</span>
                <span className="font-medium text-gray-800">{formatCurrency(hoveredData.taxable_income)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Total Tax</span>
                <span className="font-medium text-red-600">{formatCurrency(hoveredData.total_tax)}</span>
              </div>
              <div className="flex justify-between border-t border-gray-200 pt-2">
                <span className="text-gray-600">Net Income</span>
                <span className="font-semibold text-green-700">{formatCurrency(hoveredData.after_tax_income)}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {monteCarloResult && (
        <p className="text-xs text-gray-400 mt-1">
          Showing median (50th percentile) projection. Success rate: {monteCarloResult.success_rate.toFixed(1)}%
        </p>
      )}
    </div>
  );
}
