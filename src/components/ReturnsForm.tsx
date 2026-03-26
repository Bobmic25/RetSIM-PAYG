import { useState } from 'react';
import { Plus, Trash2, HelpCircle, X } from 'lucide-react';
import { Scenario } from '../types/retirement';
import { MONTE_CARLO_MAX_ITERATIONS, MONTE_CARLO_DEFAULT_ITERATIONS } from '../lib/monteCarloEngine';
import { MarketAssumptions } from '../lib/marketAssumptions';
import { DEFAULT_MANAGEMENT_FEE_PCT } from '../lib/constants';

interface ReturnsFormProps {
  scenario: Scenario;
  onChange: (updates: Partial<Scenario>) => void;
  marketAssumptionsAuto: boolean;
  onSetMarketAssumptionsAuto: (value: boolean) => void;
  estimatedMarketAssumptions: MarketAssumptions;
}

function MonteCarloInfoModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">How Monte Carlo Simulation Works</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors rounded-lg p-1 hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-6">
          <p className="text-gray-600 leading-relaxed">
            Instead of assuming a single fixed return each year, Monte Carlo simulation runs hundreds or thousands of possible futures, each with different random return sequences. This gives you a realistic range of outcomes rather than a single "best guess" projection.
          </p>

          <div className="space-y-2">
            <h3 className="font-semibold text-gray-900">Random Returns — Fat Tails Included</h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              Each year's return is drawn from a <strong>Student-t distribution</strong> (not a simple normal bell curve). The t-distribution has "fat tails," meaning it correctly captures the possibility of rare but severe crashes (like 2008) and outsized boom years. You control the expected return and standard deviation; the simulator handles the rest.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold text-gray-900">Canada, US, and International Markets Move Together</h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              The equity markets are not simulated independently. A <strong>Cholesky decomposition</strong> is used to correlate Canadian, US, and International equity returns so market shocks can spill across regions. In bad years, those markets often fall together; in good years, they often rise together. Your geographic allocation controls adjust the blend of those correlated streams.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold text-gray-900">Inflation Is Also Randomized</h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              Inflation is modelled as a <strong>mean-reverting, autocorrelated process</strong>. It drifts randomly each year but is always pulled back toward a long-run average (around 2.5%). This means the simulator correctly avoids scenarios where inflation permanently spirals to 20% or stays at 0% forever — it behaves more like real economies do.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold text-gray-900">Number of Simulations</h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              The default is <strong>1,000 simulations</strong>, which balances accuracy with speed. You can increase this up to {MONTE_CARLO_MAX_ITERATIONS.toLocaleString('en-CA')} for more stable percentile estimates, or lower it if you need faster results. More simulations reduce random noise in the output but take longer to compute.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold text-gray-900">Reading the Percentile Bands</h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              The results display three outcome bands:
            </p>
            <ul className="text-sm text-gray-600 space-y-1 ml-4 list-disc">
              <li><strong>10th percentile (pessimistic):</strong> Only 10% of simulations ended worse than this. Think of it as a stress-test scenario.</li>
              <li><strong>50th percentile (median):</strong> The middle outcome — half of all simulations did better, half did worse.</li>
              <li><strong>90th percentile (optimistic):</strong> Only 10% of simulations ended better than this. A favourable but realistic upper bound.</li>
            </ul>
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold text-gray-900">Success Rate</h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              The <strong>success rate</strong> is the percentage of simulations where your portfolio never reached zero during your lifetime. A rate of 90% or above is generally considered a strong plan; below 70% suggests your spending or retirement date may need adjustment.
            </p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              <strong>Tip:</strong> Use Monte Carlo mode to stress-test your plan. If even the pessimistic (10th percentile) path looks acceptable, you have a robust retirement strategy.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

