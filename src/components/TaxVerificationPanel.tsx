import { useState } from 'react';
import {
  Scenario,
  IncomeSource,
  SavingsAccount,
  ExpenseLadder,
  OneTimeEvent,
  YearlyProjection
} from '../types/retirement';
import { computeTaxAudit } from '../lib/taxEngine';
import { runCppOasOptimization, CppOasOptimizationRow } from '../lib/projectionEngine';
import { formatCurrency } from '../lib/formatters';
import { RefreshCw, TrendingDown, Calculator, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { type LiveTaxData, triggerTaxDataRefresh, fetchLiveTaxData } from '../lib/taxDataService';

interface TaxVerificationPanelProps {
  projections: YearlyProjection[];
  scenario: Scenario;
  incomeSources: IncomeSource[];
  savingsAccounts: SavingsAccount[];
  expenseLadder: ExpenseLadder[];
  oneTimeEvents: OneTimeEvent[];
  liveTaxData?: LiveTaxData | null;
  taxDataStatus?: 'loading' | 'live' | 'fallback';
  onTaxDataRefreshed?: (data: LiveTaxData) => void;
}

const CPP_OAS_HIGHLIGHT_COMBOS = [
  { cpp: 60, oas: 65 },
  { cpp: 65, oas: 65 },
  { cpp: 70, oas: 70 }
];

export default function TaxVerificationPanel({
  projections,
  scenario,
  incomeSources,
  savingsAccounts,
  expenseLadder,
  oneTimeEvents,
  liveTaxData,
  taxDataStatus,
  onTaxDataRefreshed
}: TaxVerificationPanelProps) {
  const ages = projections.map(p => p.age);
  const [selectedAge, setSelectedAge] = useState(ages[Math.floor(ages.length / 2)] ?? ages[0]);
  const [optimizationRows, setOptimizationRows] = useState<CppOasOptimizationRow[] | null>(null);
  const [loadingOpt, setLoadingOpt] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const selectedYear = projections.find(p => p.age === selectedAge);
  const yearIndex = selectedYear ? selectedYear.year - 1 : 0;

  const audit = selectedYear
    ? computeTaxAudit(
        selectedYear.primary_salary + selectedYear.cpp + selectedYear.oas + selectedYear.rrsp_withdrawal + selectedYear.non_reg_capital_gain_inclusion,
        scenario.province,
        selectedYear.primary_salary,
        selectedYear.oas,
        yearIndex,
        scenario.inflation_rate
      )
    : null;

  const handleRefreshTaxData = async () => {
    setRefreshing(true);
    setRefreshError(null);
    const result = await triggerTaxDataRefresh();
    setRefreshing(false);
    if (result.success && result.fetchedAt) {
      const fresh = await fetchLiveTaxData();
      if (fresh && onTaxDataRefreshed) onTaxDataRefreshed(fresh);
    } else {
      setRefreshError(result.error ?? 'Refresh failed');
    }
  };

  const handleRunOptimization = () => {
    setLoadingOpt(true);
    setTimeout(() => {
      const rows = runCppOasOptimization(scenario, incomeSources, savingsAccounts, expenseLadder, oneTimeEvents);
      setOptimizationRows(rows);
      setLoadingOpt(false);
    }, 0);
  };

  const highlightRows = optimizationRows
    ? optimizationRows.filter(r => CPP_OAS_HIGHLIGHT_COMBOS.some(c => c.cpp === r.cpp_start_age && c.oas === r.oas_start_age))
    : [];

  const bestNetWorth = highlightRows.length > 0 ? Math.max(...highlightRows.map(r => r.final_net_worth)) : 0;
  const lowestTax = highlightRows.length > 0 ? Math.min(...highlightRows.map(r => r.total_taxes_paid)) : Infinity;

  return (
    <div className="space-y-6">

      <div className={`flex items-center justify-between px-4 py-3 rounded-xl border text-sm ${
        taxDataStatus === 'live'
          ? 'bg-green-50 border-green-200'
          : taxDataStatus === 'fallback'
          ? 'bg-amber-50 border-amber-200'
          : 'bg-gray-50 border-gray-200'
      }`}>
        <div className="flex items-center gap-2">
          {taxDataStatus === 'loading' && <Loader2 className="w-4 h-4 text-gray-500 animate-spin" />}
          {taxDataStatus === 'live' && <CheckCircle className="w-4 h-4 text-green-600" />}
          {taxDataStatus === 'fallback' && <AlertCircle className="w-4 h-4 text-amber-600" />}
          <span className={`font-medium ${
            taxDataStatus === 'live' ? 'text-green-800' : taxDataStatus === 'fallback' ? 'text-amber-800' : 'text-gray-600'
          }`}>
            {taxDataStatus === 'loading' && 'Loading tax data…'}
            {taxDataStatus === 'live' && liveTaxData && (
              <>Tax data verified from database &mdash; last updated {new Date(liveTaxData.fetchedAt).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })}</>
            )}
            {taxDataStatus === 'fallback' && 'Using built-in 2026 tax constants (database unavailable)'}
          </span>
        </div>
        <button
          onClick={handleRefreshTaxData}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors shadow-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Refreshing…' : 'Refresh Tax Data'}
        </button>
      </div>

      {refreshError && (
        <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
          Refresh failed: {refreshError}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 bg-gray-50 border-b border-gray-200">
          <Calculator className="w-5 h-5 text-blue-600" />
          <div>
            <h3 className="font-semibold text-gray-900">Tax Audit — Year-by-Year Breakdown</h3>
            <p className="text-xs text-gray-500">Select any age to see the exact tax calculation for that year</p>
          </div>
        </div>

        <div className="p-5">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Select Age to Audit</label>
            <select
              value={selectedAge}
              onChange={e => setSelectedAge(Number(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {ages.map(a => <option key={a} value={a}>Age {a}</option>)}
            </select>
          </div>

          {audit && selectedYear ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Gross Income', value: formatCurrency(audit.grossIncome), color: 'text-gray-900' },
                  { label: 'Total Tax', value: formatCurrency(audit.totalTax), color: 'text-red-700' },
                  { label: 'Effective Rate', value: `${(audit.effectiveRate * 100).toFixed(1)}%`, color: 'text-orange-700' },
                  { label: 'After-Tax', value: formatCurrency(audit.grossIncome - audit.totalTax + selectedYear.tfsa_withdrawal), color: 'text-green-700' }
                ].map(card => (
                  <div key={card.label} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                    <p className="text-xs text-gray-500">{card.label}</p>
                    <p className={`text-base font-bold mt-0.5 ${card.color}`}>{card.value}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Income Sources</p>
                  <div className="space-y-1.5">
                    {[
                      { label: 'Employment / Pension Income', value: selectedYear.primary_salary, taxable: true },
                      { label: 'CPP Benefits', value: selectedYear.cpp, taxable: true },
                      { label: 'OAS Benefits', value: selectedYear.oas, taxable: true },
                      { label: 'RRSP / RRIF Withdrawals', value: selectedYear.rrsp_withdrawal, taxable: true },
                      { label: `Non-Reg. Withdrawal (${formatCurrency(selectedYear.non_reg_withdrawal)} total)`, value: selectedYear.non_reg_capital_gain_inclusion, taxable: 'partial' as const },
                      { label: 'TFSA Withdrawals', value: selectedYear.tfsa_withdrawal, taxable: false },
                    ].filter(r => r.value > 0).map((row, i) => (
                      <div key={i} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-gray-50">
                        <span className="text-xs text-gray-700">{row.label}</span>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                            row.taxable === true ? 'bg-red-100 text-red-700' :
                            row.taxable === 'partial' ? 'bg-amber-100 text-amber-700' :
                            'bg-green-100 text-green-700'
                          }`}>
                            {row.taxable === true ? 'Taxable' : row.taxable === 'partial' ? 'Taxable Gain' : 'Tax-Free'}
                          </span>
                          <span className="text-xs font-semibold text-gray-900">{formatCurrency(row.value)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Tax Calculation</p>
                  <div className="space-y-1">
                    {[
                      { label: 'Gross Federal Tax', value: audit.federalGrossTax, indent: false },
                      { label: `BPA Credit (${formatCurrency(audit.federalBPA)} × ${(audit.appliedData.federalBrackets[0]?.rate * 100 || 14).toFixed(0)}%)`, value: -audit.federalBPACredit, indent: true },
                      { label: 'Net Federal Tax', value: audit.federalNetTax, bold: true },
                      { label: 'Gross Provincial Tax', value: audit.provincialGrossTax, indent: false },
                      { label: `Prov. BPA Credit`, value: -audit.provincialBPACredit, indent: true },
                      { label: 'Net Provincial Tax', value: audit.provincialNetTax, bold: true },
                      { label: 'CPP Contributions', value: audit.cppContribution },
                      { label: 'EI Premiums', value: audit.eiContribution },
                      { label: 'OAS Clawback', value: audit.oasClawback },
                    ].map((row, i) => (
                      <div key={i} className={`flex justify-between py-1 ${row.bold ? 'font-semibold' : ''}`}>
                        <span className={`text-xs ${row.indent ? 'pl-4 text-gray-500' : row.bold ? 'text-gray-800' : 'text-gray-600'}`}>
                          {row.label}
                        </span>
                        <span className={`text-xs ${(row.value ?? 0) < 0 ? 'text-green-700' : row.bold ? 'text-gray-900' : 'text-gray-700'}`}>
                          {(row.value ?? 0) < 0 ? `−${formatCurrency(-(row.value ?? 0))}` : formatCurrency(row.value ?? 0)}
                        </span>
                      </div>
                    ))}
                    <div className="flex justify-between pt-2 border-t border-gray-200 font-bold">
                      <span className="text-xs text-red-800">Total Tax</span>
                      <span className="text-xs text-red-800">{formatCurrency(audit.totalTax)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400">No data for selected age.</p>
          )}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <TrendingDown className="w-5 h-5 text-teal-600" />
            <div>
              <h3 className="font-semibold text-gray-900">CPP / OAS Start Age Optimization</h3>
              <p className="text-xs text-gray-500">Compare three key strategies: early (60/65), standard (65/65), delayed (70/70)</p>
            </div>
          </div>
          <button
            onClick={handleRunOptimization}
            disabled={loadingOpt}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-60 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loadingOpt ? 'animate-spin' : ''}`} />
            {loadingOpt ? 'Running…' : optimizationRows ? 'Re-run' : 'Run Analysis'}
          </button>
        </div>

        <div className="p-5">
          {!optimizationRows ? (
            <div className="text-center py-8 text-gray-400">
              <TrendingDown className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Click "Run Analysis" to compare CPP/OAS start-age strategies</p>
              <p className="text-xs mt-1">Runs your full projection 3 ways to find the optimal claiming strategy</p>
            </div>
          ) : (
            <div>
              <p className="text-xs text-gray-500 mb-3">Showing three key start-age combinations. Green highlights the best outcome per metric.</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="text-left px-4 py-3 rounded-tl-lg text-gray-600 font-semibold">CPP Start</th>
                      <th className="text-left px-4 py-3 text-gray-600 font-semibold">OAS Start</th>
                      <th className="text-right px-4 py-3 text-gray-600 font-semibold">Final Net Worth</th>
                      <th className="text-right px-4 py-3 text-gray-600 font-semibold">Lifetime Tax</th>
                      <th className="text-right px-4 py-3 rounded-tr-lg text-gray-600 font-semibold">Total Withdrawals</th>
                    </tr>
                  </thead>
                  <tbody>
                    {highlightRows.map((row, i) => {
                      const isBestNW = row.final_net_worth === bestNetWorth;
                      const isBestTax = row.total_taxes_paid === lowestTax;
                      return (
                        <tr key={i} className={`border-t border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                          <td className="px-4 py-3 font-semibold text-gray-900">Age {row.cpp_start_age}</td>
                          <td className="px-4 py-3 text-gray-700">Age {row.oas_start_age}</td>
                          <td className={`px-4 py-3 text-right font-bold ${isBestNW ? 'text-green-700' : row.final_net_worth < 0 ? 'text-red-700' : 'text-gray-900'}`}>
                            {formatCurrency(row.final_net_worth)}
                            {isBestNW && <span className="ml-1.5 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">Best</span>}
                          </td>
                          <td className={`px-4 py-3 text-right font-medium ${isBestTax ? 'text-green-700' : 'text-gray-800'}`}>
                            {formatCurrency(row.total_taxes_paid)}
                            {isBestTax && <span className="ml-1.5 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">Lowest</span>}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(row.total_withdrawals)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-400 mt-3">
                Results based on your current scenario inputs. Consult a financial advisor before making CPP/OAS election decisions.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
