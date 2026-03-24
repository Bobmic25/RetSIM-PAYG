import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { YearlyProjection } from '../types/retirement';
import { presentValue } from '../lib/benefitsEngine';

interface TaxChartProps {
  data: YearlyProjection[];
  showToday: boolean;
  inflationRate?: number;
}

export default function TaxChart({ data, showToday, inflationRate = 2.5 }: TaxChartProps) {
  const startYear = data[0]?.year ?? 0;

  const chartData = data.map((item) => {
    const yearIndex = item.year - startYear;
    const pv = (v: number) => showToday ? presentValue(v, yearIndex, inflationRate) : v;

    return {
      age: item.age,
      Federal: pv(item.federal_tax),
      Provincial: pv(item.provincial_tax),
      'CPP/EI': pv(item.cpp_ei_tax),
    };
  });

  const visibleBars = {
    federal: chartData.some((row) => row.Federal > 0),
    provincial: chartData.some((row) => row.Provincial > 0),
    cppEi: chartData.some((row) => row['CPP/EI'] > 0),
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-xl font-bold text-gray-900 mb-4">Annual Tax Liability</h3>
      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="age"
            label={{ value: 'Age', position: 'insideBottom', offset: -5 }}
          />
          <YAxis
            label={{ value: showToday ? "Tax (Today's $)" : 'Tax ($)', angle: -90, position: 'insideLeft' }}
            tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
          />
          <Tooltip
            formatter={(value: number) => `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
            labelFormatter={(label) => `Age ${label}`}
          />
          <Legend />
          {visibleBars.federal && <Bar dataKey="Federal" stackId="a" fill="#dc2626" />}
          {visibleBars.provincial && <Bar dataKey="Provincial" stackId="a" fill="#f97316" />}
          {visibleBars.cppEi && <Bar dataKey="CPP/EI" stackId="a" fill="#eab308" />}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
