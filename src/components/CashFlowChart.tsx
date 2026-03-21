import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Text } from 'recharts';
import { TooltipProps } from 'recharts';
import { YearlyProjection } from '../types/retirement';
import { presentValue } from '../lib/benefitsEngine';

interface CashFlowChartProps {
  data: YearlyProjection[];
  showToday: boolean;
  inflationRate?: number;
}

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
    const nonReg = pv(item.non_reg_withdrawal || 0);
    const inheritance = pv(item.inheritance || 0);

    return {
      age: item.age,
      afterTaxTotal: salary + cpp + oas + dbPension + rrsp + tfsa + nonReg + inheritance,
      Salary: salary,
      CPP: cpp,
      OAS: oas,
      ...(dbPension > 0 ? { 'DB Pension': dbPension } : {}),
      'RRSP Withdrawal': rrsp,
      'TFSA Withdrawal': tfsa,
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
  'Non-Reg Withdrawal': '#6366f1',
  Inheritance: '#14b8a6',
};

function CustomTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload || !payload.length) return null;

  const afterTaxTotal = (payload[0]?.payload as { afterTaxTotal: number })?.afterTaxTotal ?? 0;

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
      <p style={{ fontWeight: 700, color: '#111827', marginBottom: 8, fontSize: 13 }}>
        Total After Tax: ${Math.round(afterTaxTotal).toLocaleString()}
      </p>
      {payload.map((entry) => (
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

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-xl font-bold text-gray-900 mb-4">Income Sources by Year</h3>
      <ResponsiveContainer width="100%" height={440}>
        <BarChart data={chartData} margin={{ bottom: 24 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="age"
            height={40}
            tick={CustomTick}
            label={{ value: 'Age', position: 'insideBottom', offset: -4 }}
          />
          <YAxis
            label={{
              value: showToday ? "Income (Today's $)" : 'Income ($)',
              angle: -90,
              position: 'insideLeft',
            }}
            tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Bar dataKey="Salary" stackId="a" fill="#3b82f6" />
          <Bar dataKey="CPP" stackId="a" fill="#8b5cf6" />
          <Bar dataKey="OAS" stackId="a" fill="#ec4899" />
          <Bar dataKey="DB Pension" stackId="a" fill="#0ea5e9" />
          <Bar dataKey="RRSP Withdrawal" stackId="a" fill="#f59e0b" />
          <Bar dataKey="TFSA Withdrawal" stackId="a" fill="#10b981" />
          <Bar dataKey="Non-Reg Withdrawal" stackId="a" fill="#6366f1" />
          <Bar dataKey="Inheritance" stackId="a" fill="#14b8a6" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
