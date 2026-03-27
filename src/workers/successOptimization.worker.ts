import type {
  AssetAllocation,
  ExpenseLadder,
  HealthcareStep,
  IncomeSource,
  MonteCarloResult,
  OneTimeEvent,
  SavingsAccount,
  Scenario,
} from '../types/retirement';
import { optimizeRetirementSuccessPlan, type RetirementSuccessOptimizationResult } from '../lib/successOptimization';
import { clearTaxCache } from '../lib/taxEngine';

export interface SuccessOptimizationWorkerRequest {
  scenario: Scenario;
  incomeSources: IncomeSource[];
  savingsAccounts: SavingsAccount[];
  expenseLadder: ExpenseLadder[];
  healthcareSteps: HealthcareStep[];
  oneTimeEvents: OneTimeEvent[];
  allocations: AssetAllocation[];
  baselineMonteCarloResult: MonteCarloResult;
}

export interface SuccessOptimizationWorkerResultMessage {
  type: 'result';
  result: RetirementSuccessOptimizationResult | null;
}

export interface SuccessOptimizationWorkerErrorMessage {
  type: 'error';
  message: string;
}

self.onmessage = async (e: MessageEvent<SuccessOptimizationWorkerRequest>) => {
  const {
    scenario,
    incomeSources,
    savingsAccounts,
    expenseLadder,
    healthcareSteps,
    oneTimeEvents,
    allocations,
    baselineMonteCarloResult,
  } = e.data;

  clearTaxCache();

  try {
    const result = await optimizeRetirementSuccessPlan({
      scenario,
      incomeSources,
      savingsAccounts,
      expenseLadder,
      healthcareSteps,
      oneTimeEvents,
      assetAllocations: allocations,
      baselineMonteCarloResult,
    });

    const message: SuccessOptimizationWorkerResultMessage = {
      type: 'result',
      result,
    };
    self.postMessage(message);
  } catch (error) {
    const message: SuccessOptimizationWorkerErrorMessage = {
      type: 'error',
      message: String(error),
    };
    self.postMessage(message);
  }
};