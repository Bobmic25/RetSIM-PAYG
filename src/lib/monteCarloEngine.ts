const CORRELATION_SP500_TSX = 0.75;
const CORRELATION_SP500_EAFE = 0.78;
const CORRELATION_TSX_EAFE = 0.68;
const USD_CAD_VOLATILITY = 0.07;
const INTL_CAD_VOLATILITY = 0.06;
const STUDENT_T_DEGREES_OF_FREEDOM = 5;

function studentTSample(df: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2.0 * Math.PI * u2);

  let chiSq = 0;
  for (let i = 0; i < df; i++) {
    const u3 = Math.random();
    const u4 = Math.random();
    const zi = Math.sqrt(-2.0 * Math.log(Math.max(u3, 1e-10))) * Math.cos(2.0 * Math.PI * u4);
    chiSq += zi * zi;
  }

  return z / Math.sqrt(chiSq / df);
}

function choleskyCorrelatedSamples(correlation: number): [number, number] {
  const z1 = studentTSample(STUDENT_T_DEGREES_OF_FREEDOM);
  const z2 = studentTSample(STUDENT_T_DEGREES_OF_FREEDOM);
  const x1 = z1;
  const x2 = correlation * z1 + Math.sqrt(1 - correlation * correlation) * z2;
  return [x1, x2];
}

export function generateNormalReturn(mean: number, stdDev: number): number {
  const z = studentTSample(STUDENT_T_DEGREES_OF_FREEDOM);
  return mean + stdDev * z;
}

export interface GeographicReturnParams {
  meanReturn: number;
  stdDev: number;
  usWeight: number;
  cadWeight: number;
  intWeight: number;
}

function choleskyThreeFactorSamples(): [number, number, number] {
  const z1 = studentTSample(STUDENT_T_DEGREES_OF_FREEDOM);
  const z2 = studentTSample(STUDENT_T_DEGREES_OF_FREEDOM);
  const z3 = studentTSample(STUDENT_T_DEGREES_OF_FREEDOM);

  const l11 = 1;
  const l21 = CORRELATION_SP500_TSX;
  const l22 = Math.sqrt(1 - l21 * l21);
  const l31 = CORRELATION_SP500_EAFE;
  const l32 = (CORRELATION_TSX_EAFE - l31 * l21) / l22;
  const l33 = Math.sqrt(Math.max(1e-9, 1 - l31 * l31 - l32 * l32));

  const x1 = l11 * z1;
  const x2 = l21 * z1 + l22 * z2;
  const x3 = l31 * z1 + l32 * z2 + l33 * z3;
  return [x1, x2, x3];
}

export function generateCorrelatedReturnSequence(
  years: number,
  params: GeographicReturnParams
): number[] {
  const { meanReturn, stdDev, usWeight, cadWeight, intWeight } = params;
  const sp500Mean = meanReturn;
  const sp500StdDev = stdDev;
  const tsxMean = meanReturn * 0.9;
  const tsxStdDev = stdDev * 1.05;
  const eafeMean = meanReturn * 0.95;
  const eafeStdDev = stdDev * 1.02;
  const nonEquityWeight = Math.max(0, 1 - usWeight - cadWeight - intWeight);
  const returns: number[] = [];

  for (let i = 0; i < years; i++) {
    const [z_us, z_cad, z_int] = choleskyThreeFactorSamples();
    const sp500Return = sp500Mean + sp500StdDev * z_us;
    const currencyShock = studentTSample(STUDENT_T_DEGREES_OF_FREEDOM);
    const currencyEffect = USD_CAD_VOLATILITY * currencyShock;
    const usdReturnInCAD = sp500Return + currencyEffect;
    const tsxReturn = tsxMean + tsxStdDev * z_cad;
    const intlCurrencyShock = studentTSample(STUDENT_T_DEGREES_OF_FREEDOM);
    const intlCurrencyEffect = INTL_CAD_VOLATILITY * intlCurrencyShock;
    const eafeReturn = eafeMean + eafeStdDev * z_int + intlCurrencyEffect;
    const nonEquityReturn = meanReturn * 0.4 + (stdDev * 0.2) * studentTSample(STUDENT_T_DEGREES_OF_FREEDOM);
    const portfolioReturn =
      usWeight * usdReturnInCAD +
      cadWeight * tsxReturn +
      intWeight * eafeReturn +
      nonEquityWeight * nonEquityReturn;
    returns.push(portfolioReturn);
  }

  return returns;
}

