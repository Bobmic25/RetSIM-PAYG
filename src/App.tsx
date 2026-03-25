import { useState, useEffect, useMemo, useRef } from 'react';
import {
  ChevronLeft, ChevronRight, Play, User, PiggyBank, Landmark,
  ShoppingCart, Database, TrendingUp, HeartPulse, Calendar, Scaling,
  BarChart2, Save
} from 'lucide-react';
import Header from './components/Header';
import AssistantPanel from './components/AssistantPanel';
import ProfileForm from './components/ProfileForm';
import IncomeForm from './components/IncomeForm';
import SavingsForm from './components/SavingsForm';
import AssetAllocationForm from './components/AssetAllocationForm';
import ReturnsForm from './components/ReturnsForm';
import ExpenseLadderForm from './components/ExpenseLadderForm';
import HealthcareForm from './components/HealthcareForm';
import OneTimeEventsForm from './components/OneTimeEventsForm';
import LongevityPlanner from './components/LongevityPlanner';
import SaveLoadScenarios from './components/SaveLoadScenarios';
import ResultsDashboard from './components/ResultsDashboard';
import {
  Scenario,
  IncomeSource,
  SavingsAccount,
  ExpenseLadder,
  OneTimeEvent,
  YearlyProjection,
  MonteCarloResult,
  AssetAllocation,
  HealthcareStep,
  Province,
  SavedComparisonResult,
} from './types/retirement';
import { runSingleProjection, type ProjectionOverrides } from './lib/projectionEngine';
import { fetchLiveTaxData, type LiveTaxData } from './lib/taxDataService';
import { fetchLiveTfsaLimit, type LiveTfsaLimitData } from './lib/tfsaDataService';
import { fetchLiveInflationData, getCachedInflationData, type LiveInflationData } from './lib/inflationDataService';
import { setActiveLiveTaxData, clearTaxCache } from './lib/taxEngine';
import { estimateMarketAssumptions } from './lib/marketAssumptions';
import { DEFAULT_MANAGEMENT_FEE_PCT } from './lib/constants';
import type { Suggestion } from './lib/suggestionEngine';
import { buildAssistantContext, type AssistantEntryPoint } from './lib/assistantService';
import MonteCarloWorker from './workers/monteCarlo.worker?worker';

const NAV_ITEMS = [
  { icon: User, label: 'Profile' },
  { icon: Landmark, label: 'Income' },
  { icon: PiggyBank, label: 'Savings' },
  { icon: Database, label: 'Assets' },
  { icon: TrendingUp, label: 'Returns' },
  { icon: ShoppingCart, label: 'Expenses' },
  { icon: HeartPulse, label: 'Healthcare' },
  { icon: Calendar, label: 'Events' },
  { icon: Scaling, label: 'Longevity' },
  { icon: Save, label: 'Save/Load' },
  { icon: BarChart2, label: 'Results' }
];

const RESULTS_STEP = NAV_ITEMS.length - 1;

