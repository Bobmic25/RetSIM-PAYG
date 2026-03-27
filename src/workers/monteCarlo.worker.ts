import type {
  Scenario,
  IncomeSource,
  SavingsAccount,
  ExpenseLadder,
  HealthcareStep,
  OneTimeEvent,
  AssetAllocation,
  MonteCarloResult
} from '../types/retirement';
import { runMonteCarloSimulation, type MonteCarloPathSet, type ProjectionOverrides } from '../lib/projectionEngine';
import { clearTaxCache } from '../lib/taxEngine';

export interface WorkerRequest {
  scenario: Scenario;
  incomeSources: IncomeSource[];
  savingsAccounts: SavingsAccount[];
  expenseLadder: ExpenseLadder[];
  healthcareSteps: HealthcareStep[];
  oneTimeEvents: OneTimeEvent[];
  allocations: AssetAllocation[];
  overrides?: ProjectionOverrides;
  preGeneratedPaths?: MonteCarloPathSet;
}

export interface WorkerProgressMessage {
  type: 'progress';
  completed: number;
  total: number;
}

export interface WorkerResultMessage {
  type: 'result';
  result: MonteCarloResult & { pathSet?: MonteCarloPathSet };
}

export interface WorkerErrorMessage {
  type: 'error';
  message: string;
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const {
    scenario,
    incomeSources,
    savingsAccounts,
    expenseLadder,
    healthcareSteps,
    oneTimeEvents,
    allocations,
    overrides,
    preGeneratedPaths,
  } = e.data;

  clearTaxCache();

  try {
    const result = await runMonteCarloSimulation(
      scenario,
      incomeSources,
      savingsAccounts,
      expenseLadder,
      healthcareSteps,
      oneTimeEvents,
      (completed, total) => {
        const msg: WorkerProgressMessage = { type: 'progress', completed, total };
        self.postMessage(msg);
      },
      allocations,
      overrides,
      preGeneratedPaths
    );

    const msg: WorkerResultMessage = { type: 'result', result };
    self.postMessage(msg);
  } catch (err) {
    const msg: WorkerErrorMessage = { type: 'error', message: String(err) };
    self.postMessage(msg);
  }
};
