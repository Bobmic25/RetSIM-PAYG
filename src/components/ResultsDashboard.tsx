import { useState, useEffect } from 'react';
import { TrendingUp, DollarSign, Calendar, Target, Download, Copy, ReceiptText, HelpCircle, ShieldCheck, PieChart as PieChartIcon } from 'lucide-react';
import PDFExport from './PDFExport';
import NetWorthChart from './NetWorthChart';
import CashFlowChart from './CashFlowChart';
import TaxChart from './TaxChart';
import ProjectionTable from './ProjectionTable';
import TaxInfoModal from './TaxInfoModal';
import TaxVerificationPanel from './TaxVerificationPanel';
import PortfolioBreakdownModal, { PortfolioSlice } from './PortfolioBreakdownModal';
import AISuggestionsPanel from './AISuggestionsPanel';
import { YearlyProjection, MonteCarloResult, Scenario, IncomeSource, SavingsAccount, ExpenseLadder, OneTimeEvent } from '../types/retirement';
import { formatCurrency } from '../lib/formatters';
import { presentValue } from '../lib/benefitsEngine';
import { computeTaxAudit, calcTieredCapitalGainInclusion, OAS_CLAWBACK_THRESHOLD_2026, OAS_CLAWBACK_RATE, FEDERAL_BRACKETS_2026 } from '../lib/taxEngine';
import { GIS_MAX_SINGLE_ANNUAL_2026, GIS_CLAWBACK_RATE } from '../lib/benefitsEngine';
import { type LiveTaxData } from '../lib/taxDataService';
import { generateSuggestions, calculateComparisonMetrics, type Suggestion } from '../lib/suggestionEngine';

interface SavedResult {
  name: string;
  projections: YearlyProjection[];
  color: string;
}

interface ResultsDashboardProps {
  projections: YearlyProjection[];
  monteCarloResult?: MonteCarloResult;
  optimizedProjections?: YearlyProjection[] | null;
  optimizedMonteCarloResult?: MonteCarloResult;
  activeSuggestion?: Suggestion | null;
  onApplySuggestion?: (suggestion: Suggestion) => void;
  onResetOptimization?: () => void;
  inflationRate: number;
  scenarioName: string;
  scenario: Scenario;
  incomeSources: IncomeSource[];
  savingsAccounts: SavingsAccount[];
  expenseLadder: ExpenseLadder[];
  oneTimeEvents: OneTimeEvent[];
  onSaveComparison: () => void;
  savedResults: SavedResult[];
  liveTaxData?: LiveTaxData | null;
  taxDataStatus?: 'loading' | 'live' | 'fallback';
  onTaxDataRefreshed?: (data: LiveTaxData) => void;
  showAISuggestions?: boolean;
}

