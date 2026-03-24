import { ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Text, Line } from 'recharts';
import { TooltipProps } from 'recharts';
import { YearlyProjection } from '../types/retirement';
import { presentValue } from '../lib/benefitsEngine';

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

function buildChartData(data: YearlyProjection[], showToday: boolean, inflationRate: number) {
  const startYear = data[0]?.year ?? 0;
  return data.map((item) => {
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
    const afterTaxIncome = pv(item.after_tax_income || 0);
    const grossCashIn = salary + cpp + oas + dbPension + rrsp + tfsa + fhsa + nonReg + inheritance;

    return {
      age: item.age,
      grossCashIn,
      afterTaxTotal: afterTaxIncome,
      Expenses: expenses,
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
};

function CustomTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload || !payload.length) return null;

  const chartRow = payload[0]?.payload as {
    grossCashIn: number;
    afterTaxTotal: number;
    Expenses: number;
  } | undefined;
  const grossCashIn = chartRow?.grossCashIn ?? 0;
  const afterTaxTotal = chartRow?.afterTaxTotal ?? 0;
  const expenses = chartRow?.Expenses ?? 0;
  const payloadItems = payload.filter(entry => !['After-Tax Income', 'Expenses'].includes(entry.name ?? ''));

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
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontWeight: 700, color: COLORS.Expenses }}>
          <span>Expenses</span>
          <span>${Math.round(expenses).toLocaleString()}</span>
        </div>
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
  const chartData = buildChartData(data, showToday, inflationRate);
  const visibleBarSeries = BAR_SERIES.filter(({ dataKey }) =>
    chartData.some((row) => Number(row[dataKey as keyof typeof row] ?? 0) > 0)
  );

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-xl font-bold text-gray-900 mb-1">Cash Flow by Year</h3>
      <p className="text-sm text-gray-500 mb-4">Stacked bars show gross cash sources. Lines show after-tax income and planned expenses.</p>
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
          <Legend />
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
            stroke="#dc2626"
            strokeWidth={2.5}
            strokeDasharray="6 4"
            dot={false}
            activeDot={{ r: 5 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
