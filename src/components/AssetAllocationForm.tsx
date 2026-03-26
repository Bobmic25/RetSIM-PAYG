import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { AssetAllocation, SavingsAccount, Person, RiskProfile, Scenario } from '../types/retirement';

interface AssetAllocationFormProps {
  allocations: AssetAllocation[];
  onChange: (allocations: AssetAllocation[]) => void;
  savingsAccounts: SavingsAccount[];
  scenario: Scenario;
}

const COLORS = { stocks: '#3b82f6', bonds: '#10b981', cash: '#f59e0b', real_estate: '#ef4444', other: '#6b7280' };
const ACCOUNT_NAMES: Record<string, string> = { rrsp: 'RRSP', tfsa: 'TFSA', fhsa: 'FHSA', non_reg: 'Non-Registered' };

const RISK_PROFILES: Array<{
  id: RiskProfile;
  label: string;
  strategy: string;
  stocks: number;
  bonds: number;
  returnRange: string;
  description: string;
}> = [
  {
    id: 'conservative',
    label: 'Conservative',
    strategy: 'Capital Preservation',
    stocks: 20,
    bonds: 80,
    returnRange: '3.0% - 4.0%',
    description: 'Prioritizes protecting your principal and reducing volatility. Best for short horizons or low risk tolerance.',
  },
  {
    id: 'balanced',
    label: 'Balanced',
    strategy: 'Growth & Income',
    stocks: 60,
    bonds: 40,
    returnRange: '5.0% - 6.0%',
    description: 'A classic middle-ground approach seeking steady growth with moderate protection against market dips.',
  },
  {
    id: 'aggressive',
    label: 'Aggressive',
    strategy: 'Maximum Growth',
    stocks: 90,
    bonds: 10,
    returnRange: '7.0% - 8.5%',
    description: 'Maximizes long-term wealth through high equity exposure. Expect significant year-to-year value swings.',
  },
];

interface AllocationTarget {
  key: string;
  accountType: string;
  person?: Person;
  label: string;
}

function getAllocation(allocations: AssetAllocation[], accountType: string, person?: Person): AssetAllocation {
  const specific = allocations.find(a => a.account_type === accountType && (a.person ?? 'primary') === (person ?? 'primary'));
  const fallback = allocations.find(a => a.account_type === accountType && a.person == null);
  return specific || fallback || {
    account_type: accountType as AssetAllocation['account_type'],
    person,
    risk_profile: 'balanced',
    stocks: 60, bonds: 40, cash: 0, real_estate: 0, other: 0,
    us_equity_weight: 40, cad_equity_weight: 60, int_equity_weight: 0
  };
}

function getSuggestedProfile(currentAge: number, retirementAge: number): RiskProfile {
  const yearsToRetirement = retirementAge - currentAge;
  if (yearsToRetirement > 10) return 'aggressive';
  if (yearsToRetirement <= 0) return 'balanced';
  if (yearsToRetirement <= 5) return 'balanced';
  return 'balanced';
}

function applyRiskProfile(profile: RiskProfile): Pick<AssetAllocation, 'risk_profile' | 'stocks' | 'bonds' | 'cash' | 'real_estate' | 'other'> {
  const preset = RISK_PROFILES.find(item => item.id === profile) ?? RISK_PROFILES[1];
  return {
    risk_profile: preset.id,
    stocks: preset.stocks,
    bonds: preset.bonds,
    cash: 0,
    real_estate: 0,
    other: 0,
  };
}

function rebalanceGeoWeights(
  current: { cad: number; us: number; intl: number },
  field: 'cad' | 'us' | 'intl',
  nextValue: number,
): { cad: number; us: number; intl: number } {
  const clamped = Math.max(0, Math.min(100, nextValue));
  const remaining = Math.max(0, 100 - clamped);
  const otherKeys = (['cad', 'us', 'intl'] as const).filter(key => key !== field);
  const otherTotal = otherKeys.reduce((sum, key) => sum + current[key], 0);

  const next = { ...current, [field]: clamped };
  if (otherTotal <= 0) {
    const equal = remaining / otherKeys.length;
    otherKeys.forEach(key => {
      next[key] = equal;
    });
  } else {
    otherKeys.forEach((key, index) => {
      if (index === otherKeys.length - 1) return;
      next[key] = Number(((current[key] / otherTotal) * remaining).toFixed(2));
    });
    const assigned = otherKeys.slice(0, -1).reduce((sum, key) => sum + next[key], 0);
    next[otherKeys[otherKeys.length - 1]] = Number((remaining - assigned).toFixed(2));
  }

  const total = next.cad + next.us + next.intl;
  if (total !== 100) {
    next.intl = Number((next.intl + (100 - total)).toFixed(2));
  }

  return next;
}

