import { useState } from 'react';
import { Save, FolderOpen, Trash2, Download } from 'lucide-react';
import { Scenario, IncomeSource, SavingsAccount, ExpenseLadder, OneTimeEvent } from '../types/retirement';
import { supabase } from '../lib/supabase';

interface SavedScenario {
  id: string;
  name: string;
  created_at: string;
  scenario: Scenario;
  incomeSources: IncomeSource[];
  savingsAccounts: SavingsAccount[];
  expenseLadder: ExpenseLadder[];
  oneTimeEvents: OneTimeEvent[];
}

interface SaveLoadScenariosProps {
  currentScenario: Scenario;
  incomeSources: IncomeSource[];
  savingsAccounts: SavingsAccount[];
  expenseLadder: ExpenseLadder[];
  oneTimeEvents: OneTimeEvent[];
  onLoad: (data: {
    scenario: Scenario;
    incomeSources: IncomeSource[];
    savingsAccounts: SavingsAccount[];
    expenseLadder: ExpenseLadder[];
    oneTimeEvents: OneTimeEvent[];
  }) => void;
}

export default function SaveLoadScenarios({
  currentScenario,
  incomeSources,
  savingsAccounts,
  expenseLadder,
  oneTimeEvents,
  onLoad
}: SaveLoadScenariosProps) {
  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>(() => {
    try {
      const stored = localStorage.getItem('retirement_scenarios');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [isSaving, setIsSaving] = useState(false);
  const [scenarioName, setScenarioName] = useState(currentScenario.name || 'My Retirement Plan');
  const [saveSuccess, setSaveSuccess] = useState(false);

  const persistScenarios = (scenarios: SavedScenario[]) => {
    setSavedScenarios(scenarios);
    localStorage.setItem('retirement_scenarios', JSON.stringify(scenarios));
  };

  const saveScenario = async () => {
    setIsSaving(true);
    try {
      const newEntry: SavedScenario = {
        id: crypto.randomUUID(),
        name: scenarioName,
        created_at: new Date().toISOString(),
        scenario: { ...currentScenario, name: scenarioName },
        incomeSources,
        savingsAccounts,
        expenseLadder,
        oneTimeEvents
      };

      const updated = [newEntry, ...savedScenarios.filter(s => s.name !== scenarioName)];
      persistScenarios(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } finally {
      setIsSaving(false);
    }
  };

  const loadScenario = (saved: SavedScenario) => {
    onLoad({
      scenario: saved.scenario,
      incomeSources: saved.incomeSources || [],
      savingsAccounts: saved.savingsAccounts || [],
      expenseLadder: saved.expenseLadder || [],
      oneTimeEvents: saved.oneTimeEvents || []
    });
  };

  const deleteScenario = (id: string) => {
    persistScenarios(savedScenarios.filter(s => s.id !== id));
  };

  const exportToJson = () => {
    const data = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      scenario: currentScenario,
      incomeSources,
      savingsAccounts,
      expenseLadder,
      oneTimeEvents
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${scenarioName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importFromJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        if (parsed.scenario) {
          onLoad({
            scenario: parsed.scenario,
            incomeSources: parsed.incomeSources || [],
            savingsAccounts: parsed.savingsAccounts || [],
            expenseLadder: parsed.expenseLadder || [],
            oneTimeEvents: parsed.oneTimeEvents || []
          });
        }
      } catch {
        alert('Invalid file format');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString('en-CA', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Save & Load Scenarios</h3>
        <p className="text-sm text-gray-600">
          Scenarios are saved locally in your browser. Export to JSON to back them up or share.
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h4 className="font-semibold text-gray-900 mb-4">Save Current Scenario</h4>
        <div className="flex gap-3">
          <input
            type="text"
            value={scenarioName}
            onChange={e => setScenarioName(e.target.value)}
            placeholder="Scenario name"
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            onClick={saveScenario}
            disabled={isSaving || !scenarioName.trim()}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg font-medium transition-colors ${
              saveSuccess
                ? 'bg-green-500 text-white'
                : 'bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed'
            }`}
          >
            <Save className="w-4 h-4" />
            {saveSuccess ? 'Saved!' : isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h4 className="font-semibold text-gray-900 mb-4">Import / Export</h4>
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={exportToJson}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm"
          >
            <Download className="w-4 h-4" />
            Export as JSON
          </button>
          <label className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm cursor-pointer">
            <FolderOpen className="w-4 h-4" />
            Import from JSON
            <input type="file" accept=".json" onChange={importFromJson} className="hidden" />
          </label>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h4 className="font-semibold text-gray-900 mb-4">Saved Scenarios</h4>
        {savedScenarios.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>No saved scenarios yet.</p>
            <p className="text-sm mt-1">Save your current scenario above to get started.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {savedScenarios.map(saved => (
              <div
                key={saved.id}
                className="flex items-center justify-between p-4 bg-gray-50 border border-gray-200 rounded-lg hover:border-blue-300 transition-colors"
              >
                <div>
                  <p className="font-medium text-gray-900">{saved.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{formatDate(saved.created_at)}</p>
                  <div className="flex gap-3 mt-1 text-xs text-gray-500">
                    <span>Age {saved.scenario.current_age} → {saved.scenario.retirement_age}</span>
                    <span>{saved.scenario.province}</span>
                    <span>{saved.scenario.return_type === 'monte_carlo' ? 'Monte Carlo' : 'Linear'}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => loadScenario(saved)}
                    className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Load
                  </button>
                  <button
                    onClick={() => deleteScenario(saved.id)}
                    className="p-1.5 text-red-400 hover:text-red-600 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
