import { useState, useRef } from 'react';
import { FolderOpen, HelpCircle, X } from 'lucide-react';
import { Scenario, Province, IncomeSource, SavingsAccount, ExpenseLadder, HealthcareStep, OneTimeEvent } from '../types/retirement';
import { formatCurrency, parseCurrency } from '../lib/formatters';
import { MAX_AGE } from '../lib/ageUtils';
import { AgeInput } from './AgeInput';
import type { LiveInflationData } from '../lib/inflationDataService';

interface LoadedData {
  scenario: Scenario;
  incomeSources: IncomeSource[];
  savingsAccounts: SavingsAccount[];
  expenseLadder: ExpenseLadder[];
  healthcareSteps: HealthcareStep[];
  oneTimeEvents: OneTimeEvent[];
}

interface ProfileFormProps {
  scenario: Scenario;
  onChange: (updates: Partial<Scenario>) => void;
  onLoadData?: (data: LoadedData) => void;
  inflationData?: LiveInflationData | null;
}

type ProfileHelpTopic = 'dtc' | 'medical' | 'donations' | 'mortgage_balance' | 'mortgage_rate' | 'mortgage_amortization';

const PROFILE_HELP_CONTENT: Record<ProfileHelpTopic, { title: string; lines: string[] }> = {
  dtc: {
    title: 'Disability Tax Credit (DTC)',
    lines: [
      'Use this only if the primary person has been approved by the CRA for the Disability Tax Credit, usually through Form T2201.',
      'The DTC is intended for people with a severe and prolonged impairment in physical or mental functions.',
      'The credit amount is indexed each year. This tool applies the credit for the primary person only and does not calculate transfer rules to supporting relatives.',
    ],
  },
  medical: {
    title: 'Annual Medical Expenses',
    lines: [
      'Enter the eligible unreimbursed medical expenses you expect to pay in a year.',
      'Under CRA medical expense rules, only qualifying expenses count, and the claim is reduced by the lesser of 3% of net income or the indexed annual threshold.',
      'There is no single fixed cap in the model. Enter the amount you expect to be eligible and supported by receipts.',
    ],
  },
  donations: {
    title: 'Annual Charitable Donations',
    lines: [
      'Enter donations supported by official receipts from a registered charity or other CRA-qualified donee.',
      'CRA generally limits annual claims to up to 75% of net income, with some exceptions, and unused donations can usually be carried forward for up to five years.',
      'This tool models the standard annual donation credit structure for planning purposes.',
    ],
  },
  mortgage_balance: {
    title: 'Current Mortgage Balance',
    lines: [
      'Enter the current principal outstanding, not the original mortgage amount and not the total of future payments.',
      'Use the latest lender statement or renewal document.',
      'This tool uses the balance to estimate annual debt servicing and net worth impact.',
    ],
  },
  mortgage_rate: {
    title: 'Interest Rate',
    lines: [
      'Enter the annual contractual mortgage rate from your current mortgage or expected renewal rate.',
      'Use the actual note rate, not the federal mortgage stress-test rate. The stress test is for qualification underwriting, not for ongoing cash-flow planning.',
      'The tool uses this rate to estimate annual payments over the remaining amortization period.',
    ],
  },
  mortgage_amortization: {
    title: 'Amortization End Age',
    lines: [
      'Enter the age at which the mortgage is expected to be fully repaid.',
      'For many new insured Canadian mortgages, maximum amortization is often 25 years, while uninsured mortgages may vary by lender and product.',
      'The tool uses this age to spread repayment over the remaining years of the loan.',
    ],
  },
};

const PROVINCES: { value: Province; label: string }[] = [
  { value: 'AB', label: 'Alberta' }, { value: 'BC', label: 'British Columbia' },
  { value: 'MB', label: 'Manitoba' }, { value: 'NB', label: 'New Brunswick' },
  { value: 'NL', label: 'Newfoundland and Labrador' }, { value: 'NT', label: 'Northwest Territories' },
  { value: 'NS', label: 'Nova Scotia' }, { value: 'NU', label: 'Nunavut' },
  { value: 'ON', label: 'Ontario' }, { value: 'PE', label: 'Prince Edward Island' },
  { value: 'QC', label: 'Quebec' }, { value: 'SK', label: 'Saskatchewan' }, { value: 'YT', label: 'Yukon' }
];

function FieldHelpButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }}
      className="text-gray-400 hover:text-blue-600 transition-colors"
      title="More information"
    >
      <HelpCircle className="w-3.5 h-3.5" />
    </button>
  );
}

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
          <AgeInput value={startAge} min={50} max={MAX_AGE}
            onChange={v => onStartAge(v!)}
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
          <AgeInput value={cppStartAge} min={60} max={70}
            onChange={v => onCppStartAge(v!)}
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
          <AgeInput value={oasStartAge} min={65} max={70}
            onChange={v => onOasStartAge(v!)}
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

export default function ProfileForm({ scenario, onChange, onLoadData, inflationData }: ProfileFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mortgage = scenario.mortgage ?? {
    balance: 0,
    rate: 0,
    amortization_end_age: scenario.retirement_age,
  };
  const [showPlanningCredits, setShowPlanningCredits] = useState(false);
  const [showMortgage, setShowMortgage] = useState(false);
  const [activeHelpTopic, setActiveHelpTopic] = useState<ProfileHelpTopic | null>(null);
  const inflationNote = inflationData
    ? `Latest published CPI inflation: ${inflationData.latestRate.toFixed(1)}% (${new Date(inflationData.latestObservationDate).toLocaleDateString('en-CA', { year: 'numeric', month: 'long' })}). Prior calendar-year average: ${inflationData.lastYearAverage.toFixed(1)}%. Rolling 15-year average: ${inflationData.fifteenYearAverage.toFixed(1)}%. The default assumption uses the 15-year average.${inflationData.isLive ? '' : ' Cached data is currently being used because the live lookup was unavailable.'}`
    : 'Inflation data will be fetched when the app starts. If the live lookup is unavailable, the app will continue using the most recently cached inflation data.';

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        if (parsed.scenario && onLoadData) {
          onLoadData({
            scenario: parsed.scenario,
            incomeSources: parsed.incomeSources || [],
            savingsAccounts: parsed.savingsAccounts || [],
            expenseLadder: parsed.expenseLadder || [],
            healthcareSteps: parsed.healthcareSteps || [],
            oneTimeEvents: parsed.oneTimeEvents || [],
          });
        }
      } catch {
        alert('Invalid file format');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  return (
    <div className="space-y-6">
      {activeHelpTopic && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50 rounded-t-2xl">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-blue-600" />
                <h2 className="text-lg font-bold text-gray-900">{PROFILE_HELP_CONTENT[activeHelpTopic].title}</h2>
              </div>
              <button
                type="button"
                onClick={() => setActiveHelpTopic(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-200 transition-colors text-gray-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-3">
              {PROFILE_HELP_CONTENT[activeHelpTopic].lines.map((line, index) => (
                <p key={index} className="text-sm text-gray-700 leading-relaxed">{line}</p>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-900">Profile Settings</h3>
        {onLoadData && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm"
            >
              <FolderOpen className="w-4 h-4" />
              Load Saved Scenario
            </button>
          </>
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
          <AgeInput value={scenario.current_age} min={18} max={MAX_AGE}
            onChange={v => onChange({ current_age: v! })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
        </div>
        {scenario.profile_type === 'couple' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Spouse Age</label>
            <AgeInput value={scenario.spouse_age} min={18} max={MAX_AGE} optional
              onChange={v => onChange({ spouse_age: v })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {scenario.profile_type === 'couple' ? 'Primary Retirement Age' : 'Retirement Age'}
          </label>
          <AgeInput value={scenario.retirement_age} min={50} max={MAX_AGE}
            onChange={v => onChange({ retirement_age: v! })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
        </div>
        {scenario.profile_type === 'couple' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Spouse Retirement Age</label>
            <AgeInput
              value={scenario.spouse_retirement_age ?? scenario.retirement_age}
              min={50}
              max={MAX_AGE}
              onChange={v => onChange({ spouse_retirement_age: v! })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        )}
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
            {inflationNote}
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
          dbPensionStartAge={scenario.spouse_db_pension_start_age || scenario.spouse_retirement_age || scenario.retirement_age}
          onDbPensionStartAge={v => onChange({ spouse_db_pension_start_age: v })}
          dbPensionIndexed={scenario.spouse_db_pension_indexed || false}
          onDbPensionIndexed={v => onChange({ spouse_db_pension_indexed: v })}
          dbPanelAccentClass="bg-cyan-50 border-cyan-200 text-cyan-900"
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 space-y-4">
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showPlanningCredits}
              onChange={e => {
                const checked = e.target.checked;
                setShowPlanningCredits(checked);
                if (!checked) {
                  onChange({
                    primary_has_dtc: false,
                    medical_expenses_annual: 0,
                    charitable_donations_annual: 0,
                  });
                }
              }}
              className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
            />
            <div>
              <span className="text-sm font-medium text-gray-800">Do you want to include planning tax credits?</span>
              <p className="text-xs text-emerald-700 mt-1">
                Use this if you want to model disability tax credit eligibility, annual medical expenses, or charitable donations.
              </p>
            </div>
          </label>

          {showPlanningCredits && (
            <>
              <div>
                <h4 className="font-semibold text-emerald-900">Planning Credits</h4>
                <p className="text-sm text-emerald-700 mt-1">These values feed the annual tax-credit calculations inside the projection engine.</p>
              </div>

              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={scenario.primary_has_dtc || false}
                  onChange={e => onChange({ primary_has_dtc: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-sm font-medium text-gray-800 flex items-center gap-1.5">
                  Primary person qualifies for the Disability Tax Credit
                  <FieldHelpButton onClick={() => setActiveHelpTopic('dtc')} />
                </span>
              </label>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <span className="inline-flex items-center gap-1.5">
                      Annual Medical Expenses
                      <FieldHelpButton onClick={() => setActiveHelpTopic('medical')} />
                    </span>
                  </label>
                  <input
                    type="text"
                    value={scenario.medical_expenses_annual ? formatCurrency(scenario.medical_expenses_annual) : ''}
                    onChange={e => onChange({ medical_expenses_annual: parseCurrency(e.target.value) })}
                    placeholder="$0"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <span className="inline-flex items-center gap-1.5">
                      Annual Charitable Donations
                      <FieldHelpButton onClick={() => setActiveHelpTopic('donations')} />
                    </span>
                  </label>
                  <input
                    type="text"
                    value={scenario.charitable_donations_annual ? formatCurrency(scenario.charitable_donations_annual) : ''}
                    onChange={e => onChange({ charitable_donations_annual: parseCurrency(e.target.value) })}
                    placeholder="$0"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                </div>
              </div>
            </>
          )}
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 space-y-4">
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showMortgage}
              onChange={e => {
                const checked = e.target.checked;
                setShowMortgage(checked);
                if (!checked) {
                  onChange({
                    mortgage: {
                      balance: 0,
                      rate: 0,
                      amortization_end_age: scenario.retirement_age,
                    },
                  });
                }
              }}
              className="w-4 h-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
            />
            <div>
              <span className="text-sm font-medium text-gray-800">Do you want to model a mortgage?</span>
              <p className="text-xs text-amber-700 mt-1">
                Use this if you want the projection to include mortgage balance, rate, and amortization.
              </p>
            </div>
          </label>

          {showMortgage && (
            <>
              <div>
                <h4 className="font-semibold text-amber-900">Mortgage</h4>
                <p className="text-sm text-amber-700 mt-1">Optional debt-servicing inputs. Leave balance at $0 if there is no mortgage to model.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <span className="inline-flex items-center gap-1.5">
                      Current Mortgage Balance
                      <FieldHelpButton onClick={() => setActiveHelpTopic('mortgage_balance')} />
                    </span>
                  </label>
                  <input
                    type="text"
                    value={mortgage.balance ? formatCurrency(mortgage.balance) : ''}
                    onChange={e => onChange({ mortgage: { ...mortgage, balance: parseCurrency(e.target.value) } })}
                    placeholder="$0"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <span className="inline-flex items-center gap-1.5">
                      Interest Rate (%)
                      <FieldHelpButton onClick={() => setActiveHelpTopic('mortgage_rate')} />
                    </span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    max={25}
                    value={mortgage.rate}
                    onChange={e => onChange({ mortgage: { ...mortgage, rate: parseFloat(e.target.value) || 0 } })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <span className="inline-flex items-center gap-1.5">
                      Amortization End Age
                      <FieldHelpButton onClick={() => setActiveHelpTopic('mortgage_amortization')} />
                    </span>
                  </label>
                  <AgeInput
                    value={mortgage.amortization_end_age}
                    min={18}
                    max={MAX_AGE}
                    onChange={v => onChange({ mortgage: { ...mortgage, amortization_end_age: v! } })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