export default function AssetAllocationForm({ allocations, onChange, savingsAccounts, scenario }: AssetAllocationFormProps) {
  const presentAccountTypes = [...new Set(savingsAccounts.map(a => a.account_type))];
  const hasPrimaryNonReg = savingsAccounts.some(a => a.account_type === 'non_reg' && a.person === 'primary');
  const hasSpouseNonReg = savingsAccounts.some(a => a.account_type === 'non_reg' && a.person === 'spouse');

  const allocationTargets: AllocationTarget[] = presentAccountTypes.flatMap((accountType) => {
    if (accountType !== 'non_reg') {
      return [{ key: accountType, accountType, label: ACCOUNT_NAMES[accountType] }];
    }

    const targets: AllocationTarget[] = [];
    if (hasPrimaryNonReg) {
      targets.push({ key: 'non_reg_primary', accountType: 'non_reg', person: 'primary', label: 'Non-Registered (Primary)' });
    }
    if (hasSpouseNonReg) {
      targets.push({ key: 'non_reg_spouse', accountType: 'non_reg', person: 'spouse', label: 'Non-Registered (Spouse)' });
    }

    // Backward compatibility: if person metadata is unavailable, keep a single shared bucket.
    if (targets.length === 0) {
      targets.push({ key: 'non_reg', accountType: 'non_reg', label: 'Non-Registered' });
    }
    return targets;
  });

  if (presentAccountTypes.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        <p className="text-lg font-medium mb-2">No savings accounts defined</p>
        <p className="text-sm">Go back to the Savings step to add accounts first.</p>
      </div>
    );
  }

  const updateGeoWeights = (accountType: string, person: Person | undefined, weights: { cad: number; us: number; intl: number }) => {
    const matches = (a: AssetAllocation) => a.account_type === accountType && (a.person ?? undefined) === person;
    const existing = allocations.find(matches);
    if (existing) {
      onChange(allocations.map(a =>
        matches(a)
          ? { ...a, us_equity_weight: weights.us, cad_equity_weight: weights.cad, int_equity_weight: weights.intl }
          : a
      ));
    } else {
      const base = getAllocation(allocations, accountType, person);
      onChange([...allocations, { ...base, us_equity_weight: weights.us, cad_equity_weight: weights.cad, int_equity_weight: weights.intl }]);
    }
  };

  const updateRiskProfile = (accountType: string, person: Person | undefined, profile: RiskProfile) => {
    const preset = applyRiskProfile(profile);
    const matches = (a: AssetAllocation) => a.account_type === accountType && (a.person ?? undefined) === person;
    const existing = allocations.find(matches);
    if (existing) {
      onChange(allocations.map(a => matches(a) ? { ...a, ...preset } : a));
    } else {
      const base = getAllocation(allocations, accountType, person);
      onChange([...allocations, { ...base, ...preset }]);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Asset Allocation</h3>
        <p className="text-sm text-gray-600">Define the investment mix for each account. Values should total 100%.</p>
      </div>

      {allocationTargets.map(target => {
        const alloc = getAllocation(allocations, target.accountType, target.person);
        const selectedProfile = alloc.risk_profile ?? 'balanced';
        const total = alloc.stocks + alloc.bonds + alloc.cash + alloc.real_estate + alloc.other;
        const usWeight = alloc.us_equity_weight ?? 60;
        const cadWeight = alloc.cad_equity_weight ?? 40;
        const intlWeight = alloc.int_equity_weight ?? Math.max(0, 100 - usWeight - cadWeight);
        const currentWeights = { cad: cadWeight, us: usWeight, intl: intlWeight };
        const targetCurrentAge = target.person === 'spouse'
          ? (scenario.spouse_age ?? scenario.current_age)
          : scenario.current_age;
        const suggestedProfile = getSuggestedProfile(targetCurrentAge, scenario.retirement_age);

        const pieData = [
          { name: 'Stocks', value: alloc.stocks, color: COLORS.stocks },
          { name: 'Bonds', value: alloc.bonds, color: COLORS.bonds },
          { name: 'Cash', value: alloc.cash, color: COLORS.cash },
          { name: 'Real Estate', value: alloc.real_estate, color: COLORS.real_estate },
          { name: 'Other', value: alloc.other, color: COLORS.other }
        ].filter(d => d.value > 0);

        return (
          <div key={target.key} className="bg-white border border-gray-200 rounded-lg p-5">
            <h4 className="font-semibold text-gray-900 mb-4">{target.label}</h4>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-sm font-semibold text-gray-800">Risk Profile</label>
                    <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${total === 100 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                      Mix {alloc.stocks}% / {alloc.bonds}%
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {RISK_PROFILES.map(profile => {
                      const isSelected = selectedProfile === profile.id;
                      const isSuggested = suggestedProfile === profile.id;
                      return (
                        <button
                          key={profile.id}
                          type="button"
                          onClick={() => updateRiskProfile(target.accountType, target.person, profile.id)}
                          className={`rounded-lg border px-4 py-3 text-left transition-colors ${isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-gray-900">{profile.label}</span>
                                {isSuggested && (
                                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                                    Suggested
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-gray-500 mt-0.5">{profile.strategy}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="text-sm font-semibold text-gray-800">{profile.stocks}% / {profile.bonds}%</div>
                              <div className="text-xs text-gray-500">{profile.returnRange}</div>
                            </div>
                          </div>
                          <p className="text-xs text-gray-600 mt-2 leading-5">{profile.description}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className={`text-sm font-semibold pt-2 border-t ${total === 100 ? 'text-green-600' : 'text-red-600'}`}>
                  Total: {total}% {total !== 100 && `— needs ${total > 100 ? total - 100 : 100 - total}% ${total > 100 ? 'removed' : 'more'}`}
                </div>
              </div>
              <div className="flex items-center justify-center">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" outerRadius={85} dataKey="value"
                      label={({ name, value }) => `${name} ${value}%`} labelLine={false}>
                      {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip formatter={(v) => `${v}%`} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {alloc.stocks > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="mb-3">
                  <h5 className="text-sm font-semibold text-gray-800 mb-1">
                    Geographic Equity Mix
                    <span className="ml-2 text-xs font-normal text-gray-500">({alloc.stocks}% of this account is currently in stocks)</span>
                  </h5>
                  <p className="text-xs text-gray-500">
                    Define how your stock portfolio is distributed globally. The simulation will automatically account for your bond/cash allocation based on your risk profile.
                  </p>
                </div>
                <div className="space-y-2">
                  {([
                    { key: 'cad', label: 'Canada (TSX)', color: 'accent-red-600', value: cadWeight },
                    { key: 'us', label: 'US (S&P 500)', color: 'accent-blue-600', value: usWeight },
                    { key: 'intl', label: 'International', color: 'accent-violet-600', value: intlWeight },
                  ] as const).map(item => (
                  <div key={item.key} className="flex items-center gap-3">
                    <span className="text-xs font-medium text-gray-600 w-24 shrink-0">{item.label}</span>
                    <input
                      type="range" min={0} max={100} step={1} value={Math.round(item.value)}
                      onChange={e => updateGeoWeights(target.accountType, target.person, rebalanceGeoWeights(currentWeights, item.key, parseInt(e.target.value) || 0))}
                      className={`flex-1 ${item.color}`}
                    />
                    <input
                      type="number" min={0} max={100} step={1} value={Math.round(item.value)}
                      onChange={e => updateGeoWeights(target.accountType, target.person, rebalanceGeoWeights(currentWeights, item.key, Math.min(100, Math.max(0, parseInt(e.target.value) || 0))))}
                      className="w-16 px-2 py-1 border border-gray-300 rounded text-sm text-center"
                    />
                  </div>
                  ))}
                  {Math.round(cadWeight + usWeight + intlWeight) !== 100 && (
                    <p className="text-xs text-red-600 mt-1">Geographic weights must sum to 100%.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
        <strong>How this info is used:</strong> This allocation determines the expected growth rate of each account. Geographic equity weights are applied only to the stock portion of each account, then scaled down to the account's total portfolio weight for Monte Carlo stress tests.
        <span className="block mt-1 text-blue-700">Suggested defaults: Aggressive more than 10 years before retirement, Balanced near retirement, and Balanced or Conservative after retirement to reduce sequence-of-return risk.</span>
      </div>
    </div>
  );
}
