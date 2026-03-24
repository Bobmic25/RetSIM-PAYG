import { Plus, Trash2 } from 'lucide-react';
import { IncomeSource, Scenario } from '../types/retirement';
import { formatCurrency } from '../lib/formatters';
import { MAX_AGE } from '../lib/ageUtils';
import { AgeInput } from './AgeInput';

interface IncomeFormProps {
  incomeSources: IncomeSource[];
  onChange: (sources: IncomeSource[]) => void;
  scenario: Scenario;
}

function IncomeCard({ source, index, onUpdate, onRemove, currentAge }: {
  source: IncomeSource; index: number;
  onUpdate: (i: number, u: Partial<IncomeSource>) => void;
  onRemove: (i: number) => void;
  currentAge: number;
}) {
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[$,]/g, '');
    onUpdate(index, { amount: parseFloat(raw) || 0 });
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
      <div className="flex justify-between items-center">
        <h5 className="font-medium text-gray-900">Source {index + 1}</h5>
        <button type="button" onClick={() => onRemove(index)} className="text-red-500 hover:text-red-700"><Trash2 className="w-4 h-4" /></button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
          <input type="text" value={source.name} placeholder="e.g., Salary, Pension"
            onChange={e => onUpdate(index, { name: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
          <select value={source.source_type} onChange={e => onUpdate(index, { source_type: e.target.value as any })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg">
            <option value="salary">Salary</option>
            <option value="pension">Pension</option>
            <option value="rental">Rental Income</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Annual Amount</label>
          <input type="text" value={source.amount ? formatCurrency(source.amount) : ''}
            onChange={handleAmountChange} placeholder="$0"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Growth Rate (% /year)</label>
          <input type="number" value={source.growth_rate} min={0} max={20} step={0.5}
            onChange={e => onUpdate(index, { growth_rate: parseFloat(e.target.value) || 0 })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Start Age</label>
          <AgeInput value={source.start_age} min={18} max={MAX_AGE}
            onChange={v => onUpdate(index, { start_age: v! })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">End Age (optional)</label>
          <AgeInput value={source.end_age} min={18} max={MAX_AGE} optional
            placeholder="Leave blank for lifetime"
            onChange={v => onUpdate(index, { end_age: v })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

function PersonSection({ label, accentClass, sources, onAdd, onUpdate, onRemove, currentAge }: {
  label: string; accentClass: string;
  sources: IncomeSource[];
  onAdd: () => void;
  onUpdate: (i: number, u: Partial<IncomeSource>) => void;
  onRemove: (i: number) => void;
  currentAge: number;
}) {
  return (
    <div className={`rounded-lg border p-4 ${accentClass}`}>
      <div className="flex justify-between items-center mb-4">
        <h4 className="font-semibold text-gray-900">{label}</h4>
        <button type="button" onClick={onAdd}
          className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm">
          <Plus className="w-4 h-4" /> Add Income
        </button>
      </div>
      {sources.length === 0
        ? <p className="text-gray-500 text-sm text-center py-4">No income sources. Click "Add Income" to begin.</p>
        : sources.map((s, i) => (
          <div key={i} className="mb-3">
            <IncomeCard source={s} index={i} onUpdate={onUpdate} onRemove={onRemove} currentAge={currentAge} />
          </div>
        ))
      }
    </div>
  );
}

export default function IncomeForm({ incomeSources, onChange, scenario }: IncomeFormProps) {
  const isCouple = scenario.profile_type === 'couple';
  const primarySources = incomeSources.filter(s => s.person === 'primary');
  const spouseSources = incomeSources.filter(s => s.person === 'spouse');
  const spouseRetirementAge = scenario.spouse_retirement_age ?? scenario.retirement_age;

  const addPrimary = () => {
    onChange([...incomeSources, { person: 'primary', source_type: 'salary', name: '', amount: 0, start_age: scenario.current_age, end_age: scenario.retirement_age, growth_rate: 2 }]);
  };

  const addSpouse = () => {
    onChange([...incomeSources, { person: 'spouse', source_type: 'salary', name: '', amount: 0, start_age: scenario.spouse_age || scenario.current_age, end_age: spouseRetirementAge, growth_rate: 2 }]);
  };

  const updateByPerson = (person: 'primary' | 'spouse', localIndex: number, updates: Partial<IncomeSource>) => {
    const globalSources = [...incomeSources];
    let count = 0;
    for (let i = 0; i < globalSources.length; i++) {
      if (globalSources[i].person === person) {
        if (count === localIndex) { globalSources[i] = { ...globalSources[i], ...updates }; break; }
        count++;
      }
    }
    onChange(globalSources);
  };

  const removeByPerson = (person: 'primary' | 'spouse', localIndex: number) => {
    let count = 0;
    onChange(incomeSources.filter(s => {
      if (s.person !== person) return true;
      if (count === localIndex) { count++; return false; }
      count++;
      return true;
    }));
  };

  if (!isCouple) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold text-gray-900">Income Sources</h3>
          <button type="button" onClick={addPrimary}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            <Plus className="w-4 h-4" /> Add Income
          </button>
        </div>
        {incomeSources.length === 0
          ? <p className="text-center py-8 text-gray-500">No income sources added.</p>
          : incomeSources.map((s, i) => (
            <IncomeCard key={i} source={s} index={i}
              onUpdate={(_, u) => { const upd = [...incomeSources]; upd[i] = { ...upd[i], ...u }; onChange(upd); }}
              onRemove={idx => onChange(incomeSources.filter((_, ii) => ii !== idx))}
              currentAge={scenario.current_age} />
          ))
        }
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-gray-900">Income Sources</h3>
      <PersonSection label="Primary Person" accentClass="bg-blue-50 border-blue-200"
        sources={primarySources} onAdd={addPrimary}
        onUpdate={(i, u) => updateByPerson('primary', i, u)}
        onRemove={i => removeByPerson('primary', i)}
        currentAge={scenario.current_age} />
      <PersonSection label="Spouse" accentClass="bg-cyan-50 border-cyan-200"
        sources={spouseSources} onAdd={addSpouse}
        onUpdate={(i, u) => updateByPerson('spouse', i, u)}
        onRemove={i => removeByPerson('spouse', i)}
        currentAge={scenario.spouse_age || scenario.current_age} />
    </div>
  );
}
