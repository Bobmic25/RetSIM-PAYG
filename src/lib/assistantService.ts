import type {
  MonteCarloResult,
  SavedComparisonResult,
  Scenario,
  SavingsAccount,
  YearlyProjection,
} from '../types/retirement';

export type AssistantMessageRole = 'user' | 'assistant';
export type AssistantEntryPoint = 'header' | 'results';

export interface AssistantMessage {
  id: string;
  role: AssistantMessageRole;
  text: string;
  createdAt: number;
  topics?: string[];
}

export interface AssistantResponse {
  text: string;
  topics: string[];
}

export interface AssistantContext {
  scenarioKey: string;
  currentStep: number;
  currentStepLabel: string;
  hasResults: boolean;
  scenarioName: string;
  province: string;
  profileType: string;
  spouseAge?: number;
  currentAge: number;
  retirementAge: number;
  planDuration: number;
  inflationRate: number;
  returnType: string;
  withdrawalStrategy: string;
  hasMonteCarlo: boolean;
  mcIsStale?: boolean;
  monteCarloSuccessRate?: number;
  monteCarloIterations?: number;
  fundsLastAge?: number;
  finalProjectionAge?: number;
  fundingPercent?: number;
  currentNetWorth?: number;
  finalNetWorth?: number;
  totalRetirementTax?: number;
  totalRetirementWithdrawals?: number;
  taxDataStatus?: 'loading' | 'live' | 'fallback';
  includePrimaryResidence?: boolean;
  primaryResidenceValue?: number;
  tfsaAccountCount: number;
  rrspAccountCount: number;
  savedScenarioCount: number;
}

const ASSISTANT_HISTORY_PREFIX = 'retsim-assistant-history';

const SECTION_GUIDANCE: Record<string, string> = {
  Profile: 'Use Profile to define the household, retirement timing, inflation, province, CPP/OAS settings, tax credits, mortgage, and optional primary residence assumptions. These settings drive most downstream calculations.',
  Income: 'Use Income to enter salary, pensions, rental income, and other recurring income streams with start and end ages. This section determines pre-retirement cash flow and retirement income sources beyond government benefits.',
  Savings: 'Use Savings to enter RRSP, TFSA, FHSA, and non-registered balances plus contributions. This section tells the simulator what capital exists and how new savings flow into each account type.',
  Assets: 'Use Assets to set portfolio allocation and risk mix for each account type. These allocations feed expected return and volatility assumptions when market assumptions are set automatically or when Monte Carlo is used.',
  Returns: 'Use Returns to choose linear or Monte Carlo mode and to set expected return, volatility, management fee, or manual return periods. This directly changes growth assumptions and success-rate behavior.',
  Expenses: 'Use Expenses to build your Expense Ladder across life stages. Those phased expenses become the spending target the plan has to fund after tax.',
  Healthcare: 'Use Healthcare to add age-based healthcare costs and whether they are insured. These costs are layered on top of the expense ladder and can materially change plan longevity.',
  Events: 'Use Events for inheritances, one-time expenses, or downsizing. These are discrete age-based events that can add assets, create costs, or change residence-related assumptions.',
  Longevity: 'Use Longevity to set the planning horizon. This determines how long the simulator needs the portfolio and income plan to last.',
  'Save/Load': 'Use Save/Load to load saved scenario data into the planner. Use Results to save the current run for visual comparison across strategies or scenarios.',
  Results: 'Use Results to review funding longevity, taxes, withdrawals, net worth, charts, and comparison views. This is where the assistant can explain what the current run means.',
};

