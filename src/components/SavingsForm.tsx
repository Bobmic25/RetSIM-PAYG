import { useState } from 'react';
import { Plus, Trash2, HelpCircle, X } from 'lucide-react'; // Added HelpCircle
import { SavingsAccount, Scenario } from '../types/retirement';
import { formatCurrency } from '../lib/formatters';
import { LiveTfsaLimitData } from '../lib/tfsaDataService';
import { MAX_AGE, clampAge } from '../lib/ageUtils';

interface SavingsFormProps {
  accounts: SavingsAccount[];
  onChange: (accounts: SavingsAccount[]) => void;
  scenario: Scenario;
  tfsaLimitData?: LiveTfsaLimitData | null;
}

const ACCOUNT_LABELS: Record<string, string> = {
  rrsp: 'RRSP', tfsa: 'TFSA', fhsa: 'FHSA', non_reg: 'Non-Registered'
};

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

function AccountCard({ account, index, onUpdate, onRemove, retirementAge, tfsaLimitData }: {
  account: SavingsAccount; index: number;
  onUpdate: (i: number, u: Partial<SavingsAccount>) => void;
  onRemove: (i: number) => void;
  retirementAge: number;
  tfsaLimitData?: LiveTfsaLimitData | null;
}) {
  const [contribUnit, setContribUnit] = useState<'Yearly' | 'Monthly'>('Yearly');
  const [showRRSPHelp, setShowRRSPHelp] = useState(false);
  const [showTFSAHelp, setShowTFSAHelp] = useState(false);
  const storedMonthly = account.monthly_contribution;
  const displayContrib = contribUnit === 'Monthly' ? storedMonthly : storedMonthly * 12;
  const tfsaMonthlyLimit = tfsaLimitData ? tfsaLimitData.annualLimit / 12 : null;
  const deductFromSalary = account.deduct_from_salary !== false;
  const salaryLabel = account.person === 'spouse' ? 'Spouse Salary' : 'Primary Salary';

  const handleContribChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = parseFloat(e.target.value.replace(/[$,]/g, '')) || 0;
    const monthlyContribution = contribUnit === 'Monthly' ? raw : raw / 12;
    const clampedContribution = account.account_type === 'tfsa' && tfsaMonthlyLimit != null
      ? Math.min(monthlyContribution, tfsaMonthlyLimit)
      : monthlyContribution;
    onUpdate(index, { monthly_contribution: clampedContribution });
  };

  const handleBalanceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = parseFloat(e.target.value.replace(/[$,]/g, '')) || 0;
    onUpdate(index, { current_balance: raw });
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
      <div className="flex justify-between items-center">
        <span className="font-medium text-gray-900">{ACCOUNT_LABELS[account.account_type] || account.account_type}</span>
        <button type="button" onClick={() => onRemove(index)} className="text-red-500 hover:text-red-700"><Trash2 className="w-4 h-4" /></button>
      </div>
      
      {showRRSPHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50 rounded-t-2xl">
              <h2 className="text-lg font-bold text-gray-900">RRSP Account Information</h2>
              <button
                onClick={() => setShowRRSPHelp(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-200 transition-colors text-gray-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm text-gray-700 leading-relaxed">
                RRSP accounts should include all deposits intended for this account type, including direct personal contributions and employer-sponsored plans such as Defined Contribution Pension Plans (DCPP). To capture employer RRSP contributions separately, add a second RRSP savings account and uncheck the option to deduct that contribution from Primary or Spouse Salary.
              </p>
            </div>
          </div>
        </div>
      )}

      {showTFSAHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50 rounded-t-2xl">
              <h2 className="text-lg font-bold text-gray-900">TFSA Account Information</h2>
              <button
                onClick={() => setShowTFSAHelp(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-200 transition-colors text-gray-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-3">
              <p className="text-sm text-gray-700 leading-relaxed">
                Surplus cash in the projection is re-invested into TFSA accounts first, up to the remaining annual TFSA limit for that year. Any surplus above that limit flows into non-registered accounts.
              </p>
              <p className="text-sm text-gray-700 leading-relaxed">
                The annual TFSA cap starts from the current CRA limit and increases over time with inflation. The model only raises the usable cap when the inflation-indexed amount crosses the next $500 step, matching the CRA-style rounding pattern.
              </p>
              <p className="text-sm text-gray-700 leading-relaxed">
                Planned TFSA contributions in this form count first. If those planned deposits use part of the year’s TFSA limit, only the remaining annual room is available for automatic surplus re-investment later in that same year.
              </p>
            </div>
          </div>
        </div>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          {/* Label with dynamic HelpCircle button for RRSP */}
          <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
            Account Type
            {account.account_type === 'rrsp' && (
              <button 
                type="button"
                onClick={() => setShowRRSPHelp(true)}
                className="text-gray-400 hover:text-blue-600 transition-colors p-0.5"
                title="Click for more information"
              >
                <HelpCircle className="w-3.5 h-3.5" />
              </button>
            )}
            {account.account_type === 'tfsa' && (
              <button
                type="button"
                onClick={() => setShowTFSAHelp(true)}
                className="text-gray-400 hover:text-blue-600 transition-colors p-0.5"
                title="Click for TFSA information"
              >
                <HelpCircle className="w-3.5 h-3.5" />
              </button>
            )}
          </label>
          <select value={account.account_type} onChange={e => onUpdate(index, {
            account_type: e.target.value as any,
            is_primary_residence: e.target.value === 'non_reg' ? account.is_primary_residence : false,
          })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg">
            <option value="rrsp">RRSP</option>
            <option value="tfsa">TFSA</option>
            <option value="fhsa">FHSA</option>
            <option value="non_reg">Non-Registered</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Current Balance</label>
          <input type="text" value={account.current_balance ? formatCurrency(account.current_balance) : ''}
            onChange={handleBalanceChange} placeholder="$0"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-medium text-gray-700">Contribution</label>
            <Toggle labelA="Yearly" labelB="Monthly" active={contribUnit}
              onToggle={() => setContribUnit(u => u === 'Yearly' ? 'Monthly' : 'Yearly')} />
          </div>
          <input type="text" value={displayContrib ? formatCurrency(displayContrib) : ''}
            onChange={handleContribChange} placeholder="$0"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          <p className="text-xs text-gray-500 mt-1">
            = {contribUnit === 'Yearly'
              ? `${formatCurrency(storedMonthly)} /mo`
              : `${formatCurrency(storedMonthly * 12)} /yr`}
          </p>
          {account.account_type === 'tfsa' && tfsaLimitData && (
            <p className={`text-xs mt-1 ${tfsaLimitData.isLive ? 'text-green-700' : 'text-amber-700'}`}>
              TFSA contribution is capped at {formatCurrency(tfsaLimitData.annualLimit)} /yr
              ({formatCurrency(tfsaLimitData.annualLimit / 12)} /mo) based on {tfsaLimitData.isLive ? 'live startup lookup' : 'built-in fallback'} for {tfsaLimitData.year}.
            </p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Contribution End Age</label>
          <input type="number" value={account.contribution_end_age} min={18} max={MAX_AGE}
            onChange={e => onUpdate(index, { contribution_end_age: clampAge(parseInt(e.target.value), retirementAge) })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
        </div>
        <div className="md:col-span-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={deductFromSalary}
              onChange={e => onUpdate(index, { deduct_from_salary: e.target.checked })}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <div className="space-y-1">
              <span className="text-sm font-medium text-gray-800">
                Deduct this contribution from {salaryLabel}
              </span>
              <p className="text-xs text-gray-500">
                {deductFromSalary
                  ? 'Checked: this contribution is funded from employment income instead of an outside source.'
                  : 'Unchecked: this contribution is treated as external money added on top of salary.'}
              </p>
            </div>
          </label>
          {account.account_type === 'rrsp' && deductFromSalary && (
            <p className="mt-2 text-xs text-blue-700">
              RRSP note: when checked, this contribution is taken from salary before income tax. To model employer RRSP contributions, add a second RRSP account and leave this box unchecked.
            </p>
          )}
        </div>
        {account.account_type === 'non_reg' && (
          <div className="md:col-span-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-3">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={account.is_primary_residence || false}
                onChange={e => onUpdate(index, { is_primary_residence: e.target.checked })}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-rose-600 focus:ring-rose-500"
              />
              <div className="space-y-1">
                <span className="text-sm font-medium text-gray-800">Treat this non-registered asset as the primary residence</span>
                <p className="text-xs text-gray-500">
                  Primary-residence balances are excluded from terminal capital gains tax and can be used by downsizing events.
                </p>
              </div>
            </label>
          </div>
        )}
        <div className="md:col-span-2">
          <div className="flex items-center gap-3">
            <Toggle
              labelA="Fixed $"
              labelB="Inflation-Linked"
              active={(account.inflation_linked !== false) ? 'Inflation-Linked' : 'Fixed $'}
              onToggle={() => onUpdate(index, { inflation_linked: account.inflation_linked === false })}
            />
            <span className="text-xs text-gray-500">
              {account.inflation_linked !== false
                ? 'Contributions grow with CPI each year'
                : 'Contributions stay at the entered amount'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PersonSection({ label, accentClass, accounts, onAdd, onUpdate, onRemove, retirementAge, tfsaLimitData }: {
  label: string; accentClass: string;
  accounts: SavingsAccount[];
  onAdd: () => void;
  onUpdate: (i: number, u: Partial<SavingsAccount>) => void;
  onRemove: (i: number) => void;
  retirementAge: number;
  tfsaLimitData?: LiveTfsaLimitData | null;
}) {
  return (
    <div className={`rounded-lg border p-4 ${accentClass}`}>
      <div className="flex justify-between items-center mb-4">
        <h4 className="font-semibold text-gray-900">{label}</h4>
        <button type="button" onClick={onAdd}
          className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm">
          <Plus className="w-4 h-4" /> Add Account
        </button>
      </div>
      {accounts.length === 0
        ? <p className="text-gray-500 text-sm text-center py-4">No accounts added.</p>
        : accounts.map((a, i) => (
          <div key={i} className="mb-3">
            <AccountCard account={a} index={i} onUpdate={onUpdate} onRemove={onRemove} retirementAge={retirementAge} tfsaLimitData={tfsaLimitData} />
          </div>
        ))
      }
    </div>
  );
}

export default function SavingsForm({ accounts, onChange, scenario, tfsaLimitData }: SavingsFormProps) {
  const isCouple = scenario.profile_type === 'couple';
  const primary = accounts.filter(a => a.person === 'primary');
  const spouse = accounts.filter(a => a.person === 'spouse');
  const tfsaMonthlyLimit = tfsaLimitData ? tfsaLimitData.annualLimit / 12 : null;
  const spouseRetirementAge = scenario.spouse_retirement_age ?? scenario.retirement_age;

  const applyTfsaCap = (account: SavingsAccount): SavingsAccount => {
    if (account.account_type !== 'tfsa' || tfsaMonthlyLimit == null) return account;
    if (account.monthly_contribution <= tfsaMonthlyLimit) return account;
    return { ...account, monthly_contribution: tfsaMonthlyLimit };
  };

  const addAccount = (person: 'primary' | 'spouse') => {
    onChange([...accounts, {
      person,
      account_type: 'rrsp',
      current_balance: 0,
      monthly_contribution: 0,
      contribution_end_age: person === 'spouse' ? spouseRetirementAge : scenario.retirement_age,
      deduct_from_salary: true,
    }]);
  };

  const updateByPerson = (person: 'primary' | 'spouse', localIndex: number, updates: Partial<SavingsAccount>) => {
    const all = [...accounts];
    let count = 0;
    for (let i = 0; i < all.length; i++) {
      if (all[i].person === person) {
        if (count === localIndex) {
          all[i] = applyTfsaCap({ ...all[i], ...updates });
          break;
        }
        count++;
      }
    }
    onChange(all);
  };

  const removeByPerson = (person: 'primary' | 'spouse', localIndex: number) => {
    let count = 0;
    onChange(accounts.filter(a => {
      if (a.person !== person) return true;
      if (count === localIndex) { count++; return false; }
      count++;
      return true;
    }));
  };

  if (!isCouple) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold text-gray-900">Savings Accounts</h3>
          <button type="button" onClick={() => addAccount('primary')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            <Plus className="w-4 h-4" /> Add Account
          </button>
        </div>
        {accounts.length === 0
          ? <p className="text-center py-8 text-gray-500">No accounts added.</p>
          : accounts.map((a, i) => (
            <AccountCard key={i} account={a} index={i}
              onUpdate={(_, u) => {
                const upd = [...accounts];
                upd[i] = applyTfsaCap({ ...upd[i], ...u });
                onChange(upd);
              }}
              onRemove={idx => onChange(accounts.filter((_, ii) => ii !== idx))}
              retirementAge={scenario.retirement_age}
              tfsaLimitData={tfsaLimitData} />
          ))
        }
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-gray-900">Savings Accounts</h3>
      <PersonSection label="Primary Person" accentClass="bg-blue-50 border-blue-200"
        accounts={primary} onAdd={() => addAccount('primary')}
        onUpdate={(i, u) => updateByPerson('primary', i, u)}
        onRemove={i => removeByPerson('primary', i)}
        retirementAge={scenario.retirement_age}
        tfsaLimitData={tfsaLimitData} />
      <PersonSection label="Spouse" accentClass="bg-cyan-50 border-cyan-200"
        accounts={spouse} onAdd={() => addAccount('spouse')}
        onUpdate={(i, u) => updateByPerson('spouse', i, u)}
        onRemove={i => removeByPerson('spouse', i)}
        retirementAge={spouseRetirementAge}
        tfsaLimitData={tfsaLimitData} />
    </div>
  );
}