const STRATEGIES = [
  {
    id: 'maximize_spending' as const,
    label: 'Maximize Life Spending',
    badge: 'Most spending',
    badgeColor: '#2563eb',
    description: 'Draws maximum from registered accounts to maximize controllable spending. Fills lower tax brackets and enforces the configured RRSP exhaustion target each year.',
  },
  {
    id: 'maximize_estate' as const,
    label: 'Maximize Estate Value',
    badge: 'Largest estate',
    badgeColor: '#059669',
    description: 'Preserves registered accounts as long as possible. Prioritizes non-registered then TFSA withdrawals first, letting the RRSP compound to maximize the estate.',
  },
  {
    id: 'tax_efficient' as const,
    label: 'Tax Efficient',
    badge: 'Balanced',
    badgeColor: '#d97706',
    description: 'Balances spending and tax by filling the lowest federal bracket annually. Good for moderate RRSP balances where income smoothing matters most.',
  },
  {
    id: 'net_expenses_only' as const,
    label: 'Net Expenses Only',
    badge: 'Conservative',
    badgeColor: '#7c3aed',
    description: 'Withdraws exactly what is needed to cover after-tax planned expenses — no more. Avoids unnecessary taxable income and bracket-filling while still honouring the RRSP exhaustion schedule.',
  },
  {
    id: 'rrsp_meltdown' as const,
    label: 'RRSP Meltdown',
    badge: 'Early RRSP draw',
    badgeColor: '#dc2626',
    description: 'Follows a smooth annuity-style schedule to deplete the RRSP before the end of plan. Ideal when you are concerned about large forced RRIF income creating tax spikes in your 70s and 80s.',
  },
  {
    id: 'minimize_lifetime_tax' as const,
    label: 'Minimize Lifetime Tax',
    badge: 'Tax-optimized',
    badgeColor: '#0891b2',
    description: 'Proactively draws from RRSP when a forward look-ahead detects future RRIF income that would trigger OAS clawbacks. Spreads registered income across years to reduce lifetime tax and clawback pressure.',
  },
];

const RETURN_MODE_OPTIONS: Array<{
  id: Scenario['return_type'];
  label: string;
  description: string;
  badge?: string;
}> = [
  {
    id: 'linear',
    label: 'Manual Input',
    description: 'Single deterministic return assumption, with optional custom return periods.',
    badge: 'Default',
  },
  {
    id: 'monte_carlo',
    label: 'Monte Carlo',
    description: 'Fat-tail stochastic simulation with percentile bands and a probability of success.',
  },
  {
    id: 'historical_backtesting',
    label: 'Historical Backtesting',
    description: 'Rolls the plan across reference market eras to measure historical survival.',
  },
  {
    id: 'goal_seeking',
    label: 'Goal-Seeking',
    description: 'Binary-search solver for the highest sustainable retirement spending level.',
  },
  {
    id: 'dynamic_guardrails',
    label: 'Dynamic Guardrails',
    description: 'Applies preservation and prosperity rules based on portfolio funding health.',
  },
  {
    id: 'adaptive_withdrawal',
    label: 'Adaptive Withdrawal',
    description: 'Adjusts withdrawals after poor returns to reduce sequence risk.',
  },
];

function StrategyPicker({
  selected,
  onChange,
}: {
  selected: string;
  onChange: (id: typeof STRATEGIES[number]['id']) => void;
}) {
  const selectedStrategy = STRATEGIES.find((strategy) => strategy.id === selected) ?? STRATEGIES[0];

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">Withdrawal Strategy</label>
      <select
        value={selected}
        onChange={(event) => onChange(event.target.value as typeof STRATEGIES[number]['id'])}
        className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 shadow-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
      >
        {STRATEGIES.map((strat) => (
          <option key={strat.id} value={strat.id}>
            {strat.label}
          </option>
        ))}
      </select>

      <div
        className="mt-4 rounded-2xl border px-4 py-4 transition-all duration-200"
        style={{
          borderColor: selectedStrategy.badgeColor + '55',
          backgroundColor: selectedStrategy.badgeColor + '0d',
          boxShadow: `0 8px 24px ${selectedStrategy.badgeColor}14`,
        }}
      >
        <div className="flex items-center justify-between gap-3 mb-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Selected strategy</p>
          <span
            className="text-[11px] font-semibold px-2 py-1 rounded-full"
            style={{
              backgroundColor: selectedStrategy.badgeColor + '20',
              color: selectedStrategy.badgeColor,
            }}
          >
            {selectedStrategy.badge}
          </span>
        </div>
        <h4 className="text-sm font-semibold mb-1" style={{ color: selectedStrategy.badgeColor }}>
          {selectedStrategy.label}
        </h4>
        <p className="text-sm leading-relaxed text-gray-700">{selectedStrategy.description}</p>
      </div>
    </div>
  );
}

