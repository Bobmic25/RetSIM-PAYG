import { useState, useEffect, useMemo } from 'react';
import { TrendingUp, DollarSign, Calendar, Target, Download, Copy, ReceiptText, HelpCircle, ShieldCheck, AlertTriangle, PieChart as PieChartIcon } from 'lucide-react';
import PDFExport from './PDFExport';
import NetWorthChart from './NetWorthChart';
import CashFlowChart from './CashFlowChart';
import TaxChart from './TaxChart';
import ProjectionTable from './ProjectionTable';
import TaxInfoModal from './TaxInfoModal';
import TaxVerificationPanel from './TaxVerificationPanel';
import PortfolioBreakdownModal, { PortfolioSlice } from './PortfolioBreakdownModal';
import AISuggestionsPanel from './AISuggestionsPanel';
import { YearlyProjection, MonteCarloResult, Scenario, IncomeSource, SavingsAccount, ExpenseLadder, HealthcareStep, OneTimeEvent, AssetAllocation } from '../types/retirement';
import { formatCurrency } from '../lib/formatters';
import { presentValue } from '../lib/benefitsEngine';
import { computeTaxAudit, calcTieredCapitalGainInclusion, OAS_CLAWBACK_THRESHOLD_2026, OAS_CLAWBACK_RATE, FEDERAL_BRACKETS_2026 } from '../lib/taxEngine';
import { GIS_MAX_SINGLE_ANNUAL_2026, GIS_CLAWBACK_RATE } from '../lib/benefitsEngine';
import { type LiveTaxData } from '../lib/taxDataService';
import { generateSuggestions, calculateComparisonMetrics, type Suggestion } from '../lib/suggestionEngine';
import { runSingleProjection } from '../lib/projectionEngine';

interface SavedResult {
  name: string;
  projections: YearlyProjection[];
  color: string;
}

type RelativeScoreCard = {
  key: string;
  finalBalance: number;
  taxes: number;
  retirementWithdrawals: number;
  scoreBalance: number;
};

function addRelativeScores<T extends RelativeScoreCard>(cards: T[]): Array<T & { relativeScore: number; scoreDelta: number; rank: number }> {
  if (cards.length === 0) return [];

  const minBalance = Math.min(...cards.map(card => card.scoreBalance));
  const maxBalance = Math.max(...cards.map(card => card.scoreBalance));
  const minTaxes = Math.min(...cards.map(card => card.taxes));
  const maxTaxes = Math.max(...cards.map(card => card.taxes));
  const minWithdrawals = Math.min(...cards.map(card => card.retirementWithdrawals));
  const maxWithdrawals = Math.max(...cards.map(card => card.retirementWithdrawals));

  const balanceRange = maxBalance - minBalance;
  const taxRange = maxTaxes - minTaxes;
  const withdrawalRange = maxWithdrawals - minWithdrawals;

  const scoredCards = cards.map(card => {
    const balanceScore = balanceRange > 0 ? (card.scoreBalance - minBalance) / balanceRange : 1;
    const taxScore = taxRange > 0 ? (maxTaxes - card.taxes) / taxRange : 1;
    const withdrawalScore = withdrawalRange > 0 ? (card.retirementWithdrawals - minWithdrawals) / withdrawalRange : 1;
    const relativeScore = Math.round((balanceScore * 0.35 + taxScore * 0.2 + withdrawalScore * 0.45) * 100);
    return {
      ...card,
      relativeScore,
    };
  });

  const averageScore = scoredCards.reduce((sum, card) => sum + card.relativeScore, 0) / scoredCards.length;
  const ranks = [...scoredCards]
    .sort((left, right) => right.relativeScore - left.relativeScore)
    .map(card => card.key);

  return scoredCards.map(card => ({
    ...card,
    scoreDelta: Math.round(card.relativeScore - averageScore),
    rank: ranks.indexOf(card.key) + 1,
  }));
}