function createScenarioKey(scenario: Scenario): string {
  const base = (scenario.id ?? scenario.name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${base || 'scenario'}-${scenario.profile_type}-${scenario.current_age}-${scenario.retirement_age}`;
}

export function createAssistantMessage(role: AssistantMessageRole, text: string, topics?: string[]): AssistantMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    text,
    createdAt: Date.now(),
    topics,
  };
}

export function getStarterPrompts(entryPoint: AssistantEntryPoint, context: AssistantContext): string[] {
  const basePrompts = [
    'How do I use this app?',
    `What should I enter on the ${context.currentStepLabel} tab?`,
    'What is the simulator doing?',
    'How do I save a scenario?',
  ];

  if (entryPoint === 'results' && context.hasResults) {
    return [
      'What does Funds Last mean?',
      'Why is my funding percentage below 100%?',
      'What withdrawal strategy am I using?',
      context.hasMonteCarlo ? 'What does my Monte Carlo success rate mean?' : 'What does linear return mode mean?',
      ...(context.mcIsStale ? ['Why are the Monte Carlo bands stale?'] : []),
    ];
  }

  return basePrompts;
}

export function buildAssistantContext(params: {
  currentStep: number;
  currentStepLabel: string;
  scenario: Scenario;
  savingsAccounts: SavingsAccount[];
  projections: YearlyProjection[];
  monteCarloResult?: MonteCarloResult;
  savedResults: SavedComparisonResult[];
  taxDataStatus?: 'loading' | 'live' | 'fallback';
  mcIsStale?: boolean;
}): AssistantContext {
  const {
    currentStep,
    currentStepLabel,
    scenario,
    savingsAccounts,
    projections,
    monteCarloResult,
    savedResults,
    taxDataStatus,
    mcIsStale,
  } = params;

  const hasResults = projections.length > 0;
  const lastYear = hasResults ? projections[projections.length - 1] : undefined;
  const runOutAge = projections.find(p => p.total_balance <= 0)?.age;
  const lastSalaryAge = projections.reduce((maxAge, p) => p.salary > 0 ? Math.max(maxAge, p.age) : maxAge, -1);
  const retirementStartAge = lastSalaryAge >= 0 ? lastSalaryAge + 1 : scenario.retirement_age;
  const retirementProjections = projections.filter(p => p.age >= retirementStartAge);
  const fundedRetirementYears = runOutAge
    ? retirementProjections.filter(p => p.age < runOutAge).length
    : retirementProjections.length;
  const fundingPercent = retirementProjections.length > 0
    ? Math.round((fundedRetirementYears / retirementProjections.length) * 100)
    : undefined;

  const currentPrimaryResidenceValue = scenario.include_primary_residence ? (scenario.primary_residence_value ?? 0) : 0;
  const currentNetWorth = savingsAccounts.reduce((sum, account) => sum + account.current_balance, 0) + currentPrimaryResidenceValue - (scenario.mortgage?.balance ?? 0);
  const totalRetirementTax = retirementProjections.reduce((sum, p) => sum + p.total_tax, 0);
  const totalRetirementWithdrawals = retirementProjections.reduce((sum, p) => sum + p.total_withdrawals, 0);

  return {
    scenarioKey: createScenarioKey(scenario),
    currentStep,
    currentStepLabel,
    hasResults,
    scenarioName: scenario.name,
    province: scenario.province,
    profileType: scenario.profile_type,
    spouseAge: scenario.spouse_age,
    currentAge: scenario.current_age,
    retirementAge: scenario.retirement_age,
    planDuration: scenario.plan_duration,
    inflationRate: scenario.inflation_rate,
    returnType: scenario.return_type,
    withdrawalStrategy: scenario.withdrawal_strategy,
    hasMonteCarlo: scenario.return_type === 'monte_carlo' || monteCarloResult?.mode === 'monte_carlo',
    mcIsStale,
    monteCarloSuccessRate: monteCarloResult?.success_rate,
    monteCarloIterations: monteCarloResult?.iterations,
    fundsLastAge: runOutAge,
    finalProjectionAge: lastYear?.age,
    fundingPercent,
    currentNetWorth,
    finalNetWorth: lastYear?.total_balance,
    totalRetirementTax,
    totalRetirementWithdrawals,
    taxDataStatus,
    includePrimaryResidence: scenario.include_primary_residence,
    primaryResidenceValue: scenario.primary_residence_value,
    tfsaAccountCount: savingsAccounts.filter(account => account.account_type === 'tfsa').length,
    rrspAccountCount: savingsAccounts.filter(account => account.account_type === 'rrsp').length,
    savedScenarioCount: savedResults.length,
  };
}

function formatPercent(value?: number): string {
  return typeof value === 'number' ? `${value.toFixed(1)}%` : 'not available yet';
}

function formatWholePercent(value?: number): string {
  return typeof value === 'number' ? `${Math.round(value)}%` : 'not available yet';
}

function formatCurrency(value?: number): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'not available yet';
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: 0,
  }).format(value);
}

function toTitleCase(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

function matchesAny(question: string, terms: string[]): boolean {
  return terms.some(term => question.includes(term));
}

export function getAssistantHistoryStorageKey(scenarioKey: string): string {
  return `${ASSISTANT_HISTORY_PREFIX}:${scenarioKey}`;
}

export function loadAssistantHistory(scenarioKey: string): AssistantMessage[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(getAssistantHistoryStorageKey(scenarioKey));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((entry): entry is AssistantMessage => (
      entry &&
      (entry.role === 'user' || entry.role === 'assistant') &&
      typeof entry.id === 'string' &&
      typeof entry.text === 'string' &&
      typeof entry.createdAt === 'number'
    ));
  } catch {
    return [];
  }
}

export function saveAssistantHistory(scenarioKey: string, messages: AssistantMessage[]): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(getAssistantHistoryStorageKey(scenarioKey), JSON.stringify(messages));
  } catch {
    // Ignore storage quota or privacy-mode failures and keep the assistant functional.
  }
}

export function clearAssistantHistory(scenarioKey: string): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.removeItem(getAssistantHistoryStorageKey(scenarioKey));
  } catch {
    // Ignore storage failures.
  }
}

function getSectionHelp(sectionLabel: string): AssistantResponse | null {
  const guidance = SECTION_GUIDANCE[sectionLabel];
  if (!guidance) return null;

  return {
    text: guidance,
    topics: [sectionLabel, 'Usage'],
  };
}

export function getAssistantResponse(question: string, context: AssistantContext): AssistantResponse {
  const normalized = question.trim().toLowerCase();

  if (!normalized) {
    return {
      text: 'Ask me about how to use the planner, what a result means, or what your current plan is doing. I can explain tabs, assumptions, taxes, Monte Carlo, withdrawal strategy, funding, and save/load workflow.',
      topics: ['Getting started'],
    };
  }

  if (matchesAny(normalized, ['how do i use', 'how to use', 'getting started', 'where do i start', 'how does this app work'])) {
    return {
      text: `Work left to right through the tabs: Profile for your household and assumptions, Income for work and pension cash flows, Savings and Assets for account balances and allocation, Returns for market assumptions, Expenses and Healthcare for spending, Events for one-off items, Longevity for plan horizon, then Results to review taxes, withdrawals, funding, and net worth. The app recalculates a year-by-year projection and can compare withdrawal strategies.`,
      topics: ['Usage', 'Workflow'],
    };
  }

  if (matchesAny(normalized, ['current tab', 'this tab', 'this section', 'what should i enter', 'what do i do here', 'what do i put here'])) {
    return getSectionHelp(context.currentStepLabel) ?? {
      text: `You are currently on ${context.currentStepLabel}. I can explain what this section is for and what inputs matter most if you ask about that tab by name.`,
      topics: ['Usage'],
    };
  }

  if (matchesAny(normalized, ['profile tab', 'income tab', 'savings tab', 'assets tab', 'returns tab', 'expenses tab', 'healthcare tab', 'events tab', 'longevity tab', 'save/load tab', 'results tab'])) {
    const sectionLabel = Object.keys(SECTION_GUIDANCE).find(label => normalized.includes(label.toLowerCase()));
    if (sectionLabel) {
      return getSectionHelp(sectionLabel) ?? {
        text: `I can explain the ${sectionLabel} section if you want more detail about what belongs there.`,
        topics: [sectionLabel],
      };
    }
  }

  if (matchesAny(normalized, ['what is the simulator doing', 'what is this app doing', 'what does the application do', 'what does this app do'])) {
    return {
      text: `The simulator projects your plan year by year from age ${context.currentAge} toward retirement at age ${context.retirementAge} and through the end of the plan horizon. It combines income, withdrawals, taxes, benefits, expenses, and account growth to estimate net worth longevity and after-tax spending capacity. Right now you are on the ${context.currentStepLabel} section and the active return mode is ${toTitleCase(context.returnType)}.`,
      topics: ['Simulation', 'Workflow'],
    };
  }

  if (matchesAny(normalized, ['save scenario', 'save a scenario', 'load scenario', 'comparison', 'save/load'])) {
    return {
      text: `Use the Save/Load tab to load or replace scenario data, and use the Results screen button “Save for Comparison” to snapshot the current run for side-by-side chart comparison later. You currently have ${context.savedScenarioCount} saved comparison ${context.savedScenarioCount === 1 ? 'entry' : 'entries'} in this session.`,
      topics: ['Save/Load', 'Comparison'],
    };
  }

  if (matchesAny(normalized, ['couple', 'spouse', 'partner'])) {
    return {
      text: context.profileType === 'couple'
        ? `This scenario is set up as a couple plan, so the simulator can model spouse ages, spouse retirement timing, spouse CPP/OAS, spouse pension, and account ownership where relevant. Your spouse age is ${context.spouseAge ?? 'not set yet'}.`
        : 'This scenario is currently modeled as an individual plan. If you switch Profile to a couple plan, the simulator can account for spouse ages, benefits, and spouse-specific accounts or pensions.',
      topics: ['Profile', 'Household'],
    };
  }

  if (matchesAny(normalized, ['funds last', 'funding percentage', 'plan funded', 'run out', 'run out age', 'why is my funding percentage below 100'])) {
    if (!context.hasResults) {
      return {
        text: 'Funds Last and the funding percentage are only available after you run a projection. Once results exist, I can explain the age where assets last and what share of the retirement horizon remains funded.',
        topics: ['Results', 'Funding'],
      };
    }

    if (context.fundsLastAge) {
      return {
        text: `Funds Last reports the age where the deterministic projection first depletes total investable assets. In your current run, funds run out at age ${context.fundsLastAge}, which means about ${formatWholePercent(context.fundingPercent)} of the retirement horizon is funded. A value below 100% usually means planned withdrawals and expenses outpace portfolio growth and guaranteed income before the end of the plan.`,
        topics: ['Results', 'Funding'],
      };
    }

    return {
      text: `Your current deterministic plan lasts through the full modeled horizon, so the card shows Funds Last through age ${context.finalProjectionAge}+ and ${formatWholePercent(context.fundingPercent)} of the retirement horizon funded. That means the projection did not hit zero total balance before the final modeled year.`,
      topics: ['Results', 'Funding'],
    };
  }

  if (matchesAny(normalized, ['withdrawal strategy', 'what strategy am i using', 'strategy comparison', 'maximize life spending', 'tax efficient', 'maximize estate', 'rrsp meltdown', 'minimize lifetime tax'])) {
    return {
      text: `Your current withdrawal strategy is ${toTitleCase(context.withdrawalStrategy)}. This setting changes how the projection prioritizes withdrawals from registered and non-registered accounts during retirement. Use Strategy Comparison in Results to compare the tradeoff between taxes, spending, and estate outcomes under different strategies.`,
      topics: ['Withdrawals', 'Results'],
    };
  }

  if (matchesAny(normalized, ['monte carlo', 'success rate', 'linear return', 'return type', 'what does monte carlo mean'])) {
    if (context.hasMonteCarlo) {
      return {
        text: `Monte Carlo mode runs many simulated market paths instead of a single fixed return path. Your current success rate is ${formatPercent(context.monteCarloSuccessRate)} over ${context.monteCarloIterations?.toLocaleString() ?? 'multiple'} iterations. In this app, success means the plan avoids expense shortfalls and does not let total balance fall below zero.`,
        topics: ['Returns', 'Monte Carlo'],
      };
    }

    return {
      text: `You are currently using Linear returns, which means the projection applies one expected return path rather than many randomized market paths. Monte Carlo mode is the probabilistic alternative when you want a success rate and percentile bands instead of a single deterministic track.`,
      topics: ['Returns', 'Monte Carlo'],
    };
  }

  if (matchesAny(normalized, ['stale', 'bands stale', 'mc stale', 'monte carlo bands'])) {
    return {
      text: context.mcIsStale
        ? 'The Monte Carlo bands are marked stale when the deterministic plan inputs or withdrawal strategy have changed since the last simulation run. Re-run the Monte Carlo simulation to regenerate percentile bands and success rate using the current settings.'
        : 'The Monte Carlo bands are current for the latest settings. If they become stale after you change strategy or assumptions, the app will prompt you to re-run the simulation.',
      topics: ['Monte Carlo', 'Results'],
    };
  }

  if (matchesAny(normalized, ['tax', 'tax data', 'live tax', 'tax constants', 'why are live tax constants not available', 'fallback'])) {
    const liveStatusText = context.taxDataStatus === 'live'
      ? 'The app is currently using live tax data.'
      : context.taxDataStatus === 'fallback'
        ? 'The app is currently using built-in tax constants because live tax data could not be verified for this run.'
        : 'Tax data is still loading.';

    return {
      text: `${liveStatusText} The tax engine estimates federal and provincial income tax, payroll charges, benefits interactions, and retirement withdrawal taxation for the selected province ${context.province}. In your current results, projected retirement tax is about ${formatCurrency(context.totalRetirementTax)}.`,
      topics: ['Tax', 'Results'],
    };
  }

  if (matchesAny(normalized, ['verification', 'verify', 'tax verification', 'view details'])) {
    return {
      text: 'The Verification area explains the tax assumptions behind the current run and highlights whether live tax data was loaded or whether the planner fell back to built-in constants. It is meant to make the tax engine easier to audit rather than act as a full CRA filing tool.',
      topics: ['Verification', 'Tax'],
    };
  }

  if (matchesAny(normalized, ['asset allocation', 'assets', 'stocks', 'bonds', 'cash', 'real estate', 'management fee'])) {
    return {
      text: `Assets and Returns work together. Asset allocation sets the portfolio mix for each account, while Returns controls the expected return assumptions, volatility, and management fee. Your current inflation assumption is ${formatPercent(context.inflationRate)} and the selected return mode is ${toTitleCase(context.returnType)}.`,
      topics: ['Assets', 'Returns'],
    };
  }

  if (matchesAny(normalized, ['tfsa', 'reinvest', 'surplus', 'tfsa cap'])) {
    return {
      text: `The planner treats TFSAs as tax-free accounts and now directs eligible surplus cash back into available TFSA room before overflowing into non-registered accounts. You currently have ${context.tfsaAccountCount} TFSA ${context.tfsaAccountCount === 1 ? 'account' : 'accounts'} modeled. TFSA annual room is handled separately from cumulative room so planned contributions and surplus reinvestment do not overuse the annual cap.`,
      topics: ['TFSA', 'Savings'],
    };
  }

  if (matchesAny(normalized, ['rrsp', 'rrif', 'employer rrsp'])) {
    return {
      text: `RRSP accounts are tax-deferred in the planner. Contributions can be modeled as salary-deducted or after-tax contributions, and withdrawals later become taxable retirement income. You currently have ${context.rrspAccountCount} RRSP ${context.rrspAccountCount === 1 ? 'account' : 'accounts'} in the plan.`,
      topics: ['RRSP', 'Savings'],
    };
  }

  if (matchesAny(normalized, ['primary residence', 'house', 'home value', 'downsizing'])) {
    return {
      text: context.includePrimaryResidence
        ? `Your scenario includes a primary residence valued at about ${formatCurrency(context.primaryResidenceValue)}. In this app, the residence is modeled separately from non-registered savings, counted in net worth, and can interact with downsizing logic if you add that event.`
        : 'Primary residence is optional in this app. If enabled in the Profile section, it is modeled separately from non-registered savings, included in net worth, and available for residence-specific planning such as downsizing.',
      topics: ['Primary Residence', 'Profile'],
    };
  }

  if (matchesAny(normalized, ['cpp', 'oas', 'gis', 'benefits'])) {
    return {
      text: `The benefits engine estimates government retirement income such as CPP and OAS using your selected start ages and benefit amounts. Those benefits are integrated into the yearly cash-flow and tax calculation rather than being treated as separate rough estimates.`,
      topics: ['Benefits', 'Income'],
    };
  }

  if (matchesAny(normalized, ['inflation', 'cpi'])) {
    return {
      text: `Inflation affects expense growth, tax thresholds where indexed, and the real purchasing power view. Your current scenario inflation assumption is ${formatPercent(context.inflationRate)}. The planner can also show results in future dollars or today's dollars for easier interpretation.`,
      topics: ['Inflation', 'Profile'],
    };
  }

  if (matchesAny(normalized, ['expenses', 'healthcare', 'expense ladder'])) {
    return {
      text: `Expenses are modeled in phases using the Expense Ladder, and Healthcare can add age-based costs on top. Those spending assumptions feed directly into yearly cash flow and are one of the main reasons a funding percentage may fall below 100% if they rise faster than income and portfolio growth.`,
      topics: ['Expenses', 'Healthcare'],
    };
  }

  if (matchesAny(normalized, ['events', 'inheritance', 'downsizing', 'one-time event'])) {
    return {
      text: 'Events let you add one-time inflows or outflows at specific ages, including inheritances, major expenses, or downsizing. These events are applied directly in the yearly projection at the age you specify.',
      topics: ['Events', 'Planning'],
    };
  }

  if (matchesAny(normalized, ['longevity', 'life expectancy', 'plan duration'])) {
    return {
      text: `Longevity controls how long the plan is required to last. Your current plan is modeled with retirement at age ${context.retirementAge} and a plan duration of ${context.planDuration} years, so the simulator checks whether assets and income last through that horizon.`,
      topics: ['Longevity', 'Planning horizon'],
    };
  }

  if (matchesAny(normalized, ['why no results', 'no results', 'cannot see results', 'why are there no results'])) {
    return {
      text: 'Results only appear after the simulation has been run from the final step. If you have already changed inputs, re-run the simulation so the charts, taxes, and funding metrics reflect the latest assumptions.',
      topics: ['Results', 'Workflow'],
    };
  }

  if (matchesAny(normalized, ['net worth', 'final net worth', 'retirement withdrawals'])) {
    return {
      text: `Current Net Worth reflects today's modeled balances, while Final Net Worth reflects the projected ending balance at the end of the plan horizon. Your current plan shows about ${formatCurrency(context.currentNetWorth)} today and about ${formatCurrency(context.finalNetWorth)} at the end of the projection. Total retirement withdrawals are about ${formatCurrency(context.totalRetirementWithdrawals)} in the current run.`,
      topics: ['Results', 'Net Worth'],
    };
  }

  return {
    text: `I can help with how to use the planner and what your results mean, but I stay scoped to this application and its retirement model. Try asking about Funds Last, Monte Carlo, withdrawal strategy, taxes, TFSA reinvestment, primary residence, or how to save and compare scenarios.`,
    topics: ['Scope'],
  };
}