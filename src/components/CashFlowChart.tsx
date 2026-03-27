import { useState } from 'react';
import { ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Text, Line } from 'recharts';
import { YearlyProjection } from '../types/retirement';
import { presentValue } from '../lib/benefitsEngine';

type LegendEntry = {
  color?: string;
  value?: string;
};

interface CashFlowChartProps {
  data: YearlyProjection[];
  showToday: boolean;
  inflationRate?: number;
}

const BAR_SERIES = [
  { dataKey: 'Salary', color: '#3b82f6' },
  { dataKey: 'CPP', color: '#8b5cf6' },
  { dataKey: 'OAS', color: '#ec4899' },
  { dataKey: 'DB Pension', color: '#0ea5e9' },
  { dataKey: 'RRSP Withdrawal', color: '#f59e0b' },
  { dataKey: 'TFSA Withdrawal', color: '#10b981' },
  { dataKey: 'FHSA Withdrawal', color: '#0891b2' },
  { dataKey: 'Non-Reg Withdrawal', color: '#6366f1' },
  { dataKey: 'Inheritance', color: '#14b8a6' },
] as const;

interface CashFlowChartRow {
  age: number;
  grossCashIn: number;
  afterTaxTotal: number;
  Expenses: number;
  'Requested Expenses': number;
  Salary: number;
  CPP: number;
  OAS: number;
  'DB Pension'?: number;
  'RRSP Withdrawal': number;
  'TFSA Withdrawal': number;
  'FHSA Withdrawal'?: number;
  'Non-Reg Withdrawal': number;
  Inheritance: number;
}

function buildChartData(data: YearlyProjection[], showToday: boolean, inflationRate: number) {
  const startYear = data[0]?.year ?? 0;
  return data.map<CashFlowChartRow>((item) => {
    const yearIndex = item.year - startYear;
    const pv = (v: number) => showToday ? presentValue(v, yearIndex, inflationRate) : v;

    const salary = pv(item.salary || 0);
    const cpp = pv(item.cpp || 0);
    const oas = pv(item.oas || 0);
    const dbPension = pv(item.db_pension || 0);
    const rrsp = pv(item.rrsp_withdrawal || 0);
    const tfsa = pv(item.tfsa_withdrawal || 0);
    const fhsa = pv(item.fhsa_withdrawal || 0);
    const nonReg = pv(item.non_reg_withdrawal || 0);
    const inheritance = pv(item.inheritance || 0);
    const expenses = pv(item.total_expenses || 0);
    const requestedExpenses = pv(item.original_requested_expenses || 0);
    const afterTaxIncome = pv(item.after_tax_income || 0);
    const grossCashIn = salary + cpp + oas + dbPension + rrsp + tfsa + fhsa + nonReg + inheritance;

    return {
      age: item.age,
      grossCashIn,
      afterTaxTotal: afterTaxIncome,
      Expenses: expenses,
      'Requested Expenses': requestedExpenses,
      Salary: salary,
      CPP: cpp,
      OAS: oas,
      ...(dbPension > 0 ? { 'DB Pension': dbPension } : {}),
      'RRSP Withdrawal': rrsp,
      'TFSA Withdrawal': tfsa,
      ...(fhsa > 0 ? { 'FHSA Withdrawal': fhsa } : {}),
      'Non-Reg Withdrawal': nonReg,
      Inheritance: inheritance,
    };
  });
}

const COLORS: Record<string, string> = {
  Salary: '#3b82f6',
  CPP: '#8b5cf6',
  OAS: '#ec4899',
  'DB Pension': '#0ea5e9',
  'RRSP Withdrawal': '#f59e0b',
  'TFSA Withdrawal': '#10b981',
  'FHSA Withdrawal': '#0891b2',
  'Non-Reg Withdrawal': '#6366f1',
  Inheritance: '#14b8a6',
  'After-Tax Income': '#111827',
  Expenses: '#dc2626',
  'Requested Expenses': '#f97316',
};

interface CashFlowTooltipEntry {
  name?: string;
  value?: number;
  payload?: CashFlowChartRow;
}

function CustomLegendIcon({ color, dashed }: { color: string; dashed?: boolean }) {
  return (
    <span className="inline-flex w-7 items-center" aria-hidden="true">
      <span
        className="w-7 border-t-2"
        style={{ borderColor: color, borderTopStyle: dashed ? 'dashed' : 'solid' }}
      />
    </span>
  );
}

function CustomTick(props: Record<string, unknown>) {
  const x = props.x as number;
  const y = props.y as number;
  const payload = props.payload as { value: number } | undefined;
  if (!payload) return null;

  return (
    <g>
      <Text x={x} y={y + 12} textAnchor="middle" fill="#6b7280" fontSize={11}>
        {String(payload.value)}
      </Text>
    </g>
  );
}

