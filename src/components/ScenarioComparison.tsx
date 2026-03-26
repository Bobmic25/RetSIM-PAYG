import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { YearlyProjection } from '../types/retirement';

interface ScenarioComparisonProps {
  scenarios: {
    name: string;
    projections: YearlyProjection[];
    color: string;
  }[];
}

export default function ScenarioComparison({ scenarios }: ScenarioComparisonProps) {
  if (scenarios.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-4">Scenario Comparison</h3>
        <p className="text-gray-500">No scenarios to compare. Run multiple simulations to compare outcomes.</p>
      </div>
    );
  }

  const maxLength = Math.max(...scenarios.map(s => s.projections.length));
  const chartData = Array.from({ length: maxLength }, (_, i) => {
    const dataPoint: any = { year: i + 1 };
    scenarios.forEach(scenario => {
      if (scenario.projections[i]) {
        dataPoint[scenario.name] = scenario.projections[i].total_balance;
        dataPoint[`${scenario.name}_age`] = scenario.projections[i].age;
      }
    });
    return dataPoint;
  });

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-xl font-bold text-gray-900 mb-4">Scenario Comparison</h3>

      <div className="mb-6">
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="year"
              label={{ value: 'Year', position: 'insideBottom', offset: -5 }}
            />
            <YAxis
              label={{ value: 'Net Worth ($)', angle: -90, position: 'insideLeft' }}
              tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
            />
            <Tooltip
              formatter={(value: number | string | readonly (number | string)[] | undefined) => {
                const numericValue = Array.isArray(value) ? Number(value[0]) : Number(value ?? 0);
                return `$${numericValue.toLocaleString()}`;
              }}
              labelFormatter={(label) => `Year ${label}`}
            />
            <Legend />
            {scenarios.map(scenario => (
              <Line
                key={scenario.name}
                type="monotone"
                dataKey={scenario.name}
                stroke={scenario.color}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {scenarios.map(scenario => {
          const final = scenario.projections[scenario.projections.length - 1];
          const totalTax = scenario.projections.reduce((sum, p) => sum + p.total_tax, 0);

          return (
            <div key={scenario.name} className="border rounded-lg p-4" style={{ borderColor: scenario.color, borderWidth: 2 }}>
              <h4 className="font-semibold text-gray-900 mb-2">{scenario.name}</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Final Balance:</span>
                  <span className={`font-bold ${final.total_balance < 0 ? 'text-red-600' : 'text-green-600'}`}>
                    ${final.total_balance.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Tax:</span>
                  <span className="font-medium text-red-600">
                    ${totalTax.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Final Age:</span>
                  <span className="font-medium text-gray-900">{final.age}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