const WITHDRAWAL_STRATEGIES: Array<{
  id: Scenario['withdrawal_strategy'];
  label: string;
  shortLabel: string;
  color: string;
}> = [
  { id: 'maximize_spending', label: 'Maximize Life Spending', shortLabel: 'Life Spending', color: '#2563eb' },
  { id: 'maximize_estate', label: 'Maximize Estate Value', shortLabel: 'Estate Value', color: '#059669' },
  { id: 'tax_efficient', label: 'Tax Efficient', shortLabel: 'Tax Efficient', color: '#d97706' },
  { id: 'net_expenses_only', label: 'Net Expenses Only', shortLabel: 'Net Expenses', color: '#7c3aed' },
  { id: 'rrsp_meltdown', label: 'RRSP Meltdown', shortLabel: 'RRSP Meltdown', color: '#dc2626' },
  { id: 'minimize_lifetime_tax', label: 'Minimize Lifetime Tax', shortLabel: 'Min. Tax', color: '#0891b2' },
];

const WITHDRAWAL_STRATEGY_DETAILS: Record<Scenario['withdrawal_strategy'], { badge: string; description: string }> = {
  maximize_spending: {
    badge: 'Most spending',
    description: 'Draws more from registered accounts to maximize controllable retirement spending while using lower tax brackets each year.',
  },
  maximize_estate: {
    badge: 'Largest estate',
    description: 'Preserves registered accounts as long as possible so more of the portfolio can continue compounding for the estate.',
  },
  tax_efficient: {
    badge: 'Balanced',
    description: 'Balances spending and taxes by smoothing taxable income and filling lower tax brackets more deliberately.',
  },
  net_expenses_only: {
    badge: 'Conservative',
    description: 'Withdraws only what is needed to cover after-tax planned expenses and avoids creating unnecessary taxable income.',
  },
  rrsp_meltdown: {
    badge: 'Early RRSP draw',
    description: 'Accelerates RRSP withdrawals earlier in retirement to reduce the risk of large RRIF-driven tax spikes later on.',
  },
  minimize_lifetime_tax: {
    badge: 'Tax-optimized',
    description: 'Uses a forward RRIF look-ahead to spread registered withdrawals across years and reduce lifetime tax and OAS clawback pressure.',
  },
};

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
  assetAllocations: AssetAllocation[];
  expenseLadder: ExpenseLadder[];
  healthcareSteps: HealthcareStep[];
  oneTimeEvents: OneTimeEvent[];
  onSaveComparison: () => void;
  savedResults: SavedResult[];
  liveTaxData?: LiveTaxData | null;
  taxDataStatus?: 'loading' | 'live' | 'fallback';
  onTaxDataRefreshed?: (data: LiveTaxData) => void;
  showAISuggestions?: boolean;
  onWithdrawalStrategyChange?: (strategy: Scenario['withdrawal_strategy']) => void;
  mcIsStale?: boolean;
  onRerunMonteCarlo?: () => void;
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
  assetAllocations,
  expenseLadder,
  healthcareSteps,
  oneTimeEvents,
  onSaveComparison,
  savedResults,
  liveTaxData,
  taxDataStatus,
  onTaxDataRefreshed,
  showAISuggestions = false,
  onWithdrawalStrategyChange,
  mcIsStale = false,
  onRerunMonteCarlo
}: ResultsDashboardProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'cashflow' | 'tax' | 'table' | 'verify'>('overview');
  const [showTodayDollars, setShowTodayDollars] = useState(true);
  const [showTaxModal, setShowTaxModal] = useState(false);
  const [retirementView, setRetirementView] = useState(false);
  const [showCurrentPie, setShowCurrentPie] = useState(false);
  const [showFinalPie, setShowFinalPie] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [hoveredStrategyId, setHoveredStrategyId] = useState<Scenario['withdrawal_strategy'] | null>(null);
  // Used to notify ProjectionTable to re-run the CPP/OAS optimization after a suggestion is applied.
  const [optimTrigger, setOptimTrigger] = useState(0);

  // Generate suggestions when projections change
  useEffect(() => {
    if (projections.length > 0) {
      const generatedSuggestions = generateSuggestions(projections, scenario, monteCarloResult, {
        incomeSources,
        savingsAccounts,
        expenseLadder,
        healthcareSteps,
        oneTimeEvents,
        assetAllocations,
      });
      setSuggestions(generatedSuggestions);
    }
  }, [projections, scenario, monteCarloResult, incomeSources, savingsAccounts, expenseLadder, healthcareSteps, oneTimeEvents, assetAllocations]);

  // When the AI Suggested Improvements panel is opened, switch to the Data Table tab
  // and trigger the CPP/OAS optimization so the results appear below the suggestions.
  useEffect(() => {
    if (showAISuggestions) {
      setActiveTab('table');
      setOptimTrigger(t => t + 1);
    }
  }, [showAISuggestions]);

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

  const retirementProjections = projections.filter(p => p.age >= retirementStartAge);

  const pv = (amount: number, yearIndex: number) =>
    showTodayDollars ? presentValue(amount, yearIndex, inflationRate) : amount;

  const lastNetWorth = pv(lastYear.total_balance, lastYear.year - 1);
  const totalTaxPv = showTodayDollars
    ? projections.reduce((s, p) => s + pv(p.total_tax, p.year - 1), 0)
    : totalTax;

  // Retirement-period only tax — aligns with the CPP/OAS optimization table metric.
  const totalRetirementTaxPv = retirementProjections.reduce(
    (s, p) => s + pv(p.total_tax, p.year - 1), 0
  );

  const totalRetirementWithdrawals = retirementProjections.reduce(
    (s, p) => s + pv(p.total_withdrawals, p.year - 1), 0
  );

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
    scenario.inflation_rate,
    undefined,
    representativeYear.age,
    representativeYear.cpp + representativeYear.rrsp_withdrawal + representativeYear.db_pension,
    0,
    {
      hasDisabilityTaxCredit: scenario.primary_has_dtc ?? false,
      medicalExpenses: presentValue(scenario.medical_expenses_annual ?? 0, representativeYear.year - 1, -scenario.inflation_rate),
      charitableDonations: presentValue(scenario.charitable_donations_annual ?? 0, representativeYear.year - 1, -scenario.inflation_rate),
    }
  );

  const ACCOUNT_COLORS: Record<string, string> = {
    rrsp: '#2563eb',
    rrsp_spouse: '#60a5fa',
    tfsa: '#16a34a',
    fhsa: '#0891b2',
    non_reg: '#d97706',
    primary_residence: '#b91c1c',
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
      value: savingsAccounts.filter(a => a.account_type === 'non_reg' && !a.is_primary_residence).reduce((s, a) => s + a.current_balance, 0),
      color: ACCOUNT_COLORS.non_reg,
    },
    {
      label: 'Primary Residence',
      value: savingsAccounts.filter(a => a.account_type === 'non_reg' && a.is_primary_residence).reduce((s, a) => s + a.current_balance, 0),
      color: ACCOUNT_COLORS.primary_residence,
    },
  ].filter(s => s.value > 0);

  const currentNetWorth = currentSlices.reduce((s, sl) => s + sl.value, 0) - (scenario.mortgage?.balance ?? 0);

  const finalSlices: PortfolioSlice[] = [
    { label: 'RRSP', value: pv(lastYear.rrsp_balance, lastYear.year - 1), color: ACCOUNT_COLORS.rrsp },
    { label: 'TFSA', value: pv(lastYear.tfsa_balance, lastYear.year - 1), color: ACCOUNT_COLORS.tfsa },
    { label: 'FHSA', value: pv(lastYear.fhsa_balance, lastYear.year - 1), color: ACCOUNT_COLORS.fhsa },
    { label: 'Non-Registered', value: pv(lastYear.non_reg_balance, lastYear.year - 1), color: ACCOUNT_COLORS.non_reg },
    { label: 'Primary Residence', value: pv(lastYear.primary_residence_balance || 0, lastYear.year - 1), color: ACCOUNT_COLORS.primary_residence },
  ].filter(s => s.value > 0);

  const strategySummaryCards = useMemo(() => {
    const cards = WITHDRAWAL_STRATEGIES.map(strategy => {
      const strategyProjections = strategy.id === scenario.withdrawal_strategy
        ? projections
        : runSingleProjection(
            { ...scenario, withdrawal_strategy: strategy.id },
            incomeSources,
            savingsAccounts,
            expenseLadder,
          healthcareSteps,
            oneTimeEvents,
            undefined,
            undefined,
            undefined,
            assetAllocations
          );

      const strategyLast = strategyProjections[strategyProjections.length - 1];
      const strategyRetirementAge = strategyProjections.find(p => p.total_withdrawals > 0 || p.cpp > 0)?.age ?? scenario.retirement_age;
      const retirementTaxBurden = strategyProjections
        .filter(p => p.age >= strategyRetirementAge)
        .reduce((sum, p) => sum + pv(p.total_tax, p.year - 1), 0);
      const terminalTaxBurden = strategyLast?.terminal_tax != null
        ? pv(strategyLast.terminal_tax, strategyLast.year - 1)
        : 0;
      const retirementWithdrawals = showTodayDollars
        ? strategyProjections
            .filter(p => p.age >= strategyRetirementAge)
            .reduce((sum, p) => sum + pv(p.total_withdrawals, p.year - 1), 0)
        : strategyProjections
            .filter(p => p.age >= strategyRetirementAge)
            .reduce((sum, p) => sum + p.total_withdrawals, 0);
      const taxes = retirementTaxBurden + terminalTaxBurden;
      const finalBalance = strategyLast
        ? (showTodayDollars ? pv(strategyLast.total_balance, strategyLast.year - 1) : strategyLast.total_balance)
        : 0;
      const scoreBalance = strategyLast?.net_estate_value != null
        ? pv(strategyLast.net_estate_value, strategyLast.year - 1)
        : finalBalance;

      return {
        key: `strategy-${strategy.id}`,
        strategyId: strategy.id,
        title: strategy.label,
        badge: WITHDRAWAL_STRATEGY_DETAILS[strategy.id].badge,
        description: WITHDRAWAL_STRATEGY_DETAILS[strategy.id].description,
        color: strategy.color,
        finalBalance,
        taxes,
        retirementWithdrawals,
        scoreBalance,
        isActive: strategy.id === scenario.withdrawal_strategy,
        onClick: onWithdrawalStrategyChange ? () => onWithdrawalStrategyChange(strategy.id) : undefined,
      };
    });

    return addRelativeScores(cards);
  }, [
    scenario,
    projections,
    incomeSources,
    savingsAccounts,
    assetAllocations,
    expenseLadder,
    healthcareSteps,
    oneTimeEvents,
    showTodayDollars,
    onWithdrawalStrategyChange,
  ]);

  const selectedStrategySummary = strategySummaryCards.find(card => card.strategyId === scenario.withdrawal_strategy) ?? strategySummaryCards[0];
  const previewStrategySummary = hoveredStrategyId
    ? strategySummaryCards.find(card => card.strategyId === hoveredStrategyId) ?? selectedStrategySummary
    : selectedStrategySummary;

  const savedComparisonCards = addRelativeScores(savedResults.map((r, i) => {
      const last = r.projections[r.projections.length - 1];
      const finalBalance = showTodayDollars
        ? pv(last.total_balance, last.year - 1)
        : last.total_balance;
      const savedRetirementAge = r.projections.find(p => p.total_withdrawals > 0 || p.cpp > 0)?.age ?? 0;
      const tax = r.projections
        .filter(p => p.age >= savedRetirementAge)
        .reduce((s, p) => s + pv(p.total_tax, p.year - 1), 0) +
        (last.terminal_tax != null ? pv(last.terminal_tax, last.year - 1) : 0);
      const totalRetirementWd = showTodayDollars
        ? r.projections.filter(p => p.age >= savedRetirementAge).reduce((s, p) => s + pv(p.total_withdrawals, p.year - 1), 0)
        : r.projections.filter(p => p.age >= savedRetirementAge).reduce((s, p) => s + p.total_withdrawals, 0);
      const scoreBalance = last.net_estate_value != null
        ? pv(last.net_estate_value, last.year - 1)
        : finalBalance;
      return {
        key: `saved-${i}`,
        title: r.name,
        badge: 'Saved',
        color: r.color,
        finalBalance,
        taxes: tax,
        retirementWithdrawals: totalRetirementWd,
        scoreBalance,
        isActive: false,
        onClick: undefined,
      };
    }));

  const exportCSV = () => {
    const headers = ['Age', 'Salary', 'CPP', 'OAS', 'Inheritance', 'RRSP W/D', 'TFSA W/D', 'Non-Reg W/D',
      'Taxable Income', 'Federal Tax', 'Prov Tax', 'CPP/EI/OAS', 'Total Tax', 'After-Tax', 'Expenses', 'Net Flow', 'Total Net Worth'];
    const rows = projections.map(p => {
      const taxable = p.salary + p.cpp + p.oas + p.rrsp_withdrawal + p.non_reg_capital_gain_inclusion - (p.rrsp_salary_deduction ?? 0);
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
          {scenario.return_type === 'monte_carlo' && onRerunMonteCarlo && (
            <button
              onClick={onRerunMonteCarlo}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              Re-Run Simulation
            </button>
          )}
        </div>
      </div>

      {taxDataStatus === 'fallback' && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-amber-900">
              Live tax data could not be verified. Using built-in 2026 tax constants for this run.
            </p>
          </div>
          <button
            onClick={() => setActiveTab('verify')}
            className="text-xs font-semibold text-amber-800 hover:text-amber-900 underline whitespace-nowrap"
          >
            View details
          </button>
        </div>
      )}

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
          label="Total Tax in Retirement"
          value={formatCurrency(totalRetirementTaxPv)}
          sub={`All post-retirement${showTodayDollars ? " (today's $)" : ''}`}
          color="bg-orange-500"
          onInfoClick={() => setShowTaxModal(true)}
        />
        <StatCard
          icon={monteCarloResult ? Target : TrendingUp}
          label={monteCarloResult ? 'Success Rate' : 'Total Ret. Withdrawals'}
          value={monteCarloResult
            ? `${monteCarloResult.success_rate.toFixed(1)}%`
            : formatCurrency(totalRetirementWithdrawals)}
          sub={monteCarloResult ? `${monteCarloResult.iterations.toLocaleString()} iterations` : `All post-retirement${showTodayDollars ? " (today's $)" : ''}`}
          color="bg-blue-500"
        />
      </div>

      {mcIsStale && monteCarloResult && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center justify-between gap-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-amber-900">
              The Monte Carlo bands shown are from a previous run. The deterministic projection has been updated for the new strategy. Click <strong>Re-Run Simulation</strong> to regenerate the MC bands with the current settings.
            </p>
          </div>
          {onRerunMonteCarlo && (
            <button
              onClick={onRerunMonteCarlo}
              className="px-3 py-1.5 bg-amber-600 text-white text-xs font-semibold rounded-lg hover:bg-amber-700 whitespace-nowrap"
            >
              Re-Run Simulation
            </button>
          )}
        </div>
      )}

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
          onApplySuggestion={(s) => {
            onApplySuggestion(s);
            setActiveTab('table');
            setOptimTrigger(t => t + 1);
          }}
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
          <div className="flex items-center gap-4 px-4 py-2.5 border-l border-gray-200 bg-gray-50 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-700">Return Type:</span>
              <span className="text-xs font-semibold text-gray-900">{scenario.return_type === 'monte_carlo' ? 'Monte Carlo' : 'Linear'}</span>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-gray-700">Withdrawal Strategy:</label>
              <select 
                value={scenario.withdrawal_strategy} 
                onChange={(e) => onWithdrawalStrategyChange?.(e.target.value as Scenario['withdrawal_strategy'])}
                className="px-2 py-1 text-xs border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              >
                <option value="maximize_spending">Maximize Life Spending</option>
                <option value="maximize_estate">Maximize Estate Value</option>
                <option value="tax_efficient">Tax Efficient</option>
                <option value="net_expenses_only">Net Expenses Only</option>
                <option value="rrsp_meltdown">RRSP Meltdown</option>
                <option value="minimize_lifetime_tax">Minimize Lifetime Tax</option>
              </select>
            </div>
            <div className="flex items-center gap-2 pl-4 border-l border-gray-300">
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
              healthcareSteps={healthcareSteps}
              oneTimeEvents={oneTimeEvents}
              showTodayDollars={showTodayDollars}
              inflationRate={inflationRate}
              autoRunTrigger={optimTrigger}
            />
          )}
          {activeTab === 'verify' && (
            <TaxVerificationPanel
              projections={viewProjections}
              scenario={scenario}
              incomeSources={incomeSources}
              savingsAccounts={savingsAccounts}
              expenseLadder={expenseLadder}
              healthcareSteps={healthcareSteps}
              oneTimeEvents={oneTimeEvents}
              liveTaxData={liveTaxData}
              taxDataStatus={taxDataStatus}
              onTaxDataRefreshed={onTaxDataRefreshed}
            />
          )}

          <div className="mt-8 border-t border-gray-200 pt-5">
            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
              <div>
                <h3 className="font-semibold text-gray-900">Withdrawal Strategy Summaries</h3>
                <p className="text-sm text-gray-500">
                  The first row shows all six withdrawal strategies. Saved comparison snapshots continue on the next row automatically.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
              {strategySummaryCards.map(card => {
                const isHovered = hoveredStrategyId === card.strategyId;
                const isSelected = card.isActive;
                const isDimmed = !isSelected && hoveredStrategyId !== null && !isHovered;
                const scale = isSelected ? 1.045 : isHovered ? 1.018 : hoveredStrategyId !== null ? 0.975 : 0.985;
                const translateY = isSelected ? -5 : isHovered ? -8 : 0;

                return (
                <button
                  key={card.key}
                  type="button"
                  onClick={card.onClick}
                  onMouseEnter={() => setHoveredStrategyId(card.strategyId)}
                  onMouseLeave={() => setHoveredStrategyId(null)}
                  onFocus={() => setHoveredStrategyId(card.strategyId)}
                  onBlur={() => setHoveredStrategyId(null)}
                  disabled={!card.onClick}
                  className={`rounded-2xl border-2 p-3 text-left transition-all duration-200 ease-out ${!card.onClick ? 'cursor-default' : ''}`}
                  style={{
                    borderColor: card.color,
                    backgroundColor: isSelected ? `${card.color}12` : isHovered ? `${card.color}08` : '#ffffff',
                    boxShadow: isSelected
                      ? `0 14px 32px ${card.color}22, 0 3px 8px ${card.color}16`
                      : isHovered
                        ? `0 10px 24px ${card.color}18, 0 3px 8px rgba(0,0,0,0.08)`
                        : 'none',
                    transform: `translateY(${translateY}px) scale(${scale})`,
                    opacity: isDimmed ? 0.48 : 1,
                  }}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="font-semibold text-sm text-gray-900 leading-5">{card.title}</p>
                      <span
                        className="inline-flex mt-1 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors duration-200"
                        style={{
                          backgroundColor: isSelected || isHovered ? `${card.color}18` : '#f3f4f6',
                          color: isSelected || isHovered ? card.color : '#4b5563',
                        }}
                      >
                        {card.badge}
                      </span>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-semibold transition-all duration-200"
                        style={{
                          backgroundColor: `${card.color}18`,
                          color: card.color,
                        }}
                      >
                        Score {card.relativeScore}
                      </span>
                      <span className={`text-[10px] font-medium ${card.scoreDelta >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                        {card.scoreDelta >= 0 ? '+' : ''}{card.scoreDelta} vs avg
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between gap-2">
                      <span className="text-gray-600">Final Balance</span>
                      <span className={`font-semibold ${card.finalBalance < 0 ? 'text-red-600' : 'text-green-700'}`}>
                        {formatCurrency(card.finalBalance)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-gray-600">All-In Tax</span>
                      <span className="font-medium text-red-600">{formatCurrency(card.taxes)}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-gray-600">Ret. Withdrawals</span>
                      <span className="font-medium text-blue-700">{formatCurrency(card.retirementWithdrawals)}</span>
                    </div>
                  </div>
                </button>
                );
              })}
            </div>

            {previewStrategySummary && (
              <div
                className="mt-4 rounded-2xl border px-4 py-4 transition-all duration-200"
                style={{
                  borderColor: `${previewStrategySummary.color}55`,
                  backgroundColor: `${previewStrategySummary.color}0d`,
                  boxShadow: `0 10px 24px ${previewStrategySummary.color}14`,
                }}
              >
                <div className="flex items-center justify-between gap-3 mb-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">
                    {hoveredStrategyId && hoveredStrategyId !== scenario.withdrawal_strategy ? 'Strategy preview' : 'Selected strategy'}
                  </p>
                  <span
                    className="rounded-full px-2 py-1 text-[11px] font-semibold"
                    style={{
                      backgroundColor: `${previewStrategySummary.color}20`,
                      color: previewStrategySummary.color,
                    }}
                  >
                    {previewStrategySummary.badge}
                  </span>
                </div>
                <h4 className="text-sm font-semibold mb-1" style={{ color: previewStrategySummary.color }}>
                  {previewStrategySummary.title}
                </h4>
                <p className="text-sm leading-relaxed text-gray-700">{previewStrategySummary.description}</p>
                <p className="mt-2 text-xs font-medium" style={{ color: previewStrategySummary.color }}>
                  Relative Score {previewStrategySummary.relativeScore}/100, ranked #{previewStrategySummary.rank} of {strategySummaryCards.length}.
                </p>
                <p className="mt-2 text-xs leading-relaxed text-gray-600">
                  Relative Score compares higher retirement withdrawals and after-tax ending value against lower All-In Tax. All-In Tax includes projected taxes paid during retirement plus terminal tax in the final year, which estimates the tax due on remaining registered balances and taxable gains left to the estate.
                </p>
              </div>
            )}

            {savedComparisonCards.length > 0 && (
              <div className="mt-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
                {savedComparisonCards.map(card => (
                  <div
                    key={card.key}
                    className="rounded-xl border-2 bg-white p-3 text-left"
                    style={{ borderColor: card.color }}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <p className="font-semibold text-sm text-gray-900 leading-5">{card.title}</p>
                        <span className="inline-flex mt-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">
                          {card.badge}
                        </span>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                          style={{ backgroundColor: `${card.color}18`, color: card.color }}
                        >
                          Score {card.relativeScore}
                        </span>
                        <span className={`text-[10px] font-medium ${card.scoreDelta >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                          {card.scoreDelta >= 0 ? '+' : ''}{card.scoreDelta} vs avg
                        </span>
                      </div>
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between gap-2">
                        <span className="text-gray-600">Final Balance</span>
                        <span className={`font-semibold ${card.finalBalance < 0 ? 'text-red-600' : 'text-green-700'}`}>
                          {formatCurrency(card.finalBalance)}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-gray-600">All-In Tax</span>
                        <span className="font-medium text-red-600">{formatCurrency(card.taxes)}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-gray-600">Ret. Withdrawals</span>
                        <span className="font-medium text-blue-700">{formatCurrency(card.retirementWithdrawals)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
