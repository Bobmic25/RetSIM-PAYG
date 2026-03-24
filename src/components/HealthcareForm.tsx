import { Plus, Trash2, Info } from 'lucide-react';
import { Scenario, HealthcareStep } from '../types/retirement';
import { formatCurrency, parseCurrency } from '../lib/formatters';
import { MAX_AGE } from '../lib/ageUtils';
import { AgeInput } from './AgeInput';

interface HealthcareFormProps {
  steps: HealthcareStep[];
  onChange: (steps: HealthcareStep[]) => void;
  scenario: Scenario;
}

export default function HealthcareForm({ steps, onChange, scenario }: HealthcareFormProps) {
  const addStep = () => {
    if (steps.length === 0) {
      onChange([{
        from_age: scenario.retirement_age,
        to_age: Math.min(MAX_AGE, scenario.retirement_age + 10),
        annual_cost: 3000,
        is_insured: false,
        description: 'Basic healthcare'
      }]);
      return;
    }
    const last = steps[steps.length - 1];
    onChange([...steps, {
      from_age: Math.min(MAX_AGE, last.to_age + 1),
      to_age: Math.min(MAX_AGE, last.to_age + 11),
      annual_cost: last.annual_cost,
      is_insured: last.is_insured,
      description: ''
    }]);
  };

  const updateStep = (index: number, updates: Partial<HealthcareStep>) => {
    const updated = [...steps];
    updated[index] = { ...updated[index], ...updates };
    onChange(updated);
  };

  const removeStep = (index: number) => {
    onChange(steps.filter((_, i) => i !== index));
  };

  const presets = [
    { label: 'Active & Healthy', cost: 2500 },
    { label: 'Moderate Care', cost: 6000 },
    { label: 'Chronic Conditions', cost: 12000 },
    { label: 'Long-Term Care', cost: 40000 }
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Healthcare Costs</h3>
          <p className="text-sm text-gray-600">Define out-of-pocket healthcare expenses by age range.</p>
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
          <strong>Enter amounts in today's dollars.</strong> All healthcare costs are automatically adjusted for healthcare
          inflation ({scenario.healthcare_inflation || 3.5}% per year) when projecting future years — this is typically higher than
          general inflation to reflect rising medical costs.
        </span>
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <p className="text-xs font-semibold text-gray-600 mb-2">Quick Cost Benchmarks</p>
        <div className="flex flex-wrap gap-2">
          {presets.map(p => (
            <span key={p.label} className="px-3 py-1 bg-white border border-gray-300 rounded-full text-xs text-gray-700">
              {p.label}: {formatCurrency(p.cost)}/yr
            </span>
          ))}
        </div>
      </div>

      {steps.length === 0 && (
        <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-lg">
          <p className="text-gray-500 mb-3">No healthcare steps defined.</p>
          <p className="text-sm text-gray-400 mb-4">
            Healthcare costs typically increase significantly after age {Math.max(scenario.retirement_age, 75)}.
          </p>
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
        {steps.map((step, index) => (
          <div key={index} className="bg-white border border-gray-200 rounded-lg p-5">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-full bg-red-100 text-red-700 flex items-center justify-center text-sm font-bold">
                  {index + 1}
                </span>
                <div>
                  <span className="font-semibold text-gray-900">Ages {step.from_age}–{step.to_age}</span>
                  <span className="ml-3 text-sm text-gray-500">{formatCurrency(step.annual_cost)} /yr</span>
                  {step.is_insured && (
                    <span className="ml-2 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs">Insured</span>
                  )}
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

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">From Age</label>
                <AgeInput
                  value={step.from_age}
                  min={18}
                  max={MAX_AGE}
                  onChange={v => updateStep(index, { from_age: v! })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">To Age</label>
                <AgeInput
                  value={step.to_age}
                  min={step.from_age}
                  max={MAX_AGE}
                  onChange={v => updateStep(index, { to_age: v! })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Annual Cost</label>
                <input
                  type="text"
                  value={step.annual_cost ? formatCurrency(step.annual_cost) : ''}
                  onChange={e => updateStep(index, { annual_cost: parseCurrency(e.target.value) })}
                  placeholder="$0"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                <input
                  type="text"
                  value={step.description}
                  onChange={e => updateStep(index, { description: e.target.value })}
                  placeholder="Optional note"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <div
                  className={`relative w-10 h-5 rounded-full transition-colors ${step.is_insured ? 'bg-green-500' : 'bg-gray-300'}`}
                  onClick={() => updateStep(index, { is_insured: !step.is_insured })}
                >
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${step.is_insured ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </div>
                <span className="text-sm text-gray-700">Covered by insurance</span>
              </label>
              {step.is_insured && (
                <span className="text-xs text-gray-500">(cost not included in simulation)</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {steps.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
          <strong>Tip:</strong> Healthcare costs often increase sharply after age 75 — consider adding a separate higher-cost step
          for later years. You can adjust the healthcare inflation rate in your Profile settings.
        </div>
      )}
    </div>
  );
}
