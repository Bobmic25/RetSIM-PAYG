import { Plus, Trash2, Info } from 'lucide-react';
import { ExpenseLadder, Scenario } from '../types/retirement';
import { formatCurrency, parseCurrency } from '../lib/formatters';

interface ExpenseLadderFormProps {
  expenses: ExpenseLadder[];
  onChange: (expenses: ExpenseLadder[]) => void;
  scenario: Scenario;
}

function CurrencyInput({ value, onChange, placeholder }: {
  value: number;
  onChange: (n: number) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value ? formatCurrency(value) : ''}
      onChange={e => onChange(parseCurrency(e.target.value))}
      placeholder={placeholder || '$0'}
      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
    />
  );
}

export default function ExpenseLadderForm({ expenses, onChange, scenario }: ExpenseLadderFormProps) {
  const addStep = () => {
    if (expenses.length === 0) {
      onChange([{
        start_age: scenario.retirement_age,
        end_age: scenario.retirement_age + 10,
        living_expenses: 60000,
        travel_expenses: 10000,
        other_expenses: 5000
      }]);
      return;
    }

    const last = expenses[expenses.length - 1];
    const prevSecond = expenses.length >= 2 ? expenses[expenses.length - 2] : null;

    onChange([...expenses, {
      start_age: last.end_age + 1,
      end_age: last.end_age + 11,
      living_expenses: prevSecond ? last.living_expenses : last.living_expenses,
      travel_expenses: prevSecond ? last.travel_expenses : last.travel_expenses,
      other_expenses: prevSecond ? last.other_expenses : last.other_expenses
    }]);
  };

  const updateStep = (index: number, updates: Partial<ExpenseLadder>) => {
    const updated = [...expenses];
    updated[index] = { ...updated[index], ...updates };
    onChange(updated);
  };

  const removeStep = (index: number) => {
    onChange(expenses.filter((_, i) => i !== index));
  };

  const totalAnnual = (e: ExpenseLadder) => e.living_expenses + e.travel_expenses + e.other_expenses;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Expense Ladder</h3>
          <p className="text-sm text-gray-600">Define spending by age range.</p>
        </div>
        <button
          type="button"
          onClick={addStep}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          Add Step
        </button>
      </div>

      <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800">
        <Info className="w-4 h-4 mt-0.5 shrink-0 text-blue-500" />
        <span>
          <strong>Enter amounts in today's dollars.</strong> All expenses are automatically adjusted for inflation
          ({scenario.inflation_rate}% per year) when projecting future years — you do not need to factor inflation in yourself.
        </span>
      </div>

      {expenses.length === 0 && (
        <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-lg">
          <p className="text-gray-500 mb-3">No expense steps defined.</p>
          <button
            type="button"
            onClick={addStep}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
          >
            Add First Step
          </button>
        </div>
      )}

      <div className="space-y-4">
        {expenses.map((step, index) => (
          <div key={index} className="bg-white border border-gray-200 rounded-lg p-5">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-bold">
                  {index + 1}
                </span>
                <div>
                  <span className="font-semibold text-gray-900">
                    Ages {step.start_age}–{step.end_age}
                  </span>
                  <span className="ml-3 text-sm text-gray-500">
                    Total: {formatCurrency(totalAnnual(step))} /yr
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeStep(index)}
                className="text-red-400 hover:text-red-600 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Start Age</label>
                <input
                  type="number"
                  value={step.start_age}
                  min={18}
                  max={120}
                  onChange={e => updateStep(index, { start_age: parseInt(e.target.value) || step.start_age })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">End Age</label>
                <input
                  type="number"
                  value={step.end_age}
                  min={step.start_age}
                  max={120}
                  onChange={e => updateStep(index, { end_age: parseInt(e.target.value) || step.end_age })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Living /yr</label>
                <CurrencyInput
                  value={step.living_expenses}
                  onChange={v => updateStep(index, { living_expenses: v })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Travel /yr</label>
                <CurrencyInput
                  value={step.travel_expenses}
                  onChange={v => updateStep(index, { travel_expenses: v })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Other /yr</label>
                <CurrencyInput
                  value={step.other_expenses}
                  onChange={v => updateStep(index, { other_expenses: v })}
                />
              </div>
            </div>

            <div className="mt-3 flex gap-2 flex-wrap">
              {[
                { label: 'Living', value: step.living_expenses, color: 'bg-blue-100 text-blue-700' },
                { label: 'Travel', value: step.travel_expenses, color: 'bg-green-100 text-green-700' },
                { label: 'Other', value: step.other_expenses, color: 'bg-orange-100 text-orange-700' }
              ].filter(b => b.value > 0).map(badge => (
                <span key={badge.label} className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>
                  {badge.label}: {formatCurrency(badge.value)}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {expenses.length > 1 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h5 className="text-sm font-semibold text-gray-700 mb-3">Expense Timeline</h5>
          <div className="flex items-center gap-4 mb-3 flex-wrap">
            {[
              { label: 'Living', color: 'bg-blue-500' },
              { label: 'Travel', color: 'bg-green-500' },
              { label: 'Other', color: 'bg-orange-400' },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-1.5 text-xs text-gray-600">
                <span className={`w-3 h-3 rounded-sm ${item.color}`} />
                {item.label}
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            {expenses.map((step, i) => {
              const maxTotal = Math.max(...expenses.map(e => totalAnnual(e)));
              const living = maxTotal > 0 ? (step.living_expenses / maxTotal) * 100 : 0;
              const travel = maxTotal > 0 ? (step.travel_expenses / maxTotal) * 100 : 0;
              const other = maxTotal > 0 ? (step.other_expenses / maxTotal) * 100 : 0;
              return (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <span className="text-gray-500 w-24 text-right shrink-0">
                    {step.start_age}–{step.end_age}
                  </span>
                  <div className="flex-1 bg-gray-200 rounded h-5 overflow-hidden flex">
                    <div
                      className="h-full bg-blue-500 transition-all"
                      style={{ width: `${living}%` }}
                    />
                    <div
                      className="h-full bg-green-500 transition-all"
                      style={{ width: `${travel}%` }}
                    />
                    <div
                      className="h-full bg-orange-400 transition-all"
                      style={{ width: `${other}%` }}
                    />
                  </div>
                  <span className="text-gray-700 font-medium w-24 shrink-0">
                    {formatCurrency(totalAnnual(step))}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
        <strong>Go-Go, Slow-Go, No-Go:</strong> Many retirees spend more in early retirement (travel, activities) and less later.
        Consider higher spending at {scenario.retirement_age}–{scenario.retirement_age + 10} and lower after.
      </div>
    </div>
  );
}
