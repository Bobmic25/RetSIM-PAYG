import { useState } from 'react';
import { Plus, Trash2, HelpCircle, X } from 'lucide-react';
import { Scenario } from '../types/retirement';
import { MONTE_CARLO_MAX_ITERATIONS, MONTE_CARLO_DEFAULT_ITERATIONS } from '../lib/monteCarloEngine';

interface ReturnPeriod {
  from_year: number;
  to_year: number;
  return_rate: number;
}

interface ReturnsFormProps {
  scenario: Scenario;
  onChange: (updates: Partial<Scenario>) => void;
  returnPeriods: ReturnPeriod[];
  onReturnPeriodsChange: (periods: ReturnPeriod[]) => void;
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
            <h3 className="font-semibold text-gray-900">Canadian & US Markets Move Together</h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              The two equity markets are not simulated independently. A <strong>Cholesky decomposition</strong> is used to correlate Canadian and US returns with a coefficient of roughly <strong>0.75</strong> — close to their long-run historical relationship. In bad years, both markets tend to fall together; in good years, both tend to rise. Your geographic allocation slider adjusts the blend of these two correlated streams.
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

export default function ReturnsForm({ scenario, onChange, returnPeriods, onReturnPeriodsChange }: ReturnsFormProps) {
  const currentYear = new Date().getFullYear();
  const [showMonteCarloInfo, setShowMonteCarloInfo] = useState(false);

  const addPeriod = () => {
    const last = returnPeriods[returnPeriods.length - 1];
    const newFrom = last ? last.to_year + 1 : currentYear;
    const newTo = newFrom + 4;
    onReturnPeriodsChange([...returnPeriods, { from_year: newFrom, to_year: newTo, return_rate: scenario.expected_return }]);
  };

  const updatePeriod = (index: number, updates: Partial<ReturnPeriod>) => {
    const updated = [...returnPeriods];
    updated[index] = { ...updated[index], ...updates };
    onReturnPeriodsChange(updated);
  };

  const removePeriod = (index: number) => {
    onReturnPeriodsChange(returnPeriods.filter((_, i) => i !== index));
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
        <div className="flex gap-4">
          {(['linear', 'monte_carlo'] as const).map(type => (
            <button key={type} type="button" onClick={() => onChange({ return_type: type })}
              className={`flex-1 py-3 px-4 rounded-lg border-2 font-medium transition-colors ${
                scenario.return_type === type ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
              }`}>
              {type === 'linear' ? (
                <span className="flex items-center justify-center gap-1.5">Linear (Fixed / Step)<span className="text-[10px] font-normal bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full">Default</span></span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  Monte Carlo (Volatile)
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
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {scenario.return_type === 'linear' ? 'Default Annual Return (%)' : 'Expected Annual Return (%)'}
          </label>
          <input type="number" step="0.5" value={scenario.expected_return} min={-10} max={30}
            onChange={e => onChange({ expected_return: parseFloat(e.target.value) || 0 })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
          <p className="text-xs text-gray-500 mt-1">Historical long-term average: 6–8%</p>
        </div>

        {scenario.return_type === 'monte_carlo' && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Standard Deviation (%)</label>
              <input type="number" step="0.5" value={scenario.return_std_dev || 10} min={0} max={30}
                onChange={e => onChange({ return_std_dev: parseFloat(e.target.value) || 0 })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
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

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Withdrawal Strategy</label>
          <select value={scenario.withdrawal_strategy} onChange={e => onChange({ withdrawal_strategy: e.target.value as any })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
            <option value="maximize_spending">Maximize Life Spending</option>
            <option value="maximize_estate">Maximize Estate Value</option>
            <option value="tax_efficient">Tax Efficient</option>
            <option value="net_expenses_only">Satisfy Net Expenses Only</option>
            <option value="rrsp_meltdown">RRSP Meltdown (Early Withdrawal)</option>
          </select>
          {scenario.withdrawal_strategy === 'net_expenses_only' && (
            <p className="text-xs text-gray-500 mt-1">Only withdraws the minimum needed to meet net expenses. Skips bracket-filling and RRSP exhaustion.</p>
          )}
          {scenario.withdrawal_strategy === 'rrsp_meltdown' && (
            <p className="text-xs text-gray-500 mt-1">Prioritizes smoother early RRSP withdrawal and targets full RRSP exhaustion before the end of plan. Uses Non-Registered as secondary and TFSA as last resort.</p>
          )}

          <div className="mt-3">
            <label className="block text-xs font-medium text-gray-700 mb-1">
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
              Example: `2` means RRSP is targeted to be fully exhausted by two years before the plan end age.
            </p>
            {scenario.withdrawal_strategy === 'net_expenses_only' && (
              <p className="text-xs text-amber-700 mt-1">
                Note: Net Expenses Only minimizes withdrawals and can override this target.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="border border-gray-200 rounded-lg p-4 space-y-4">
        <div>
          <h4 className="font-semibold text-gray-900 mb-1">Geographic Equity Allocation</h4>
          <p className="text-sm text-gray-500">Adjust the split of equity exposure between Canadian and US markets. The two weights always sum to 100%.</p>
        </div>
        <div className="space-y-5">
          {(() => {
            const cadWeight = scenario.cad_equity_weight ?? 50;
            const usWeight = scenario.us_equity_weight ?? 50;
            return (
              <>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-sm font-medium text-gray-700">Canadian Market Weight</label>
                    <span className="text-sm font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded">{cadWeight}%</span>
                  </div>
                  <input
                    type="range" min={0} max={100} value={cadWeight}
                    onChange={e => {
                      const v = parseInt(e.target.value);
                      onChange({ cad_equity_weight: v, us_equity_weight: 100 - v });
                    }}
                    className="w-full accent-red-600"
                  />
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-sm font-medium text-gray-700">US Market Weight</label>
                    <span className="text-sm font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">{usWeight}%</span>
                  </div>
                  <input
                    type="range" min={0} max={100} value={usWeight}
                    onChange={e => {
                      const v = parseInt(e.target.value);
                      onChange({ us_equity_weight: v, cad_equity_weight: 100 - v });
                    }}
                    className="w-full accent-blue-600"
                  />
                </div>
                <div className="flex gap-2 h-2 rounded-full overflow-hidden">
                  <div className="bg-red-500 transition-all duration-200" style={{ width: `${cadWeight}%` }} />
                  <div className="bg-blue-500 transition-all duration-200" style={{ width: `${usWeight}%` }} />
                </div>
              </>
            );
          })()}
        </div>
      </div>

      {scenario.return_type === 'linear' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h4 className="font-semibold text-gray-900">Market Behaviour Steps</h4>
              <p className="text-sm text-gray-600">Override returns for specific year ranges. Years without a step use the default return above.</p>
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
              <div className="flex flex-wrap gap-2">
                {returnPeriods.map((p, i) => (
                  <span key={i} className={`px-3 py-1 rounded-full text-sm font-medium ${p.return_rate < 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                    {p.from_year}–{p.to_year}: {p.return_rate > 0 ? '+' : ''}{p.return_rate}%
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {scenario.return_type === 'monte_carlo' && (
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
