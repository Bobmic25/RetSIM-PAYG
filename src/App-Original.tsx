import { useState } from 'react';
import { ChevronLeft, ChevronRight, Play } from 'lucide-react';
import Header from './components/Header';
import ProfileForm from './components/ProfileForm';
import IncomeForm from './components/IncomeForm';
import SavingsForm from './components/SavingsForm';
import ReturnsForm from './components/ReturnsForm';
import ExpenseLadderForm from './components/ExpenseLadderForm';
import OneTimeEventsForm from './components/OneTimeEventsForm';
import ResultsDashboard from './components/ResultsDashboard';
import {
  Scenario,
  IncomeSource,
  SavingsAccount,
  ExpenseLadder,
  OneTimeEvent,
  YearlyProjection,
  MonteCarloResult
} from './types/retirement';
import { runSingleProjection, runMonteCarloSimulation } from './lib/projectionEngine';

const STEPS = [
  { id: 'profile', title: 'Profile' },
  { id: 'income', title: 'Income' },
  { id: 'savings', title: 'Savings' },
  { id: 'returns', title: 'Returns' },
  { id: 'expenses', title: 'Expenses' },
  { id: 'events', title: 'Events' },
  { id: 'results', title: 'Results' }
];

function App() {
  const [currentStep, setCurrentStep] = useState(0);
  const [scenario, setScenario] = useState<Scenario>({
    name: 'My Retirement Plan',
    profile_type: 'individual',
    current_age: 35,
    retirement_age: 65,
    plan_duration: 30,
    province: 'ON',
    inflation_rate: 2.5,
    return_type: 'linear',
    expected_return: 6.0,
    monte_carlo_iterations: 10000,
    withdrawal_strategy: 'maximize_spending',
    cpp_start_age: 65,
    cpp_amount_65: 15000,
    oas_start_age: 65
  });

  const [incomeSources, setIncomeSources] = useState<IncomeSource[]>([]);
  const [savingsAccounts, setSavingsAccounts] = useState<SavingsAccount[]>([]);
  const [expenseLadder, setExpenseLadder] = useState<ExpenseLadder[]>([
    {
      start_age: 65,
      end_age: 75,
      living_expenses: 60000,
      travel_expenses: 15000,
      other_expenses: 5000
    },
    {
      start_age: 76,
      end_age: 85,
      living_expenses: 50000,
      travel_expenses: 5000,
      other_expenses: 5000
    },
    {
      start_age: 86,
      end_age: 95,
      living_expenses: 40000,
      travel_expenses: 0,
      other_expenses: 10000
    }
  ]);
  const [oneTimeEvents, setOneTimeEvents] = useState<OneTimeEvent[]>([]);
  const [projections, setProjections] = useState<YearlyProjection[]>([]);
  const [monteCarloResult, setMonteCarloResult] = useState<MonteCarloResult | undefined>();
  const [isCalculating, setIsCalculating] = useState(false);

  const updateScenario = (updates: Partial<Scenario>) => {
    setScenario({ ...scenario, ...updates });
  };

  const runSimulation = () => {
    setIsCalculating(true);
    setTimeout(() => {
      if (scenario.return_type === 'monte_carlo') {
        const result = runMonteCarloSimulation(
          scenario,
          incomeSources,
          savingsAccounts,
          expenseLadder,
          oneTimeEvents
        );
        setProjections(result.percentile_50);
        setMonteCarloResult(result);
      } else {
        const result = runSingleProjection(
          scenario,
          incomeSources,
          savingsAccounts,
          expenseLadder,
          oneTimeEvents
        );
        setProjections(result);
        setMonteCarloResult(undefined);
      }
      setCurrentStep(6);
      setIsCalculating(false);
    }, 100);
  };

  const nextStep = () => {
    if (currentStep < STEPS.length - 1) {
      if (currentStep === 5) {
        runSimulation();
      } else {
        setCurrentStep(currentStep + 1);
      }
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Header />

      <div className="container mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-xl p-8">
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              {STEPS.map((step, index) => (
                <div key={step.id} className="flex items-center flex-1">
                  <button
                    onClick={() => index < currentStep && setCurrentStep(index)}
                    disabled={index > currentStep}
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-colors ${
                      index === currentStep
                        ? 'bg-blue-600 text-white'
                        : index < currentStep
                        ? 'bg-green-500 text-white hover:bg-green-600 cursor-pointer'
                        : 'bg-gray-300 text-gray-600'
                    }`}
                  >
                    {index + 1}
                  </button>
                  <div className="ml-2">
                    <div
                      className={`text-sm font-medium ${
                        index === currentStep ? 'text-blue-600' : 'text-gray-600'
                      }`}
                    >
                      {step.title}
                    </div>
                  </div>
                  {index < STEPS.length - 1 && (
                    <div
                      className={`flex-1 h-1 mx-4 rounded ${
                        index < currentStep ? 'bg-green-500' : 'bg-gray-300'
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="min-h-[500px]">
            {currentStep === 0 && (
              <ProfileForm scenario={scenario} onChange={updateScenario} />
            )}
            {currentStep === 1 && (
              <IncomeForm incomeSources={incomeSources} onChange={setIncomeSources} />
            )}
            {currentStep === 2 && (
              <SavingsForm accounts={savingsAccounts} onChange={setSavingsAccounts} />
            )}
            {currentStep === 3 && (
              <ReturnsForm scenario={scenario} onChange={updateScenario} />
            )}
            {currentStep === 4 && (
              <ExpenseLadderForm expenses={expenseLadder} onChange={setExpenseLadder} />
            )}
            {currentStep === 5 && (
              <OneTimeEventsForm events={oneTimeEvents} onChange={setOneTimeEvents} />
            )}
            {currentStep === 6 && projections.length > 0 && (
              <ResultsDashboard
                projections={projections}
                monteCarloResult={monteCarloResult}
                inflationRate={scenario.inflation_rate}
              />
            )}
          </div>

          {currentStep < 6 && (
            <div className="flex justify-between mt-8 pt-6 border-t border-gray-200">
              <button
                onClick={prevStep}
                disabled={currentStep === 0}
                className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-colors ${
                  currentStep === 0
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                <ChevronLeft className="w-5 h-5" />
                Previous
              </button>
              <button
                onClick={nextStep}
                disabled={isCalculating}
                className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:bg-blue-400 disabled:cursor-not-allowed"
              >
                {currentStep === 5 ? (
                  <>
                    {isCalculating ? 'Calculating...' : 'Run Simulation'}
                    <Play className="w-5 h-5" />
                  </>
                ) : (
                  <>
                    Next
                    <ChevronRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </div>
          )}

          {currentStep === 6 && (
            <div className="flex justify-center mt-8 pt-6 border-t border-gray-200">
              <button
                onClick={() => setCurrentStep(0)}
                className="flex items-center gap-2 px-6 py-3 bg-gray-600 text-white rounded-lg font-medium hover:bg-gray-700 transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
                Back to Start
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
