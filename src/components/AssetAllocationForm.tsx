import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { AssetAllocation, SavingsAccount, Person } from '../types/retirement';

interface AssetAllocationFormProps {
  allocations: AssetAllocation[];
  onChange: (allocations: AssetAllocation[]) => void;
  savingsAccounts: SavingsAccount[];
}

const COLORS = { stocks: '#3b82f6', bonds: '#10b981', cash: '#f59e0b', real_estate: '#ef4444', other: '#6b7280' };
const ACCOUNT_NAMES: Record<string, string> = { rrsp: 'RRSP', tfsa: 'TFSA', fhsa: 'FHSA', non_reg: 'Non-Registered' };

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
    stocks: 60, bonds: 30, cash: 10, real_estate: 0, other: 0,
    us_equity_weight: 60, cad_equity_weight: 40
  };
}

export default function AssetAllocationForm({ allocations, onChange, savingsAccounts }: AssetAllocationFormProps) {
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

  const updateAllocation = (accountType: string, person: Person | undefined, field: keyof AssetAllocation, value: number) => {
    const matches = (a: AssetAllocation) => a.account_type === accountType && (a.person ?? undefined) === person;
    const existing = allocations.find(matches);
    if (existing) {
      onChange(allocations.map(a => matches(a) ? { ...a, [field]: value } : a));
    } else {
      const base = getAllocation(allocations, accountType, person);
      onChange([...allocations, { ...base, [field]: value }]);
    }
  };

  const updateGeoWeight = (accountType: string, person: Person | undefined, usWeight: number) => {
    const cadWeight = 100 - usWeight;
    const matches = (a: AssetAllocation) => a.account_type === accountType && (a.person ?? undefined) === person;
    const existing = allocations.find(matches);
    if (existing) {
      onChange(allocations.map(a =>
        matches(a)
          ? { ...a, us_equity_weight: usWeight, cad_equity_weight: cadWeight }
          : a
      ));
    } else {
      const base = getAllocation(allocations, accountType, person);
      onChange([...allocations, { ...base, us_equity_weight: usWeight, cad_equity_weight: cadWeight }]);
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
        const total = alloc.stocks + alloc.bonds + alloc.cash + alloc.real_estate + alloc.other;
        const usWeight = alloc.us_equity_weight ?? 60;
        const cadWeight = alloc.cad_equity_weight ?? 40;

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
                {(['stocks', 'bonds', 'cash', 'real_estate', 'other'] as const).map(field => (
                  <div key={field}>
                    <div className="flex justify-between mb-1">
                      <label className="text-sm font-medium text-gray-700 capitalize">{field.replace('_', ' ')} (%)</label>
                    </div>
                    <div className="flex items-center gap-3">
                      <input type="range" min={0} max={100} step={5} value={alloc[field]}
                        onChange={e => updateAllocation(target.accountType, target.person, field, parseInt(e.target.value))}
                        className="flex-1 accent-blue-600" />
                      <input type="number" min={0} max={100} step={5} value={alloc[field]}
                        onChange={e => updateAllocation(target.accountType, target.person, field, parseFloat(e.target.value) || 0)}
                        className="w-16 px-2 py-1 border border-gray-300 rounded text-sm text-center" />
                    </div>
                  </div>
                ))}
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
                    Equity Geographic Mix
                    <span className="ml-2 text-xs font-normal text-gray-500">(applies to {alloc.stocks}% stocks allocation)</span>
                  </h5>
                  <p className="text-xs text-gray-500">
                    Split your equity between US (S&amp;P 500) and Canadian (TSX) markets. Used in Monte Carlo simulations with correlated returns, USD/CAD currency hedging, and fat-tail risk modeling.
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium text-gray-600 w-20 shrink-0">US (S&amp;P 500)</span>
                    <input
                      type="range" min={0} max={100} step={5} value={usWeight}
                      onChange={e => updateGeoWeight(target.accountType, target.person, parseInt(e.target.value))}
                      className="flex-1 accent-blue-600"
                    />
                    <input
                      type="number" min={0} max={100} step={5} value={usWeight}
                      onChange={e => updateGeoWeight(target.accountType, target.person, Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                      className="w-16 px-2 py-1 border border-gray-300 rounded text-sm text-center"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium text-gray-600 w-20 shrink-0">CAD (TSX)</span>
                    <div className="flex-1 bg-gray-100 rounded h-2 relative overflow-hidden">
                      <div className="bg-emerald-500 h-full rounded transition-all" style={{ width: `${cadWeight}%` }} />
                    </div>
                    <span className="w-16 text-sm font-semibold text-emerald-700 text-center">{cadWeight}%</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-center">
                      <div className="text-xs text-blue-600 font-medium">S&amp;P 500 (USD)</div>
                      <div className="text-base font-bold text-blue-800">{usWeight}%</div>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-center">
                      <div className="text-xs text-emerald-600 font-medium">TSX (CAD)</div>
                      <div className="text-base font-bold text-emerald-800">{cadWeight}%</div>
                    </div>
                  </div>
                  {usWeight + cadWeight !== 100 && (
                    <p className="text-xs text-red-600 mt-1">Geographic weights must sum to 100% (US: {usWeight}% + CAD: {cadWeight}% = {usWeight + cadWeight}%)</p>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
        <strong>Rule of 120:</strong> Subtract your age from 120 for approximate stock allocation. At age 40 → 80% stocks, 20% bonds.
        <span className="block mt-1 text-blue-700">The geographic mix drives correlated Monte Carlo stress tests using Cholesky decomposition for S&amp;P 500 / TSX returns and models USD/CAD currency volatility.</span>
      </div>
    </div>
  );
}