export function generateReturnSequence(
  years: number,
  meanReturn: number,
  stdDev: number,
  usWeight?: number,
  cadWeight?: number,
  intWeight?: number
): number[] {
  if (usWeight !== undefined && cadWeight !== undefined && (usWeight + cadWeight) > 0) {
    return generateCorrelatedReturnSequence(years, {
      meanReturn,
      stdDev,
      usWeight,
      cadWeight,
      intWeight: intWeight ?? Math.max(0, 1 - usWeight - cadWeight),
    });
  }

  const returns: number[] = [];
  for (let i = 0; i < years; i++) {
    returns.push(generateNormalReturn(meanReturn, stdDev));
  }
  return returns;
}

export function generateStochasticInflationSequence(
  years: number,
  baseMeanInflation: number,
  inflationVolatility: number = 1.5
): number[] {
  const inflations: number[] = [];
  let currentInflation = baseMeanInflation;

  for (let i = 0; i < years; i++) {
    const shock = studentTSample(STUDENT_T_DEGREES_OF_FREEDOM) * inflationVolatility;
    currentInflation = baseMeanInflation * 0.7 + currentInflation * 0.3 + shock * 0.3;
    currentInflation = Math.max(-2, Math.min(15, currentInflation));
    inflations.push(currentInflation);
  }

  return inflations;
}

export function sortProjectionsByFinalBalance<T extends { total_balance: number }>(
  projections: T[][]
): T[][] {
  return projections.sort((a, b) => {
    const aFinal = a[a.length - 1]?.total_balance || 0;
    const bFinal = b[b.length - 1]?.total_balance || 0;
    return aFinal - bFinal;
  });
}

export function getPercentile<T>(sortedArray: T[], percentile: number): T {
  const index = Math.floor((sortedArray.length - 1) * percentile);
  return sortedArray[index];
}

export function calculateSuccessRate<T extends { total_balance: number; expense_shortfall?: number }>(
  projections: T[][]
): number {
  const successful = projections.filter(projection => {
    return projection.every(year => year.total_balance >= -0.01 && (year.expense_shortfall ?? 0) <= 0.01);
  });
  return (successful.length / projections.length) * 100;
}

export const MONTE_CARLO_MAX_ITERATIONS = 5000;
export const MONTE_CARLO_DEFAULT_ITERATIONS = 1000;
const BATCH_SIZE = 20;

export function runMonteCarloAsync<T extends { total_balance: number }>(
  iterations: number,
  runOne: () => T[],
  onProgress?: (completed: number, total: number) => void
): Promise<T[][]> {
  const safeIterations = Math.min(iterations, MONTE_CARLO_MAX_ITERATIONS);
  const allProjections: T[][] = [];

  return new Promise((resolve) => {
    let completed = 0;

    function runBatch() {
      const batchEnd = Math.min(completed + BATCH_SIZE, safeIterations);
      while (completed < batchEnd) {
        allProjections.push(runOne());
        completed++;
      }

      onProgress?.(completed, safeIterations);

      if (completed < safeIterations) {
        setTimeout(runBatch, 0);
      } else {
        resolve(allProjections);
      }
    }

    setTimeout(runBatch, 0);
  });
}

export interface FinalBalanceRecord {
  final_balance: number;
  index: number;
}

export function runMonteCarloMemoryEfficient<T extends { total_balance: number; expense_shortfall?: number }>(
  iterations: number,
  runOne: () => T[],
  onProgress?: (completed: number, total: number) => void
): Promise<{ percentile10: T[]; percentile50: T[]; percentile90: T[]; successRate: number; totalIterations: number }> {
  const safeIterations = Math.min(iterations, MONTE_CARLO_MAX_ITERATIONS);

  return new Promise((resolve) => {
    let completed = 0;
    const finalBalances: number[] = [];
    const allProjections: T[][] = [];

    function runBatch() {
      const batchEnd = Math.min(completed + BATCH_SIZE, safeIterations);
      while (completed < batchEnd) {
        const proj = runOne();
        allProjections.push(proj);
        finalBalances.push(proj[proj.length - 1]?.total_balance ?? 0);
        completed++;
      }

      onProgress?.(completed, safeIterations);

      if (completed < safeIterations) {
        setTimeout(runBatch, 0);
      } else {
        const indices = finalBalances
          .map((b, i) => ({ b, i }))
          .sort((a, c) => a.b - c.b)
          .map(x => x.i);

        const idx10 = indices[Math.floor((indices.length - 1) * 0.1)];
        const idx50 = indices[Math.floor((indices.length - 1) * 0.5)];
        const idx90 = indices[Math.floor((indices.length - 1) * 0.9)];

        const successful = allProjections.filter(p => p.every(y => y.total_balance >= -0.01 && (y.expense_shortfall ?? 0) <= 0.01)).length;
        const successRate = (successful / allProjections.length) * 100;

        resolve({
          percentile10: allProjections[idx10],
          percentile50: allProjections[idx50],
          percentile90: allProjections[idx90],
          successRate,
          totalIterations: allProjections.length
        });
      }
    }

    setTimeout(runBatch, 0);
  });
}