export default function CashFlowChart({ data, showToday, inflationRate = 2.5 }: CashFlowChartProps) {
  const [showRequestedExpenses, setShowRequestedExpenses] = useState(false);
  const chartData = buildChartData(data, showToday, inflationRate);
  const visibleBarSeries = BAR_SERIES.filter(({ dataKey }) =>
    chartData.some((row) => Number(row[dataKey as keyof typeof row] ?? 0) > 0)
  );

  function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: CashFlowTooltipEntry[]; label?: number | string }) {
    if (!active || !payload || !payload.length) return null;

    const chartRow = payload[0]?.payload;
    const grossCashIn = chartRow?.grossCashIn ?? 0;
    const afterTaxTotal = chartRow?.afterTaxTotal ?? 0;
    const expenses = chartRow?.Expenses ?? 0;
    const requestedExpenses = chartRow?.['Requested Expenses'] ?? 0;
    const payloadItems = payload.filter((entry) => !['After-Tax Income', 'Expenses', 'Original Requested Expenses'].includes(entry.name ?? ''));

    return (
      <div style={{
        background: 'white',
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        padding: '10px 14px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
        minWidth: 220,
      }}>
        <p style={{ fontWeight: 700, color: '#111827', marginBottom: 4 }}>Age {label}</p>
        <div style={{ marginBottom: 8, fontSize: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontWeight: 700, color: '#111827', marginBottom: 2 }}>
            <span>Gross Cash In</span>
            <span>${Math.round(grossCashIn).toLocaleString()}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontWeight: 700, color: COLORS['After-Tax Income'], marginBottom: 2 }}>
            <span>After-Tax Income</span>
            <span>${Math.round(afterTaxTotal).toLocaleString()}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontWeight: 700, color: COLORS.Expenses, marginBottom: showRequestedExpenses ? 2 : 0 }}>
            <span>Expenses</span>
            <span>${Math.round(expenses).toLocaleString()}</span>
          </div>
          {showRequestedExpenses && (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontWeight: 700, color: COLORS['Requested Expenses'] }}>
              <span>Original Requested Expenses</span>
              <span>${Math.round(requestedExpenses).toLocaleString()}</span>
            </div>
          )}
        </div>
        {payloadItems.map((entry) => (
          <div key={entry.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 12, marginBottom: 2 }}>
            <span style={{ color: COLORS[entry.name ?? ''] ?? '#111827' }}>{entry.name}</span>
            <span style={{ color: COLORS[entry.name ?? ''] ?? '#111827' }}>
              ${Math.round(entry.value ?? 0).toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    );
  }

  function CustomLegend({ payload }: { payload?: LegendEntry[] }) {
    return (
      <div className="mb-4 flex flex-wrap items-end gap-x-5 gap-y-2 text-sm text-gray-600">
        {payload?.map((entry) => (
          <div key={entry.value} className="inline-flex flex-col items-center gap-0.5">
            <span>{entry.value}</span>
            <CustomLegendIcon
              color={entry.color ?? '#111827'}
              dashed={entry.value === 'Expenses' || entry.value === 'Original Requested Expenses'}
            />
          </div>
        ))}
        <label className="inline-flex flex-col items-start gap-0.5 text-sm text-gray-600 cursor-pointer">
          <span className="inline-flex items-center gap-1">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
              checked={showRequestedExpenses}
              onChange={(event) => setShowRequestedExpenses(event.target.checked)}
            />
            <span>Original Requested Expenses</span>
          </span>
          <CustomLegendIcon color={COLORS['Requested Expenses']} dashed />
        </label>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-xl font-bold text-gray-900 mb-1">Cash Flow by Year</h3>
      <p className="text-sm text-gray-500 mb-3">Stacked bars show gross cash sources. Lines show after-tax income and projected spending.</p>
      <ResponsiveContainer width="100%" height={440}>
        <ComposedChart data={chartData} margin={{ bottom: 24 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="age"
            height={40}
            tick={CustomTick}
            label={{ value: 'Age', position: 'insideBottom', offset: -4 }}
          />
          <YAxis
            label={{
              value: showToday ? "Cash Flow (Today's $)" : 'Cash Flow ($)',
              angle: -90,
              position: 'insideLeft',
            }}
            tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend verticalAlign="top" align="left" content={<CustomLegend />} />
          {visibleBarSeries.map(({ dataKey, color }) => (
            <Bar key={dataKey} dataKey={dataKey} stackId="a" fill={color} />
          ))}
          <Line
            type="monotone"
            dataKey="afterTaxTotal"
            name="After-Tax Income"
            stroke="#111827"
            strokeWidth={3}
            dot={false}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="Expenses"
            name="Expenses"
            stroke="#dc2626"
            strokeWidth={2.5}
            strokeDasharray="6 4"
            dot={false}
            activeDot={{ r: 5 }}
          />
          {showRequestedExpenses && (
            <Line
              type="monotone"
              dataKey="Requested Expenses"
              name="Original Requested Expenses"
              stroke="#f97316"
              strokeWidth={2.5}
              strokeDasharray="3 3"
              dot={false}
              activeDot={{ r: 5 }}
            />
          )}

        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