export default function ReturnsForm({
  scenario,
  onChange,
  marketAssumptionsAuto,
  onSetMarketAssumptionsAuto,
  estimatedMarketAssumptions,
}: ReturnsFormProps) {
  const currentYear = new Date().getFullYear();
  const [showMonteCarloInfo, setShowMonteCarloInfo] = useState(false);
  const returnPeriods = scenario.return_periods ?? [];
  const effectiveManagementFee = scenario.management_fee_pct ?? DEFAULT_MANAGEMENT_FEE_PCT;
  const netExpectedReturn = scenario.expected_return - effectiveManagementFee;
  const equitySharePct = Math.round(estimatedMarketAssumptions.totalEquityWeight * 100);
  const fixedIncomeSharePct = Math.round(estimatedMarketAssumptions.fixedIncomeWeight * 100);
  const usingAssetAllocations = estimatedMarketAssumptions.source === 'allocations';
  const effectiveCadPortfolioPct = Number(((estimatedMarketAssumptions.totalEquityWeight * estimatedMarketAssumptions.cadEquityWeight)).toFixed(1));
  const effectiveUsPortfolioPct = Number(((estimatedMarketAssumptions.totalEquityWeight * estimatedMarketAssumptions.usEquityWeight)).toFixed(1));
  const effectiveIntlPortfolioPct = Number(((estimatedMarketAssumptions.totalEquityWeight * estimatedMarketAssumptions.intEquityWeight)).toFixed(1));
  const effectiveNonEquityPortfolioPct = Number((estimatedMarketAssumptions.fixedIncomeWeight * 100).toFixed(1));
  const usesDeterministicInputs = ['linear', 'goal_seeking', 'dynamic_guardrails', 'adaptive_withdrawal'].includes(scenario.return_type);
  const showsMonteCarloControls = scenario.return_type === 'monte_carlo';
  const showsHistoricalControls = scenario.return_type === 'historical_backtesting';
  const showsGoalSeekingControls = scenario.return_type === 'goal_seeking';
  const showsGuardrailsControls = scenario.return_type === 'dynamic_guardrails';
  const showsAdaptiveControls = scenario.return_type === 'adaptive_withdrawal';

  const rebalanceGeoWeights = (
    current: { cad: number; us: number; intl: number },
    field: 'cad' | 'us' | 'intl',
    nextValue: number,
  ) => {
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

    onChange({
      cad_equity_weight: next.cad,
      us_equity_weight: next.us,
      int_equity_weight: next.intl,
    });
  };

  const addPeriod = () => {
    const last = returnPeriods[returnPeriods.length - 1];
    const newFrom = last ? last.to_year + 1 : currentYear;
    const newTo = newFrom + 4;
    onChange({ return_periods: [...returnPeriods, { from_year: newFrom, to_year: newTo, return_rate: scenario.expected_return }] });
  };

  const updatePeriod = (index: number, updates: Partial<(typeof returnPeriods)[number]>) => {
    const updated = [...returnPeriods];
    updated[index] = { ...updated[index], ...updates };
    onChange({ return_periods: updated });
  };

  const removePeriod = (index: number) => {
    onChange({ return_periods: returnPeriods.filter((_, i) => i !== index) });
  };

  const ageForYear = (year: number) => {
    const yearsFromNow = year - currentYear;
    return scenario.current_age + yearsFromNow;
  };

  return (
    <>
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Return Type</label>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {RETURN_MODE_OPTIONS.map(option => (
            <button
              key={option.id}
              type="button"
              onClick={() => onChange({ return_type: option.id })}
              className={`rounded-xl border-2 px-4 py-4 text-left transition-colors ${
                scenario.return_type === option.id
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{option.label}</span>
                    {option.badge && (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                        {option.badge}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-gray-500">{option.description}</p>
                </div>
                {option.id === 'monte_carlo' && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={e => { e.stopPropagation(); setShowMonteCarloInfo(true); }}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); setShowMonteCarloInfo(true); } }}
                    className="text-current opacity-60 hover:opacity-100 transition-opacity"
                    aria-label="Learn how Monte Carlo simulation works"
                  >
                    <HelpCircle className="w-4 h-4" />
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {usesDeterministicInputs && !(scenario.return_type === 'linear' && returnPeriods.length > 0) && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {scenario.return_type === 'linear' ? 'Default Annual Return (%)' : 'Expected Annual Return (%)'}
            </label>
            <input type="number" step="0.5" value={scenario.expected_return} min={-10} max={30}
              onChange={e => {
                onSetMarketAssumptionsAuto(false);
                onChange({ expected_return: parseFloat(e.target.value) || 0 });
              }}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            <p className="text-xs text-gray-500 mt-1">Historical long-term average: 6–8%</p>
            <p className="text-xs italic text-gray-500 mt-1">
              {marketAssumptionsAuto
                ? 'Value set based on market estimation in accordance with the equity allocation provided.'
                : 'Manual override active. Re-enable auto-estimation to keep this synced with allocation changes.'}
            </p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Portfolio Management Cost (%)</label>
          <input
            type="number"
            step="0.1"
            min={0}
            max={10}
            value={scenario.management_fee_pct ?? DEFAULT_MANAGEMENT_FEE_PCT}
            onChange={e => onChange({ management_fee_pct: Math.max(0, Math.min(10, parseFloat(e.target.value) || 0)) })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p className="text-xs text-gray-500 mt-1">
            Applied against gross return so projections use a net return of {netExpectedReturn.toFixed(1)}% before taxes. Blank scenarios default to {DEFAULT_MANAGEMENT_FEE_PCT.toFixed(1)}%.
          </p>
        </div>

        {showsMonteCarloControls && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Standard Deviation (%)</label>
              <input type="number" step="0.5" value={scenario.return_std_dev || 10} min={0} max={30}
                onChange={e => {
                  onSetMarketAssumptionsAuto(false);
                  onChange({ return_std_dev: parseFloat(e.target.value) || 0 });
                }}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              <p className="text-xs italic text-gray-500 mt-1">
                {marketAssumptionsAuto
                  ? 'Value set based on market estimation in accordance with the equity allocation provided.'
                  : 'Manual override active. Re-enable auto-estimation to keep this synced with allocation changes.'}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Monte Carlo Iterations</label>
              <input
                type="text"
                value={scenario.monte_carlo_iterations ? scenario.monte_carlo_iterations.toLocaleString('en-CA') : ''}
                onChange={e => {
                  const cleaned = e.target.value.replace(/[^0-9]/g, '');
                  const parsed = parseInt(cleaned) || MONTE_CARLO_DEFAULT_ITERATIONS;
                  onChange({ monte_carlo_iterations: Math.min(parsed, MONTE_CARLO_MAX_ITERATIONS) });
                }}
                placeholder={MONTE_CARLO_DEFAULT_ITERATIONS.toLocaleString('en-CA')}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              <p className="text-xs text-gray-500 mt-1">Recommended: 500–{MONTE_CARLO_MAX_ITERATIONS.toLocaleString('en-CA')} (max)</p>
            </div>
          </>
        )}

        {showsGoalSeekingControls && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Legacy Goal ($)</label>
            <input
              type="number"
              step="5000"
              min={0}
              value={scenario.legacy_goal ?? 0}
              onChange={e => onChange({ legacy_goal: Math.max(0, parseFloat(e.target.value) || 0) })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">The solver searches for the highest annual retirement spending that still finishes at or above this estate target.</p>
          </div>
        )}

        <StrategyPicker
          selected={scenario.withdrawal_strategy}
          onChange={(id) => onChange({ withdrawal_strategy: id })}
        />

        {showsMonteCarloControls && (
          <div className="md:col-span-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h4 className="font-semibold text-blue-900">Monte Carlo Model Feedback</h4>
                <p className="mt-1 text-sm text-blue-900">
                  Effective portfolio composition: {equitySharePct}% Stocks / {fixedIncomeSharePct}% Non-Equity.
                </p>
                <p className="mt-1 text-xs text-blue-800">
                  Geographic equity mix: Canada {estimatedMarketAssumptions.cadEquityWeight.toFixed(1)}%, US {estimatedMarketAssumptions.usEquityWeight.toFixed(1)}%, International {estimatedMarketAssumptions.intEquityWeight.toFixed(1)}%.
                </p>
                <p className="mt-2 text-sm text-blue-900">
                  Monte Carlo Model: Your plan is simulated using a {equitySharePct}% Equity and {fixedIncomeSharePct}% Non-Equity split. Geographic weights are applied to the equity portion, while the non-equity portion (Bonds/Cash) is modeled with a lower 5% standard deviation to provide portfolio stability. Net returns shown here are net of {effectiveManagementFee.toFixed(1)}% management fees.
                </p>
                <p className="mt-2 text-xs text-blue-800">
                  Right now, that works out to {effectiveCadPortfolioPct.toFixed(1)}% Canada, {effectiveUsPortfolioPct.toFixed(1)}% US, {effectiveIntlPortfolioPct.toFixed(1)}% International, and {effectiveNonEquityPortfolioPct.toFixed(1)}% non-equity.
                </p>
                <p className="mt-2 text-xs italic text-blue-800">
                  {usingAssetAllocations
                    ? 'These values are being driven by the Assets tab. The geographic sliders below act only as a fallback when account-level allocations have not been customized.'
                    : 'Without account-level allocations, the model assumes a 60/40 stock-to-non-equity mix and applies the geographic sliders only within that 60% equity sleeve.'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-blue-900 select-none">
                  <input
                    type="checkbox"
                    checked={marketAssumptionsAuto}
                    onChange={e => {
                      const enabled = e.target.checked;
                      onSetMarketAssumptionsAuto(enabled);
                      if (enabled) {
                        onChange({
                          expected_return: estimatedMarketAssumptions.expectedReturn,
                          return_std_dev: estimatedMarketAssumptions.stdDev,
                        });
                      }
                    }}
                    className="h-4 w-4 rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                  />
                  Auto-estimate from allocation
                </label>
              </div>
            </div>
          </div>
        )}

        {showsHistoricalControls && (
          <div className="md:col-span-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-4">
            <h4 className="font-semibold text-amber-900">Historical Backtesting</h4>
            <p className="mt-1 text-sm text-amber-900">
              The app runs your full retirement plan across rolling historical windows and reports the historical survival rate plus the failure vintages.
            </p>
            <p className="mt-2 text-xs text-amber-800">
              Portfolio geography is still respected. Equity sleeves use the configured Canada, US, and International mix, while the non-equity sleeve uses a low-volatility reference return proxy.
            </p>
          </div>
        )}

        {showsGoalSeekingControls && (
          <div className="md:col-span-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-4">
            <h4 className="font-semibold text-emerald-900">Goal-Seeking Solver</h4>
            <p className="mt-1 text-sm text-emerald-900">
              Uses a binary search between $20,000 and $500,000 to solve for the highest sustainable annual spending level under the current tax and withdrawal rules.
            </p>
            <p className="mt-2 text-xs text-emerald-800">
              The solver evaluates the full projection repeatedly, so OAS clawbacks and progressive tax brackets remain part of the optimization instead of being approximated away.
            </p>
          </div>
        )}

        {showsGuardrailsControls && (
          <div className="md:col-span-2 rounded-lg border border-purple-200 bg-purple-50 px-4 py-4">
            <h4 className="font-semibold text-purple-900">Dynamic Guardrails</h4>
            <p className="mt-1 text-sm text-purple-900">
              Each year the engine checks the capital utilization ratio and either trims discretionary spending or increases living expenses when the plan is materially overfunded.
            </p>
            <p className="mt-2 text-xs text-purple-800">
              Preservation Rule: travel and other expenses are cut by 50% below the 20% threshold. Prosperity Rule: living expenses get a 10% bonus above the 140% threshold.
            </p>
          </div>
        )}

        {showsAdaptiveControls && (
          <div className="md:col-span-2 rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-4">
            <h4 className="font-semibold text-cyan-900">Adaptive Withdrawal Logic</h4>
            <p className="mt-1 text-sm text-cyan-900">
              Withdrawals respond to prior-year performance. Negative return years freeze inflation increases, and the 10% rule cuts withdrawals when the withdrawal rate drifts too far above the opening retirement rate.
            </p>
            <p className="mt-2 text-xs text-cyan-800">
              Results include a standard-of-living stability score so you can judge how much real purchasing power varied across retirement.
            </p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Target RRSP Exhaustion (Years Before Plan End)
          </label>
          <input
            type="number"
            min={1}
            max={25}
            step={1}
            value={scenario.rrsp_exhaustion_years_before_end ?? 2}
            onChange={e => onChange({ rrsp_exhaustion_years_before_end: Math.max(1, Math.min(25, parseInt(e.target.value, 10) || 2)) })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p className="text-xs text-gray-500 mt-1">
            Example: `2` means the engine targets RRSP depletion by two years before the plan end age. In the projection engine, this becomes an inflation-adjusted annual RRSP withdrawal floor that is used to keep the plan on track to exhaust RRSP assets by the target age.
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Current implementation: this exhaustion-floor rule is applied for Maximize Life Spending, Tax Efficient, and Maximize Estate Value. Net Expenses Only, RRSP Meltdown, and Minimize Lifetime Tax use different withdrawal logic.
          </p>
        </div>
      </div>

      <div className="border border-gray-200 rounded-lg p-4 space-y-4">
        <div>
          <h4 className="font-semibold text-gray-900 mb-1">Geographic Equity Mix</h4>
          <p className="text-sm text-gray-500">Fallback stock-sleeve geography used for Monte Carlo when you have not customized allocations in the Assets tab. Canada, US, and International always sum to 100%.</p>
          <p className="text-xs italic text-gray-500 mt-1">
            These sliders split only the equity sleeve. The engine then scales that mix by your effective total stock allocation.
          </p>
        </div>
        <div className="space-y-5">
          {(() => {
            const cadWeight = scenario.cad_equity_weight ?? 60;
            const usWeight = scenario.us_equity_weight ?? 40;
            const intlWeight = scenario.int_equity_weight ?? Math.max(0, 100 - cadWeight - usWeight);
            const currentWeights = { cad: cadWeight, us: usWeight, intl: intlWeight };
            return (
              <>
                {([
                  { key: 'cad', label: 'Canada (TSX)', badgeClass: 'text-red-700 bg-red-50', sliderClass: 'accent-red-600', value: cadWeight },
                  { key: 'us', label: 'US (S&P 500)', badgeClass: 'text-blue-700 bg-blue-50', sliderClass: 'accent-blue-600', value: usWeight },
                  { key: 'intl', label: 'International (MSCI EAFE)', badgeClass: 'text-violet-700 bg-violet-50', sliderClass: 'accent-violet-600', value: intlWeight },
                ] as const).map(item => (
                  <div key={item.key}>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-sm font-medium text-gray-700">{item.label}</label>
                      <span className={`text-sm font-bold px-2 py-0.5 rounded ${item.badgeClass}`}>{Math.round(item.value)}%</span>
                    </div>
                    <input
                      type="range" min={0} max={100} value={Math.round(item.value)}
                      onChange={e => rebalanceGeoWeights(currentWeights, item.key, parseInt(e.target.value) || 0)}
                      className={`w-full ${item.sliderClass}`}
                    />
                  </div>
                ))}
                <div className="flex gap-2 h-2 rounded-full overflow-hidden">
                  <div className="bg-red-500 transition-all duration-200" style={{ width: `${cadWeight}%` }} />
                  <div className="bg-blue-500 transition-all duration-200" style={{ width: `${usWeight}%` }} />
                  <div className="bg-violet-500 transition-all duration-200" style={{ width: `${intlWeight}%` }} />
                </div>
                <p className="text-xs text-gray-500">The Assets tab overrides this fallback on a per-account basis.</p>
              </>
            );
          })()}
        </div>
      </div>

      {usesDeterministicInputs && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h4 className="font-semibold text-gray-900">Market Behaviour Steps</h4>
              <p className="text-sm text-gray-600">Define year-by-year return steps. When periods exist, they override the default annual return and management cost is deducted from each period before calculation.</p>
            </div>
            <button type="button" onClick={addPeriod}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
              <Plus className="w-4 h-4" /> Add Period
            </button>
          </div>

          {returnPeriods.length === 0 && (
            <div className="text-center py-8 text-gray-500 border-2 border-dashed border-gray-200 rounded-lg">
              No custom periods. The default return rate applies to all years.
            </div>
          )}

          <div className="space-y-3">
            {returnPeriods.map((period, index) => {
              const fromAge = ageForYear(period.from_year);
              const toAge = ageForYear(period.to_year);
              return (
                <div key={index} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      From Year <span className="text-xs text-gray-500">(Age {fromAge})</span>
                    </label>
                    <input type="number" value={period.from_year} min={currentYear}
                      onChange={e => updatePeriod(index, { from_year: parseInt(e.target.value) || currentYear })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      To Year <span className="text-xs text-gray-500">(Age {toAge})</span>
                    </label>
                    <input type="number" value={period.to_year} min={period.from_year}
                      onChange={e => updatePeriod(index, { to_year: parseInt(e.target.value) || period.from_year })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Annual Return (%)</label>
                    <input type="number" step="0.5" value={period.return_rate} min={-50} max={50}
                      onChange={e => updatePeriod(index, { return_rate: parseFloat(e.target.value) || 0 })}
                      className={`w-full px-3 py-2 border rounded-lg ${period.return_rate < 0 ? 'border-red-300 bg-red-50' : 'border-gray-300'}`} />
                  </div>
                  <button type="button" onClick={() => removePeriod(index)}
                    className="flex items-center justify-center gap-1 px-3 py-2 text-red-600 border border-red-300 rounded-lg hover:bg-red-50">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>

          {returnPeriods.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h5 className="font-medium text-blue-900 mb-2">Return Schedule Summary</h5>
              <p className="text-sm text-blue-800 mb-3">
                Period values below are gross returns. The simulation subtracts the portfolio management cost and uses the resulting net schedule for each year.
              </p>
              <div className="flex flex-wrap gap-2">
                {returnPeriods.map((p, i) => (
                  <span key={i} className={`px-3 py-1 rounded-full text-sm font-medium ${p.return_rate < 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                    {p.from_year}-{p.to_year}: gross {p.return_rate > 0 ? '+' : ''}{p.return_rate}% / net {(p.return_rate - effectiveManagementFee) > 0 ? '+' : ''}{(p.return_rate - effectiveManagementFee).toFixed(1)}%
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {showsMonteCarloControls && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h4 className="font-semibold text-yellow-900 mb-1">About Monte Carlo Simulation</h4>
          <p className="text-sm text-yellow-800">
            Runs thousands of random return scenarios. Results show 10th, 50th, and 90th percentile outcomes
            so you can see best-case, worst-case, and median projections.
          </p>
        </div>
      )}
    </div>
    {showMonteCarloInfo && <MonteCarloInfoModal onClose={() => setShowMonteCarloInfo(false)} />}
    </>
  );
}
