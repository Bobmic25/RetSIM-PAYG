import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart } from 'recharts';

interface LongevityPlannerProps {
  currentAge: number;
  retirementAge: number;
  planDuration: number;
  onChange: (lifeExpectancy: number) => void;
}

const calculateSurvivalProbability = (age: number, gender: 'male' | 'female' = 'male'): number => {
  const baseMale = [
    { age: 65, prob: 1.0 },
    { age: 70, prob: 0.92 },
    { age: 75, prob: 0.82 },
    { age: 80, prob: 0.68 },
    { age: 85, prob: 0.50 },
    { age: 90, prob: 0.28 },
    { age: 95, prob: 0.11 },
    { age: 100, prob: 0.03 }
  ];

  const baseFemale = [
    { age: 65, prob: 1.0 },
    { age: 70, prob: 0.94 },
    { age: 75, prob: 0.86 },
    { age: 80, prob: 0.74 },
    { age: 85, prob: 0.58 },
    { age: 90, prob: 0.37 },
    { age: 95, prob: 0.17 },
    { age: 100, prob: 0.05 }
  ];

  const data = gender === 'male' ? baseMale : baseFemale;

  for (let i = 0; i < data.length - 1; i++) {
    if (age >= data[i].age && age < data[i + 1].age) {
      const ratio = (age - data[i].age) / (data[i + 1].age - data[i].age);
      return data[i].prob + (data[i + 1].prob - data[i].prob) * ratio;
    }
  }

  return age < 65 ? 1.0 : 0.01;
};

export default function LongevityPlanner({ currentAge, retirementAge, planDuration, onChange }: LongevityPlannerProps) {
  const chartData = [];
  for (let age = retirementAge; age <= retirementAge + planDuration; age++) {
    chartData.push({
      age,
      male: calculateSurvivalProbability(age, 'male') * 100,
      female: calculateSurvivalProbability(age, 'female') * 100
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Longevity Planning</h3>
        <p className="text-sm text-gray-600 mb-4">
          Plan for how long your retirement funds need to last. Canadian life expectancy averages are
          around 82 years, but many retirees live well into their 90s.
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-semibold text-blue-900 mb-2">Survival Probability Chart</h4>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="age" label={{ value: 'Age', position: 'insideBottom', offset: -5 }} />
            <YAxis label={{ value: 'Survival Probability (%)', angle: -90, position: 'insideLeft' }} />
            <Tooltip formatter={(value: number) => `${value.toFixed(1)}%`} />
            <Legend />
            <Area type="monotone" dataKey="female" stackId="1" stroke="#ec4899" fill="#fce7f3" name="Female" />
            <Area type="monotone" dataKey="male" stackId="2" stroke="#3b82f6" fill="#dbeafe" name="Male" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h4 className="font-medium text-gray-900 mb-2">Planning Recommendations</h4>
          <ul className="space-y-2 text-sm text-gray-700">
            <li className="flex items-start">
              <span className="text-green-600 mr-2">•</span>
              <span><strong>Conservative (Age 95):</strong> Plan for 30+ years of retirement</span>
            </li>
            <li className="flex items-start">
              <span className="text-blue-600 mr-2">•</span>
              <span><strong>Moderate (Age 90):</strong> Plan for 25 years of retirement</span>
            </li>
            <li className="flex items-start">
              <span className="text-yellow-600 mr-2">•</span>
              <span><strong>Aggressive (Age 85):</strong> Plan for 20 years of retirement</span>
            </li>
          </ul>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h4 className="font-medium text-gray-900 mb-2">Key Statistics</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">50% survive past (M/F):</span>
              <span className="font-medium">85 / 88 years</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">25% survive past (M/F):</span>
              <span className="font-medium">90 / 92 years</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">10% survive past (M/F):</span>
              <span className="font-medium">95 / 97 years</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="text-sm text-yellow-800">
          <strong>Planning Tip:</strong> Consider planning to at least age 95 to ensure you don't outlive your savings.
          Healthcare costs typically increase significantly in later years, so building in extra cushion is prudent.
        </p>
      </div>
    </div>
  );
}