const IconNav = ({ currentStep, onNavigate, highestVisited }: { currentStep: number; onNavigate: (index: number) => void; highestVisited: number; }) => {
  const clickRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleIconClick = (index: number, _event: React.MouseEvent<HTMLButtonElement>) => {
    onNavigate(index);
    
    // Add click animation
    const button = clickRefs.current[index];
    if (button) {
      button.style.animation = 'none';
      setTimeout(() => {
        button.style.animation = 'popClick 0.4s ease-out';
      }, 10);
    }
  };

  return (
    <div className="bg-white border-b border-gray-200 sticky top-0 z-20">
      <style>{`
        @keyframes popUp {
          0% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-8px) scale(1.25); }
          100% { transform: translateY(-6px) scale(1.25); }
        }
        @keyframes popClick {
          0% { transform: translateY(-6px) scale(1.25); }
          50% { transform: translateY(-12px) scale(1.35); }
          100% { transform: translateY(-6px) scale(1.25); }
        }
        .icon-nav-button:hover .nav-icon {
          animation: popUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
          filter: drop-shadow(0 4px 12px rgba(16, 185, 129, 0.3));
        }
        .icon-nav-button:active .nav-icon {
          filter: drop-shadow(0 8px 16px rgba(16, 185, 129, 0.4));
        }
      `}</style>
      <div className="max-w-6xl mx-auto px-4 md:px-8">
        <div className="flex items-center gap-2 overflow-x-auto py-3" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {NAV_ITEMS.map((item, index) => (
            <button
              key={item.label}
              ref={(el) => { clickRefs.current[index] = el; }}
              onClick={(e) => handleIconClick(index, e)}
              disabled={index > highestVisited + 1 && index !== currentStep}
              className={`icon-nav-button flex flex-col items-center justify-center p-2 rounded-lg transition-all duration-200 ease-in-out group ${
                currentStep === index
                  ? 'bg-green-100'
                  : index === highestVisited + 1
                  ? 'hover:bg-green-50 border border-dashed border-green-300'
                  : index <= highestVisited
                  ? 'hover:bg-gray-100'
                  : 'cursor-not-allowed opacity-40'
              }`}
              style={{ minWidth: '85px' }}
            >
              <item.icon size={24} className={`nav-icon text-[#10B981] transition-all duration-200 ${currentStep === index ? 'scale-110' : ''}`} />
              <span className={`text-xs font-semibold mt-1.5 transition-colors ${
                currentStep === index
                  ? 'text-green-700'
                  : 'text-gray-500 group-hover:text-gray-800'
              }`}>
                {item.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};


function App() {
  const initialInflationData = getCachedInflationData();
  const initialInflationRate = initialInflationData?.fifteenYearAverage ?? 0;
  const initialMarketAssumptions = estimateMarketAssumptions({
    cad_equity_weight: 60,
    us_equity_weight: 40,
    int_equity_weight: 0,
  });
  const [currentStep, setCurrentStep] = useState(0);
  const [highestVisited, setHighestVisited] = useState(0);
  const [scenario, setScenario] = useState<Scenario>({
    name: 'My Retirement Plan',
    profile_type: 'individual',
    current_age: 35,
    retirement_age: 65,
    spouse_retirement_age: 65,
    plan_duration: 30,
    province: 'ON' as Province,
    inflation_rate: initialInflationRate,
    return_type: 'linear',
    expected_return: initialMarketAssumptions.expectedReturn,
    management_fee_pct: DEFAULT_MANAGEMENT_FEE_PCT,
    return_std_dev: initialMarketAssumptions.stdDev,
    return_periods: [],
    monte_carlo_iterations: 1000,
    withdrawal_strategy: 'maximize_spending',
    rrsp_exhaustion_years_before_end: 2,
    cpp_start_age: 65,
    cpp_amount_65: 15000,
    oas_start_age: 65,
    primary_has_dtc: false,
    medical_expenses_annual: 0,
    charitable_donations_annual: 0,
    include_primary_residence: false,
    primary_residence_value: 0,
    cad_equity_weight: 60,
    us_equity_weight: 40,
    int_equity_weight: 0,
    life_expectancy: 90,
    healthcare_inflation: 3.5
  });

  const [incomeSources, setIncomeSources] = useState<IncomeSource[]>([]);
  const [savingsAccounts, setSavingsAccounts] = useState<SavingsAccount[]>([]);
  const [assetAllocations, setAssetAllocations] = useState<AssetAllocation[]>([]);
  const [expenseLadder, setExpenseLadder] = useState<ExpenseLadder[]>([]);
  const [healthcareSteps, setHealthcareSteps] = useState<HealthcareStep[]>([]);
  const [oneTimeEvents, setOneTimeEvents] = useState<OneTimeEvent[]>([]);
  const [projections, setProjections] = useState<YearlyProjection[]>([]);
  const [monteCarloResult, setMonteCarloResult] = useState<MonteCarloResult | undefined>();
  const [optimizedProjections, setOptimizedProjections] = useState<YearlyProjection[] | null>(null);
  const [optimizedMonteCarloResult, setOptimizedMonteCarloResult] = useState<MonteCarloResult | undefined>();
  const [activeSuggestion, setActiveSuggestion] = useState<Suggestion | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [mcProgress, setMcProgress] = useState<{ completed: number; total: number } | null>(null);
  const [savedResults, setSavedResults] = useState<SavedComparisonResult[]>([]);
  const [showAISuggestions, setShowAISuggestions] = useState(false);
  const [liveTaxData, setLiveTaxData] = useState<LiveTaxData | null>(null);
  const [liveInflationData, setLiveInflationData] = useState<LiveInflationData | null>(initialInflationData);
  const [taxDataStatus, setTaxDataStatus] = useState<'loading' | 'live' | 'fallback'>('loading');
  const [tfsaLimitData, setTfsaLimitData] = useState<LiveTfsaLimitData | null>(null);
  const [mcIsStale, setMcIsStale] = useState(false);
  const [marketAssumptionsAuto, setMarketAssumptionsAuto] = useState(true);
  const [showAssistant, setShowAssistant] = useState(false);
  const [assistantEntryPoint, setAssistantEntryPoint] = useState<AssistantEntryPoint>('header');
  const calculationPending = useRef(false);

  const assistantContext = useMemo(() => buildAssistantContext({
    currentStep,
    currentStepLabel: NAV_ITEMS[currentStep]?.label ?? 'Profile',
    scenario,
    savingsAccounts,
    projections,
    monteCarloResult,
    savedResults,
    taxDataStatus,
    mcIsStale,
  }), [currentStep, scenario, savingsAccounts, projections, monteCarloResult, savedResults, taxDataStatus, mcIsStale]);

  useEffect(() => {
    fetchLiveInflationData().then(data => {
      if (!data) return;
      setLiveInflationData(data);
      setScenario(prev => prev.inflation_rate === initialInflationRate ? { ...prev, inflation_rate: data.fifteenYearAverage } : prev);
    });

    fetchLiveTaxData().then(data => {
      if (data) {
        setActiveLiveTaxData(data);
        setLiveTaxData(data);
        setTaxDataStatus('live');
      } else {
        setActiveLiveTaxData(null);
        setTaxDataStatus('fallback');
      }
    });

    fetchLiveTfsaLimit().then(data => {
      setTfsaLimitData(data);
      setSavingsAccounts(prev => {
        const monthlyLimit = data.annualLimit / 12;
        let changed = false;
        const next = prev.map(account => {
          if (account.account_type !== 'tfsa' || account.monthly_contribution <= monthlyLimit) return account;
          changed = true;
          return { ...account, monthly_contribution: monthlyLimit };
        });
        return changed ? next : prev;
      });
    });
  }, [initialInflationRate]);

  const updateScenario = (updates: Partial<Scenario>) => {
    setScenario(prev => ({ ...prev, ...updates }));
  };

  const openAssistant = (entryPoint: AssistantEntryPoint) => {
    setAssistantEntryPoint(entryPoint);
    setShowAssistant(true);
  };

  useEffect(() => {
    if (!marketAssumptionsAuto) {
      return;
    }

    const estimated = estimateMarketAssumptions(scenario, assetAllocations, savingsAccounts);
    setScenario(prev => {
      if (
        prev.expected_return === estimated.expectedReturn &&
        (prev.return_std_dev ?? estimated.stdDev) === estimated.stdDev
      ) {
        return prev;
      }

      return {
        ...prev,
        expected_return: estimated.expectedReturn,
        return_std_dev: estimated.stdDev,
      };
    });
  }, [
    marketAssumptionsAuto,
    scenario.cad_equity_weight,
    scenario.us_equity_weight,
    scenario.int_equity_weight,
    assetAllocations,
    savingsAccounts,
  ]);

  const activeWorkerRef = useRef<Worker | null>(null);

  const runSimulation = async (scenarioOverride?: Scenario, overrides?: ProjectionOverrides) => {
    const simScenario = scenarioOverride ?? scenario;

    if (activeWorkerRef.current) {
      activeWorkerRef.current.terminate();
      activeWorkerRef.current = null;
    }

    setIsCalculating(true);
    setMcProgress(null);
    setMcIsStale(false);

    if (simScenario.return_type === 'monte_carlo') {
      clearTaxCache();
      const worker = new MonteCarloWorker();
      activeWorkerRef.current = worker;

      await new Promise<void>((resolve, reject) => {
        worker.onmessage = (e: MessageEvent) => {
          const msg = e.data;
          if (msg.type === 'progress') {
            setMcProgress({ completed: msg.completed, total: msg.total });
          } else if (msg.type === 'result') {
            setProjections(msg.result.percentile_50);
            setMonteCarloResult(msg.result);
            setMcIsStale(false);
            worker.terminate();
            activeWorkerRef.current = null;
            resolve();
          } else if (msg.type === 'error') {
            worker.terminate();
            activeWorkerRef.current = null;
            reject(new Error(msg.message));
          }
        };
        worker.onerror = (err) => {
          worker.terminate();
          activeWorkerRef.current = null;
          reject(err);
        };
        worker.postMessage({
          scenario: simScenario,
          incomeSources,
          savingsAccounts,
          expenseLadder,
          healthcareSteps,
          oneTimeEvents,
          allocations: assetAllocations,
          overrides
        });
      }).catch(() => {});
    } else {
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      const result = runSingleProjection(
        simScenario,
        incomeSources,
        savingsAccounts,
        expenseLadder,
        healthcareSteps,
        oneTimeEvents,
        undefined,
        undefined,
        undefined,
        assetAllocations,
        undefined,
        overrides
      );
      setProjections(result);
      setMonteCarloResult(undefined);
    }

    setIsCalculating(false);
    setMcProgress(null);
    calculationPending.current = false;
  };

  useEffect(() => {
    if (currentStep === RESULTS_STEP) {
      runSimulation();
    }
  }, [currentStep]);

  const navigateTo = (index: number) => {
    if (index === RESULTS_STEP && index !== currentStep) {
      calculationPending.current = true;
    }
    setCurrentStep(index);
    setHighestVisited(prev => Math.max(prev, index));
  };

  const nextStep = () => {
    if (currentStep < RESULTS_STEP) {
      navigateTo(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      navigateTo(currentStep - 1);
    }
  };

  const saveCurrentResult = () => {
    if (projections.length === 0) return;
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];
    const color = colors[savedResults.length % colors.length];
    setSavedResults(prev => [...prev, { name: scenario.name, projections, color }]);
  };

  const handleApplySuggestion = async (suggestion: Suggestion) => {
    setActiveSuggestion(suggestion);
    setOptimizedProjections(null);
    setOptimizedMonteCarloResult(undefined);

    const overrides: ProjectionOverrides = suggestion.overrides ?? {};
    const scenarioUpdates: Partial<Scenario> = {};

    if (overrides.retirementAge != null) {
      scenarioUpdates.retirement_age = overrides.retirementAge;
    }
    if (overrides.withdrawalStrategy != null) {
      scenarioUpdates.withdrawal_strategy = overrides.withdrawalStrategy;
    }

    const comparisonScenario = { ...scenario, ...scenarioUpdates };

    try {
      setIsCalculating(true);
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      const comparisonResult = runSingleProjection(
        comparisonScenario,
        incomeSources,
        savingsAccounts,
        expenseLadder,
        healthcareSteps,
        oneTimeEvents,
        undefined,
        undefined,
        undefined,
        assetAllocations,
        undefined,
        overrides
      );
      setOptimizedProjections(comparisonResult);
    } catch (error) {
      console.error('Error applying suggestion:', error);
    } finally {
      setIsCalculating(false);
    }
  };

  const handleResetOptimization = () => {
    setActiveSuggestion(null);
    setOptimizedProjections(null);
    setOptimizedMonteCarloResult(undefined);
  };

  const handleWithdrawalStrategyChange = async (newStrategy: Scenario['withdrawal_strategy']) => {
    const normalizedRrspExhaustYears = Math.max(
      1,
      Math.min(
        Math.max(1, scenario.plan_duration - 1),
        scenario.rrsp_exhaustion_years_before_end ?? 2
      )
    );

    const updatedScenario = {
      ...scenario,
      withdrawal_strategy: newStrategy,
      rrsp_exhaustion_years_before_end: normalizedRrspExhaustYears
    };
    setScenario(updatedScenario);

    // In Monte Carlo mode with existing results, only re-run the deterministic projection
    // to avoid expensive MC re-computation when the user is just browsing strategies.
    if (updatedScenario.return_type === 'monte_carlo' && monteCarloResult) {
      setMcIsStale(true);
      setIsCalculating(true);
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      const result = runSingleProjection(
        updatedScenario,
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
      setProjections(result);
      setIsCalculating(false);
      return;
    }

    try {
      await runSimulation(updatedScenario);
    } catch (error) {
      console.error('Error changing withdrawal strategy:', error);
    }
  };

  const handleRerunMonteCarlo = async () => {
    try {
      await runSimulation();
    } catch (error) {
      console.error('Error re-running Monte Carlo simulation:', error);
    }
  };

  const handleLoadScenario = (data: {
    scenario: Scenario;
    incomeSources: IncomeSource[];
    savingsAccounts: SavingsAccount[];
    expenseLadder: ExpenseLadder[];
    healthcareSteps: HealthcareStep[];
    oneTimeEvents: OneTimeEvent[];
  }) => {
    setMarketAssumptionsAuto(false);
    const legacyPrimaryResidenceValue = data.savingsAccounts
      .filter(account => account.account_type === 'non_reg' && account.is_primary_residence)
      .reduce((sum, account) => sum + account.current_balance, 0);
    const normalizedSavingsAccounts = data.savingsAccounts.filter(account => !(account.account_type === 'non_reg' && account.is_primary_residence));
    const normalizedPrimaryResidenceValue = data.scenario.primary_residence_value ?? legacyPrimaryResidenceValue;
    const loadedCadWeight = data.scenario.cad_equity_weight ?? 60;
    const loadedUsWeight = data.scenario.us_equity_weight ?? 40;
    const loadedIntWeight = data.scenario.int_equity_weight ?? Math.max(0, 100 - loadedCadWeight - loadedUsWeight);
    const loadedMarketAssumptions = estimateMarketAssumptions({
      cad_equity_weight: loadedCadWeight,
      us_equity_weight: loadedUsWeight,
      int_equity_weight: loadedIntWeight,
    });

    setScenario({
      ...data.scenario,
      return_type: data.scenario.return_type ?? 'linear',
      expected_return: data.scenario.expected_return ?? loadedMarketAssumptions.expectedReturn,
      management_fee_pct: data.scenario.management_fee_pct ?? DEFAULT_MANAGEMENT_FEE_PCT,
      return_periods: data.scenario.return_periods ?? [],
      rrsp_exhaustion_years_before_end: data.scenario.rrsp_exhaustion_years_before_end ?? 2,
      spouse_retirement_age: data.scenario.spouse_retirement_age ?? data.scenario.retirement_age,
      include_primary_residence: normalizedPrimaryResidenceValue > 0,
      primary_residence_value: normalizedPrimaryResidenceValue,
      cad_equity_weight: loadedCadWeight,
      us_equity_weight: loadedUsWeight,
      int_equity_weight: loadedIntWeight,
      return_std_dev: data.scenario.return_std_dev ?? loadedMarketAssumptions.stdDev,
    });
    setIncomeSources(data.incomeSources);
    setSavingsAccounts(normalizedSavingsAccounts);
    setExpenseLadder(data.expenseLadder);
    setHealthcareSteps(data.healthcareSteps ?? []);
    setOneTimeEvents(data.oneTimeEvents);
    setCurrentStep(0);
    setHighestVisited(RESULTS_STEP);
    setProjections([]);
    setMonteCarloResult(undefined);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <AssistantPanel
        isOpen={showAssistant}
        entryPoint={assistantEntryPoint}
        context={assistantContext}
        onClose={() => setShowAssistant(false)}
      />
      <Header province={scenario.province} onOpenAssistant={() => openAssistant('header')} />
      <IconNav currentStep={currentStep} onNavigate={navigateTo} highestVisited={highestVisited} />

      <div className="container mx-auto px-4 py-8">
        <div className="bg-white rounded-2xl shadow-xl p-6 md:p-8">

          <div className="min-h-[500px]">
            {currentStep === 0 && (
              <ProfileForm
                scenario={scenario}
                onChange={updateScenario}
                onLoadData={handleLoadScenario}
                 inflationData={liveInflationData}
              />
            )}
            {currentStep === 1 && (
                <IncomeForm incomeSources={incomeSources} onChange={setIncomeSources} scenario={scenario} />
            )}
            {currentStep === 2 && (
              <SavingsForm accounts={savingsAccounts} onChange={setSavingsAccounts} scenario={scenario} tfsaLimitData={tfsaLimitData} />
            )}
            {currentStep === 3 && (
              <AssetAllocationForm
                allocations={assetAllocations}
                onChange={setAssetAllocations}
                savingsAccounts={savingsAccounts}
                scenario={scenario}
              />
            )}
            {currentStep === 4 && (
              <ReturnsForm
                scenario={scenario}
                onChange={updateScenario}
                marketAssumptionsAuto={marketAssumptionsAuto}
                onSetMarketAssumptionsAuto={setMarketAssumptionsAuto}
                estimatedMarketAssumptions={estimateMarketAssumptions(scenario, assetAllocations, savingsAccounts)}
              />
            )}
            {currentStep === 5 && (
              <ExpenseLadderForm
                expenses={expenseLadder}
                onChange={setExpenseLadder}
                scenario={scenario}
              />
            )}
            {currentStep === 6 && (
              <HealthcareForm
                steps={healthcareSteps}
                onChange={setHealthcareSteps}
                scenario={scenario}
              />
            )}
            {currentStep === 7 && (
              <OneTimeEventsForm events={oneTimeEvents} onChange={setOneTimeEvents} scenario={scenario} />
            )}
            {currentStep === 8 && (
              <LongevityPlanner
                currentAge={scenario.current_age}
                retirementAge={scenario.retirement_age}
                planDuration={scenario.plan_duration}
                onChange={(value) => updateScenario({ life_expectancy: value })}
              />
            )}
            {currentStep === 9 && (
              <SaveLoadScenarios
                currentScenario={scenario}
                incomeSources={incomeSources}
                savingsAccounts={savingsAccounts}
                expenseLadder={expenseLadder}
                healthcareSteps={healthcareSteps}
                oneTimeEvents={oneTimeEvents}
                onLoad={handleLoadScenario}
              />
            )}
            {currentStep === RESULTS_STEP && isCalculating && projections.length === 0 && (
              <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
                <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                {mcProgress ? (
                  <div className="flex flex-col items-center gap-2 w-64">
                    <p className="text-gray-600 font-medium">Running Monte Carlo simulation...</p>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all duration-200"
                        style={{ width: `${(mcProgress.completed / mcProgress.total) * 100}%` }}
                      />
                    </div>
                    <p className="text-sm text-gray-500">{mcProgress.completed.toLocaleString()} / {mcProgress.total.toLocaleString()} iterations</p>
                  </div>
                ) : (
                  <p className="text-gray-600 font-medium">Calculating your retirement projection...</p>
                )}
              </div>
            )}
            {currentStep === RESULTS_STEP && projections.length > 0 && (
              <div className="relative">
                {isCalculating && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center min-h-[400px] bg-white/90 backdrop-blur-sm z-10 gap-4 rounded-xl">
                    <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    {mcProgress ? (
                      <div className="flex flex-col items-center gap-2 w-64">
                        <p className="text-gray-600 font-medium">Running Monte Carlo simulation...</p>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full transition-all duration-200"
                            style={{ width: `${(mcProgress.completed / mcProgress.total) * 100}%` }}
                          />
                        </div>
                        <p className="text-sm text-gray-500">{mcProgress.completed.toLocaleString()} / {mcProgress.total.toLocaleString()} iterations</p>
                      </div>
                    ) : (
                      <p className="text-gray-600 font-medium">Calculating your retirement projection...</p>
                    )}
                  </div>
                )}
                <ResultsDashboard
                  projections={projections}
                  monteCarloResult={monteCarloResult}
                  optimizedProjections={optimizedProjections}
                  optimizedMonteCarloResult={optimizedMonteCarloResult}
                  activeSuggestion={activeSuggestion}
                  onApplySuggestion={handleApplySuggestion}
                  onResetOptimization={handleResetOptimization}
                  inflationRate={scenario.inflation_rate}
                  scenarioName={scenario.name}
                  scenario={scenario}
                  incomeSources={incomeSources}
                  savingsAccounts={savingsAccounts}
                  assetAllocations={assetAllocations}
                  expenseLadder={expenseLadder}
                  healthcareSteps={healthcareSteps}
                  oneTimeEvents={oneTimeEvents}
                  onSaveComparison={saveCurrentResult}
                  savedResults={savedResults}
                  liveTaxData={liveTaxData}
                  taxDataStatus={taxDataStatus}
                  showAISuggestions={showAISuggestions}
                  onWithdrawalStrategyChange={handleWithdrawalStrategyChange}
                  mcIsStale={mcIsStale}
                  onRerunMonteCarlo={handleRerunMonteCarlo}
                  onOpenAssistant={() => openAssistant('results')}
                  onTaxDataRefreshed={(data) => {
                    setActiveLiveTaxData(data);
                    setLiveTaxData(data);
                    setTaxDataStatus('live');
                  }}
                />
              </div>
            )}
          </div>

          <div className="flex justify-between mt-8 pt-6 border-t border-gray-200">
            <button
              onClick={prevStep}
              disabled={currentStep === 0}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-colors ${
                currentStep === 0
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <ChevronLeft className="w-5 h-5" />
              Previous
            </button>

            {currentStep < RESULTS_STEP ? (
              <button
                onClick={nextStep}
                className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
              >
                {currentStep === RESULTS_STEP - 1 ? (
                  <>
                    Run Simulation
                    <Play className="w-5 h-5" />
                  </>
                ) : (
                  <>
                    Next
                    <ChevronRight className="w-5 h-5" />
                  </>
                )}
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowAISuggestions(v => !v)}
                  className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-colors border ${
                    showAISuggestions
                      ? 'bg-amber-50 border-amber-400 text-amber-700 hover:bg-amber-100'
                      : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  AI Suggested Improvements
                </button>
                <button
                  onClick={() => runSimulation()}
                  disabled={isCalculating}
                  className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:bg-blue-400 disabled:cursor-not-allowed"
                >
                  <Play className="w-5 h-5" />
                  {isCalculating ? 'Calculating...' : 'Re-run Simulation'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
