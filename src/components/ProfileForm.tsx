import { useState } from 'react';
import { FolderOpen } from 'lucide-react';
import { Scenario, Province } from '../types/retirement';
import { formatCurrency, parseCurrency } from '../lib/formatters';
import { MAX_AGE, clampAge } from '../lib/ageUtils';

interface ProfileFormProps {
  scenario: Scenario;
  onChange: (updates: Partial<Scenario>) => void;
  onLoadScenario?: () => void;
}

const PROVINCES: { value: Province; label: string }[] = [
  { value: 'AB', label: 'Alberta' }, { value: 'BC', label: 'British Columbia' },
  { value: 'MB', label: 'Manitoba' }, { value: 'NB', label: 'New Brunswick' },
  { value: 'NL', label: 'Newfoundland and Labrador' }, { value: 'NT', label: 'Northwest Territories' },
  { value: 'NS', label: 'Nova Scotia' }, { value: 'NU', label: 'Nunavut' },
  { value: 'ON', label: 'Ontario' }, { value: 'PE', label: 'Prince Edward Island' },
  { value: 'QC', label: 'Quebec' }, { value: 'SK', label: 'Saskatchewan' }, { value: 'YT', label: 'Yukon' }
];

function Toggle({ labelA, labelB, active, onToggle }: { labelA: string; labelB: string; active: string; onToggle: () => void }) {
  const isB = active === labelB;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={!isB ? 'font-semibold text-blue-700' : 'text-gray-400'}>{labelA}</span>
      <button type="button" onClick={onToggle}
        className={`relative w-11 h-6 rounded-full transition-colors ${isB ? 'bg-blue-600' : 'bg-gray-300'}`}>
        <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all duration-200 ${isB ? 'left-6' : 'left-1'}`} />
      </button>
      <span className={isB ? 'font-semibold text-blue-700' : 'text-gray-400'}>{labelB}</span>
    </div>
  );
}

function DbPensionPanel({
  accentClass, amount, onAmount, startAge, onStartAge, indexed, onIndexed
}: {
  accentClass: string;
  amount: number; onAmount: (v: number) => void;
  startAge: number; onStartAge: (v: number) => void;
  indexed: boolean; onIndexed: (v: boolean) => void;
}) {
  const [unit, setUnit] = useState<'Yearly' | 'Monthly'>('Yearly');
  const displayValue = unit === 'Monthly' ? Math.round(amount / 12) : amount;

  return (
    <div className={`rounded-lg p-5 border ${accentClass} mt-4`}>
      <h4 className="font-semibold mb-4">Defined Benefit (DB) Pension Settings</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Pension Start Age</label>
          <input type="number" value={startAge} min={50} max={MAX_AGE}
            onChange={e => onStartAge(clampAge(parseInt(e.target.value), 65, 50))}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700">Annual Pension Amount</label>
            <Toggle labelA="Yearly" labelB="Monthly" active={unit} onToggle={() => setUnit(u => u === 'Yearly' ? 'Monthly' : 'Yearly')} />
          </div>
          <input
            type="text"
            value={displayValue ? formatCurrency(displayValue) : ''}
            onChange={e => {
              const v = parseCurrency(e.target.value);
              onAmount(unit === 'Monthly' ? v * 12 : v);
            }}
            placeholder="$0"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
          <p className="text-xs text-gray-500 mt-1">
            = {unit === 'Monthly' ? `${formatCurrency(amount)} /yr` : `${formatCurrency(Math.round(amount / 12))} /mo`}
          </p>
        </div>
      </div>
      <label className="flex items-center gap-3 mt-4 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={indexed}
          onChange={e => onIndexed(e.target.checked)}
          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <span className="text-sm text-gray-700">Indexed to inflation (pension grows with CPI each year)</span>
      </label>
      <p className="text-xs text-gray-500 mt-2">Enter the pension amount in today's dollars. If not indexed, the nominal amount stays fixed over time.</p>
    </div>
  );
}

function CppOasPanel({
  label, accentClass, cppStartAge, onCppStartAge, cppAmount65, onCppAmount65,
  oasStartAge, onOasStartAge, oasAmount65, onOasAmount65,
  hasDbPension, onHasDbPension, dbPensionAmount, onDbPensionAmount,
  dbPensionStartAge, onDbPensionStartAge, dbPensionIndexed, onDbPensionIndexed,
  dbPanelAccentClass
}: {
  label: string; accentClass: string;
  cppStartAge: number; onCppStartAge: (v: number) => void;
  cppAmount65: number; onCppAmount65: (v: number) => void;
  oasStartAge: number; onOasStartAge: (v: number) => void;
  oasAmount65: number; onOasAmount65: (v: number) => void;
  hasDbPension: boolean; onHasDbPension: (v: boolean) => void;
  dbPensionAmount: number; onDbPensionAmount: (v: number) => void;
  dbPensionStartAge: number; onDbPensionStartAge: (v: number) => void;
  dbPensionIndexed: boolean; onDbPensionIndexed: (v: boolean) => void;
  dbPanelAccentClass: string;
}) {
  const [cppUnit, setCppUnit] = useState<'Yearly' | 'Monthly'>('Yearly');
  const [oasUnit, setOasUnit] = useState<'Yearly' | 'Monthly'>('Yearly');

  const cppDisplayValue = cppUnit === 'Monthly' ? Math.round(cppAmount65 / 12) : cppAmount65;
  const oasDisplayValue = oasUnit === 'Monthly' ? Math.round(oasAmount65 / 12) : oasAmount65;

  return (
    <div className={`rounded-lg p-5 border ${accentClass}`}>
      <h4 className="font-semibold mb-4">{label} — CPP &amp; OAS Settings</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">CPP Start Age (60–70)</label>
          <input type="number" value={cppStartAge} min={60} max={70}
            onChange={e => onCppStartAge(parseInt(e.target.value) || 65)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700">CPP Amount at Age 65</label>
            <Toggle labelA="Yearly" labelB="Monthly" active={cppUnit} onToggle={() => setCppUnit(u => u === 'Yearly' ? 'Monthly' : 'Yearly')} />
          </div>
          <input
            type="text"
            value={cppDisplayValue ? formatCurrency(cppDisplayValue) : ''}
            onChange={e => {
              const v = parseCurrency(e.target.value);
              onCppAmount65(cppUnit === 'Monthly' ? v * 12 : v);
            }}
            placeholder="$0"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
          <p className="text-xs text-gray-500 mt-1">
            = {cppUnit === 'Monthly' ? `${formatCurrency(cppAmount65)} /yr` : `${formatCurrency(Math.round(cppAmount65 / 12))} /mo`}
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">OAS Start Age (65–70)</label>
          <input type="number" value={oasStartAge} min={65} max={70}
            onChange={e => onOasStartAge(parseInt(e.target.value) || 65)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700">OAS Amount at Age 65</label>
            <Toggle labelA="Yearly" labelB="Monthly" active={oasUnit} onToggle={() => setOasUnit(u => u === 'Yearly' ? 'Monthly' : 'Yearly')} />
          </div>
          <input
            type="text"
            value={oasDisplayValue ? formatCurrency(oasDisplayValue) : ''}
            onChange={e => {
              const v = parseCurrency(e.target.value);
              onOasAmount65(oasUnit === 'Monthly' ? v * 12 : v);
            }}
            placeholder="$0"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
          <p className="text-xs text-gray-500 mt-1">
            = {oasUnit === 'Monthly' ? `${formatCurrency(oasAmount65)} /yr` : `${formatCurrency(Math.round(oasAmount65 / 12))} /mo`}
          </p>
        </div>
      </div>

      <div className="mt-5 pt-4 border-t border-gray-200">
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={hasDbPension}
            onChange={e => onHasDbPension(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm font-medium text-gray-700">I have a Defined Benefit (DB) Pension Plan</span>
        </label>
      </div>

      {hasDbPension && (
        <DbPensionPanel
          accentClass={dbPanelAccentClass}
          amount={dbPensionAmount}
          onAmount={onDbPensionAmount}
          startAge={dbPensionStartAge}
          onStartAge={onDbPensionStartAge}
          indexed={dbPensionIndexed}
          onIndexed={onDbPensionIndexed}
        />
      )}
    </div>
  );
}

export default function ProfileForm({ scenario, onChange, onLoadScenario }: ProfileFormProps) {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-900">Profile Settings</h3>
        {onLoadScenario && (
          <button
            type="button"
            onClick={onLoadScenario}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm"
          >
            <FolderOpen className="w-4 h-4" />
            Load Saved Scenario
          </button>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Profile Type</label>
        <div className="flex gap-4">
          {(['individual', 'couple'] as const).map(type => (
            <button key={type} type="button" onClick={() => onChange({ profile_type: type })}
              className={`flex-1 py-3 px-4 rounded-lg border-2 font-medium transition-colors capitalize ${
                scenario.profile_type === type ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
              }`}>{type}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Current Age</label>
          <input type="number" value={scenario.current_age} min={18} max={MAX_AGE}
            onChange={e => onChange({ current_age: clampAge(parseInt(e.target.value), scenario.current_age) })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
        </div>
        {scenario.profile_type === 'couple' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Spouse Age</label>
            <input type="number" value={scenario.spouse_age || ''} min={18} max={MAX_AGE}
              onChange={e => onChange({ spouse_age: e.target.value ? clampAge(parseInt(e.target.value), scenario.spouse_age || scenario.current_age) : undefined })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Retirement Age</label>
          <input type="number" value={scenario.retirement_age} min={50} max={MAX_AGE}
            onChange={e => onChange({ retirement_age: clampAge(parseInt(e.target.value), scenario.retirement_age, 50) })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Plan Duration (years post-retirement)</label>
          <input type="number" value={scenario.plan_duration} min={10} max={50}
            onChange={e => onChange({ plan_duration: parseInt(e.target.value) || 0 })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Province/Territory</label>
          <select value={scenario.province} onChange={e => onChange({ province: e.target.value as Province })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
            {PROVINCES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Inflation Rate (%)</label>
          <input type="number" step="0.1" value={scenario.inflation_rate} min={0} max={10}
            onChange={e => onChange({ inflation_rate: parseFloat(e.target.value) || 0 })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
          <p className="text-xs text-blue-700 mt-1.5 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5 leading-snug">
            Current Canadian yearly inflation rate (CPI) as of January 2026 is 2.3% based on Statistics Canada data. The 2025 annual average was 2.1%.
          </p>
        </div>
      </div>

      <CppOasPanel
        label={scenario.profile_type === 'couple' ? 'Primary Person' : 'Your'}
        accentClass="bg-blue-50 border-blue-200 text-blue-900"
        cppStartAge={scenario.cpp_start_age}
        onCppStartAge={v => onChange({ cpp_start_age: v })}
        cppAmount65={scenario.cpp_amount_65}
        onCppAmount65={v => onChange({ cpp_amount_65: v })}
        oasStartAge={scenario.oas_start_age}
        onOasStartAge={v => onChange({ oas_start_age: v })}
        oasAmount65={scenario.oas_amount_65 || 8505}
        onOasAmount65={v => onChange({ oas_amount_65: v })}
        hasDbPension={scenario.has_db_pension || false}
        onHasDbPension={v => onChange({ has_db_pension: v })}
        dbPensionAmount={scenario.db_pension_amount || 0}
        onDbPensionAmount={v => onChange({ db_pension_amount: v })}
        dbPensionStartAge={scenario.db_pension_start_age || scenario.retirement_age}
        onDbPensionStartAge={v => onChange({ db_pension_start_age: v })}
        dbPensionIndexed={scenario.db_pension_indexed || false}
        onDbPensionIndexed={v => onChange({ db_pension_indexed: v })}
        dbPanelAccentClass="bg-blue-50 border-blue-200 text-blue-900"
      />

      {scenario.profile_type === 'couple' && (
        <CppOasPanel
          label="Spouse"
          accentClass="bg-cyan-50 border-cyan-200 text-cyan-900"
          cppStartAge={scenario.spouse_cpp_start_age || 65}
          onCppStartAge={v => onChange({ spouse_cpp_start_age: v })}
          cppAmount65={scenario.spouse_cpp_amount_65 || 0}
          onCppAmount65={v => onChange({ spouse_cpp_amount_65: v })}
          oasStartAge={scenario.spouse_oas_start_age || 65}
          onOasStartAge={v => onChange({ spouse_oas_start_age: v })}
          oasAmount65={scenario.spouse_oas_amount_65 || 8505}
          onOasAmount65={v => onChange({ spouse_oas_amount_65: v })}
          hasDbPension={scenario.spouse_has_db_pension || false}
          onHasDbPension={v => onChange({ spouse_has_db_pension: v })}
          dbPensionAmount={scenario.spouse_db_pension_amount || 0}
          onDbPensionAmount={v => onChange({ spouse_db_pension_amount: v })}
          dbPensionStartAge={scenario.spouse_db_pension_start_age || scenario.retirement_age}
          onDbPensionStartAge={v => onChange({ spouse_db_pension_start_age: v })}
          dbPensionIndexed={scenario.spouse_db_pension_indexed || false}
          onDbPensionIndexed={v => onChange({ spouse_db_pension_indexed: v })}
          dbPanelAccentClass="bg-cyan-50 border-cyan-200 text-cyan-900"
        />
      )}
    </div>
  );
}