function StatCard({ icon: Icon, label, value, sub, color, onInfoClick, onPieClick }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  color: string;
  onInfoClick?: () => void;
  onPieClick?: () => void;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium text-gray-600">{label}</p>
          {onInfoClick && (
            <button
              onClick={onInfoClick}
              className="text-gray-400 hover:text-blue-600 transition-colors"
              title="View tax details"
            >
              <HelpCircle className="w-3.5 h-3.5" />
            </button>
          )}
          {onPieClick && (
            <button
              onClick={onPieClick}
              className="text-gray-400 hover:text-blue-600 transition-colors"
              title="View portfolio breakdown"
            >
              <PieChartIcon className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}

export default function ResultsDashboard({
  projections,
  monteCarloResult,
  optimizedProjections,
  optimizedMonteCarloResult,
  activeSuggestion,
  onApplySuggestion,
  onResetOptimization,
  inflationRate,
  scenarioName,
  scenario,
  incomeSources,
  savingsAccounts,
  expenseLadder,
  oneTimeEvents,
  onSaveComparison,
  savedResults,
  liveTaxData,
  taxDataStatus,
  onTaxDataRefreshed,
  showAISuggestions = false
}: ResultsDashboardProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'cashflow' | 'tax' | 'table' | 'verify'>('overview');
  const [showTodayDollars, setShowTodayDollars] = useState(true);
  const [showTaxModal, setShowTaxModal] = useState(false);
  const [retirementView, setRetirementView] = useState(false);
  const [showCurrentPie, setShowCurrentPie] = useState(false);
  const [showFinalPie, setShowFinalPie] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  // Generate suggestions when projections change
  useEffect(() => {
    if (projections.length > 0) {
      const generatedSuggestions = generateSuggestions(projections, scenario, monteCarloResult);
      setSuggestions(generatedSuggestions);
    }
  }, [projections, scenario, monteCarloResult]);

  if (!projections.length) {
    return (
      <div className="text-center py-16 text-gray-500">
        <p className="text-lg font-medium">No results yet.</p>
        <p className="text-sm mt-1">Complete the wizard and run the simulation to see projections.</p>
      </div>
    );
  }

  const lastSalaryAge = projections.reduce((maxAge, p) => p.salary > 0 ? Math.max(maxAge, p.age) : maxAge, -1);
  const retirementStartAge = lastSalaryAge >= 0 ? lastSalaryAge + 1 : scenario.retirement_age;

  const viewProjections = retirementView
    ? projections.filter(p => p.age >= retirementStartAge)
    : projections;

  const lastYear = projections[projections.length - 1];
  const firstRetirementYear = projections.find(p => p.total_withdrawals > 0 || p.cpp > 0);
  const totalTax = projections.reduce((s, p) => s + p.total_tax, 0);
  const runOutAge = projections.find(p => p.total_balance <= 0)?.age;

  const pv = (amount: number, yearIndex: number) =>
    showTodayDollars ? presentValue(amount, yearIndex, inflationRate) : amount;

  const lastNetWorth = pv(lastYear.total_balance, lastYear.year - 1);
  const totalTaxPv = showTodayDollars
    ? projections.reduce((s, p) => s + pv(p.total_tax, p.year - 1), 0)
    : totalTax;

  const representativeYear = projections.find(p => p.total_withdrawals > 0 || p.cpp > 0) ?? projections[Math.floor(projections.length / 2)];
  const repNonRegGain = representativeYear.non_reg_withdrawal > 0
    ? calcTieredCapitalGainInclusion(representativeYear.non_reg_withdrawal, representativeYear.year - 1, scenario.inflation_rate)
    : 0;
  const representativeAudit = computeTaxAudit(
    representativeYear.salary + representativeYear.cpp + representativeYear.oas + representativeYear.rrsp_withdrawal + repNonRegGain,
    scenario.province,
    representativeYear.salary,
    representativeYear.oas,
    representativeYear.year - 1,
    scenario.inflation_rate
  );

  const ACCOUNT_COLORS: Record<string, string> = {
    rrsp: '#2563eb',
    rrsp_spouse: '#60a5fa',
    tfsa: '#16a34a',
    fhsa: '#0891b2',
    non_reg: '#d97706',
  };

  const currentSlices: PortfolioSlice[] = [
    {
      label: 'RRSP',
      value: savingsAccounts.filter(a => a.account_type === 'rrsp' && a.person === 'primary').reduce((s, a) => s + a.current_balance, 0),
      color: ACCOUNT_COLORS.rrsp,
    },
    {
      label: 'RRSP (Spouse)',
      value: savingsAccounts.filter(a => a.account_type === 'rrsp' && a.person === 'spouse').reduce((s, a) => s + a.current_balance, 0),
      color: ACCOUNT_COLORS.rrsp_spouse,
    },
    {
      label: 'TFSA',
      value: savingsAccounts.filter(a => a.account_type === 'tfsa').reduce((s, a) => s + a.current_balance, 0),
      color: ACCOUNT_COLORS.tfsa,
    },
    {
      label: 'FHSA',
      value: savingsAccounts.filter(a => a.account_type === 'fhsa').reduce((s, a) => s + a.current_balance, 0),
      color: ACCOUNT_COLORS.fhsa,
    },
    {
      label: 'Non-Registered',
      value: savingsAccounts.filter(a => a.account_type === 'non_reg').reduce((s, a) => s + a.current_balance, 0),
      color: ACCOUNT_COLORS.non_reg,
    },
  ].filter(s => s.value > 0);

  const currentNetWorth = currentSlices.reduce((s, sl) => s + sl.value, 0);

  const finalSlices: PortfolioSlice[] = [
    { label: 'RRSP', value: pv(lastYear.rrsp_balance, lastYear.year - 1), color: ACCOUNT_COLORS.rrsp },
    { label: 'TFSA', value: pv(lastYear.tfsa_balance, lastYear.year - 1), color: ACCOUNT_COLORS.tfsa },
    { label: 'FHSA', value: pv(lastYear.fhsa_balance, lastYear.year - 1), color: ACCOUNT_COLORS.fhsa },
    { label: 'Non-Registered', value: pv(lastYear.non_reg_balance, lastYear.year - 1), color: ACCOUNT_COLORS.non_reg },
  ].filter(s => s.value > 0);

  const exportCSV = () => {
    const headers = ['Age', 'Salary', 'CPP', 'OAS', 'Inheritance', 'RRSP W/D', 'TFSA W/D', 'Non-Reg W/D',
      'Taxable Income', 'Federal Tax', 'Prov Tax', 'CPP/EI/OAS', 'Total Tax', 'After-Tax', 'Expenses', 'Net Flow', 'Total Net Worth'];
    const rows = projections.map(p => {
      const taxable = p.salary + p.cpp + p.oas + p.rrsp_withdrawal + p.non_reg_withdrawal;
      return [p.age, p.salary, p.cpp, p.oas, p.inheritance, p.rrsp_withdrawal, p.tfsa_withdrawal, p.non_reg_withdrawal,
        taxable, p.federal_tax, p.provincial_tax, p.cpp_ei_tax, p.total_tax,
        p.after_tax_income, p.total_expenses, p.net_cash_flow, p.total_balance];
    });
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${scenarioName.replace(/\s+/g, '_')}_projection.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const tabs = [
    { id: 'overview' as const, label: 'Overview', icon: null },
    { id: 'cashflow' as const, label: 'Cash Flow', icon: null },
    { id: 'tax' as const, label: 'Tax', icon: null },
    { id: 'table' as const, label: 'Data Table', icon: null },
    { id: 'verify' as const, label: 'Verification', icon: ShieldCheck }
  ];

  return (
    <div className="space-y-6">
      {showTaxModal && (
        <TaxInfoModal
          audit={representativeAudit}
          province={scenario.province}
          onClose={() => setShowTaxModal(false)}
        />
      )}

      {showCurrentPie && (
        <PortfolioBreakdownModal
          title="Current Portfolio Breakdown"
          subtitle="Available funds today across all accounts"
          slices={currentSlices}
          total={currentNetWorth}
          onClose={() => setShowCurrentPie(false)}
        />
      )}

      {showFinalPie && (
        <PortfolioBreakdownModal
          title="Final Net Worth Breakdown"
          subtitle={`Portfolio breakdown at age ${lastYear.age}${showTodayDollars ? " (today's $)" : ''}`}
          slices={finalSlices}
          total={lastNetWorth}
          onClose={() => setShowFinalPie(false)}
        />
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold text-gray-900">Simulation Results</h2>
        <div className="flex gap-2 flex-wrap">
          <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 bg-white text-sm">
            <span className={!showTodayDollars ? 'font-semibold text-blue-700' : 'text-gray-400'}>Future $</span>
            <button
              onClick={() => setShowTodayDollars(v => !v)}
              className={`relative w-11 h-6 rounded-full transition-colors ${showTodayDollars ? 'bg-blue-600' : 'bg-gray-300'}`}
            >
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all duration-200 ${showTodayDollars ? 'left-6' : 'left-1'}`} />
            </button>
            <span className={showTodayDollars ? 'font-semibold text-blue-700' : 'text-gray-400'}>Today's $</span>
          </div>
          <button
            onClick={onSaveComparison}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm"
          >
            <Copy className="w-4 h-4" />
            Save for Comparison
          </button>
          <PDFExport
            projections={projections}
            scenario={scenario}
            monteCarloResult={monteCarloResult}
            incomeSources={incomeSources}
            savingsAccounts={savingsAccounts}
            expenseLadder={expenseLadder}
            inflationRate={inflationRate}
          />
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard
          icon={DollarSign}
          label="Current Net Worth"
          value={formatCurrency(currentNetWorth)}
          sub="Today's account balances"
          color="bg-slate-600"
          onPieClick={() => setShowCurrentPie(true)}
        />
        <StatCard
          icon={DollarSign}
          label="Final Net Worth"
          value={formatCurrency(lastNetWorth)}
          sub={`At age ${lastYear.age}${showTodayDollars ? " (today's $)" : ''}`}
          color={lastNetWorth >= 0 ? 'bg-green-500' : 'bg-red-500'}
          onPieClick={() => setShowFinalPie(true)}
        />
        <StatCard
          icon={Calendar}
          label={runOutAge ? 'Funds Run Out' : 'Funds Last'}
          value={runOutAge ? `Age ${runOutAge}` : `Age ${lastYear.age}+`}
          sub={runOutAge ? 'Consider adjusting plan' : 'Full plan funded'}
          color={runOutAge ? 'bg-red-500' : 'bg-green-500'}
        />
        <StatCard
          icon={ReceiptText}
          label="Total Tax Paid"
          value={formatCurrency(totalTaxPv)}
          sub={`All years${showTodayDollars ? " (today's $)" : ''}`}
          color="bg-orange-500"
          onInfoClick={() => setShowTaxModal(true)}
        />
        <StatCard
          icon={monteCarloResult ? Target : TrendingUp}
          label={monteCarloResult ? 'Success Rate' : 'Retirement Income'}
          value={monteCarloResult
            ? `${monteCarloResult.success_rate.toFixed(1)}%`
            : firstRetirementYear ? formatCurrency(pv(firstRetirementYear.after_tax_income, firstRetirementYear.year - 1)) : '—'}
          sub={monteCarloResult ? `${monteCarloResult.iterations.toLocaleString()} iterations` : 'First year after-tax income'}
          color="bg-blue-500"
        />
      </div>

      {monteCarloResult && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="font-semibold text-gray-900 mb-3">Monte Carlo Percentiles (Final Net Worth)</h3>
          <div className="grid grid-cols-3 gap-4 text-center">
            {[
              { label: '10th Percentile (Worst)', data: monteCarloResult.percentile_10, color: 'red' },
              { label: '50th Percentile (Median)', data: monteCarloResult.percentile_50, color: 'blue' },
              { label: '90th Percentile (Best)', data: monteCarloResult.percentile_90, color: 'green' }
            ].map(({ label, data, color }) => {
              const last = data[data.length - 1];
              const val = last ? pv(last.total_balance, last.year - 1) : 0;
              return (
                <div key={label} className={`p-3 bg-${color}-50 border border-${color}-200 rounded-lg`}>
                  <p className={`text-xs text-${color}-600 font-medium`}>{label}</p>
                  <p className={`text-xl font-bold text-${color}-700 mt-1`}>{formatCurrency(val)}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showAISuggestions && onApplySuggestion && onResetOptimization && (
        <AISuggestionsPanel
          suggestions={suggestions}
          activeSuggestion={activeSuggestion || null}
          onApplySuggestion={onApplySuggestion}
          onResetOptimization={onResetOptimization}
          defaultMetrics={calculateComparisonMetrics(projections)}
          optimizedMetrics={optimizedProjections ? calculateComparisonMetrics(optimizedProjections) : undefined}
        />
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex items-center border-b border-gray-200 overflow-x-auto">
          <div className="flex flex-1 min-w-0">
            {tabs.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-5 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-white border-b-2 border-blue-600 text-blue-600'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}>
                {tab.icon && <tab.icon className="w-3.5 h-3.5" />}
                {tab.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 px-4 py-2.5 border-l border-gray-200 bg-gray-50 shrink-0">
            <span className={`text-xs font-medium whitespace-nowrap transition-colors ${!retirementView ? 'text-gray-900' : 'text-gray-400'}`}>
              Overall
            </span>
            <button
              onClick={() => setRetirementView(v => !v)}
              className={`relative w-10 h-5 rounded-full transition-colors focus:outline-none ${retirementView ? 'bg-blue-600' : 'bg-gray-300'}`}
              title={retirementView ? 'Showing from retirement age' : 'Showing full projection'}
            >
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all duration-200 ${retirementView ? 'left-5' : 'left-0.5'}`} />
            </button>
            <span className={`text-xs font-medium whitespace-nowrap transition-colors ${retirementView ? 'text-blue-700' : 'text-gray-400'}`}>
              Retirement
            </span>
          </div>
        </div>

        <div className="p-5">
          {activeTab === 'overview' && (
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">Net Worth Over Time</h3>
              <NetWorthChart
                projections={viewProjections}
                monteCarloResult={retirementView ? undefined : monteCarloResult}
                optimizedProjections={optimizedProjections}
                showInflationAdjusted={showTodayDollars}
                inflationRate={inflationRate}
              />
            </div>
          )}
          {activeTab === 'cashflow' && (
            <CashFlowChart data={viewProjections} showToday={showTodayDollars} inflationRate={inflationRate} />
          )}
          {activeTab === 'tax' && (
            <TaxChart data={viewProjections} showToday={showTodayDollars} inflationRate={inflationRate} />
          )}
          {activeTab === 'table' && (
            <ProjectionTable
              projections={viewProjections}
              scenario={scenario}
              incomeSources={incomeSources}
              savingsAccounts={savingsAccounts}
              expenseLadder={expenseLadder}
              oneTimeEvents={oneTimeEvents}
              showTodayDollars={showTodayDollars}
              inflationRate={inflationRate}
            />
          )}
          {activeTab === 'verify' && (
            <TaxVerificationPanel
              projections={viewProjections}
              scenario={scenario}
              incomeSources={incomeSources}
              savingsAccounts={savingsAccounts}
              expenseLadder={expenseLadder}
              oneTimeEvents={oneTimeEvents}
              liveTaxData={liveTaxData}
              taxDataStatus={taxDataStatus}
              onTaxDataRefreshed={onTaxDataRefreshed}
            />
          )}
        </div>
      </div>

      {savedResults.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Saved Comparisons</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {savedResults.map((r, i) => {
              const last = r.projections[r.projections.length - 1];
              const finalBalance = pv(last.total_balance, last.year - 1);
              const tax = showTodayDollars
                ? r.projections.reduce((s, p) => s + pv(p.total_tax, p.year - 1), 0)
                : r.projections.reduce((s, p) => s + p.total_tax, 0);
              return (
                <div key={i} className="border-2 rounded-lg p-4" style={{ borderColor: r.color }}>
                  <p className="font-semibold mb-2" style={{ color: r.color }}>{r.name}</p>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Final Balance</span>
                      <span className={`font-bold ${finalBalance < 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {formatCurrency(finalBalance)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Total Tax</span>
                      <span className="font-medium text-red-600">{formatCurrency(tax)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Final Age</span>
                      <span className="font-medium text-gray-900">{last.age}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
