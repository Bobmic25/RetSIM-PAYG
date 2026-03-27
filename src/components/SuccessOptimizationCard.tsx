import { AlertTriangle, Loader2, ShieldCheck } from 'lucide-react';
import type { RetirementSuccessOptimizationResult } from '../lib/successOptimization';

interface SuccessOptimizationCardProps {
  optimization: RetirementSuccessOptimizationResult | null;
  shouldOfferOptimization: boolean;
  hasRequestedOptimization: boolean;
  isLoading: boolean;
  isApplying: boolean;
  isUndoing: boolean;
  hasAppliedOptimization: boolean;
  onAnalyze?: () => void;
  onApply?: () => void;
  onUndo?: () => void;
}

export default function SuccessOptimizationCard({
  optimization,
  shouldOfferOptimization,
  hasRequestedOptimization,
  isLoading,
  isApplying,
  isUndoing,
  hasAppliedOptimization,
  onAnalyze,
  onApply,
  onUndo,
}: SuccessOptimizationCardProps) {
  if (!isLoading && !optimization && !shouldOfferOptimization) {
    return null;
  }

  const deltaPreview = optimization ? JSON.stringify(optimization.delta, null, 2) : '';

  return (
    <div className="rounded-xl border border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 p-5 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex gap-3">
          <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500 text-white">
            {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <AlertTriangle className="h-5 w-5" />}
          </div>
          <div className="space-y-2">
            <div>
              <h3 className="text-lg font-bold text-gray-900">
                {optimization?.headline ?? 'Optimization Available: Secure Your Plan.'}
              </h3>
              <p className="mt-1 text-sm text-gray-700">
                {isLoading
                  ? 'Analyzing sequence-of-returns risk and testing a survival-path adjustment against Monte Carlo outcomes.'
                  : optimization?.body ?? 'This Monte Carlo result is weak enough to qualify for a survival-path analysis. Run the optimizer only when you want to test a spending-adjustment path.'}
              </p>
            </div>

            {optimization && !isLoading && (
              <div className="flex flex-wrap gap-2 text-xs font-medium">
                <span className="rounded-full bg-white px-3 py-1 text-gray-700 ring-1 ring-amber-200">
                  Baseline {optimization.baselineSuccessRate.toFixed(1)}%
                </span>
                <span className="rounded-full bg-white px-3 py-1 text-gray-700 ring-1 ring-amber-200">
                  Optimized {optimization.optimizedSuccessRate.toFixed(1)}%
                </span>
                <span className={`rounded-full px-3 py-1 ring-1 ${optimization.targetAchieved ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-white text-gray-700 ring-amber-200'}`}>
                  {optimization.targetAchieved ? '90% target achieved' : 'Best available path found'}
                </span>
                {optimization.worstCasePassesToLifeExpectancy && (
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700 ring-1 ring-emerald-200">
                    <ShieldCheck className="mr-1 inline h-3.5 w-3.5" />
                    10th percentile lasts to life expectancy
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 md:min-w-44">
          {!optimization && !isLoading && shouldOfferOptimization && onAnalyze && (
            <button
              type="button"
              onClick={onAnalyze}
              disabled={hasRequestedOptimization}
              className="inline-flex items-center justify-center rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-amber-300"
            >
              {hasRequestedOptimization ? 'Analysis Requested' : 'Analyze Optimization'}
            </button>
          )}
          {optimization && (
            <button
              type="button"
              onClick={onApply}
              disabled={isLoading || isApplying || isUndoing}
              className="inline-flex items-center justify-center rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-amber-300"
            >
              {isApplying ? 'Applying...' : optimization.buttonLabel}
            </button>
          )}
          {hasAppliedOptimization && onUndo && (
            <button
              type="button"
              onClick={onUndo}
              disabled={isLoading || isApplying || isUndoing}
              className="inline-flex items-center justify-center rounded-lg border border-amber-300 bg-white px-4 py-2.5 text-sm font-semibold text-amber-800 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:border-amber-200 disabled:text-amber-300"
            >
              {isUndoing ? 'Undoing...' : 'Undo Optimization'}
            </button>
          )}
        </div>
      </div>

      {optimization && !isLoading && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-white/80 p-4">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold text-gray-900">JSON Delta Preview</h4>
            <span className="text-xs font-medium text-gray-500">Applied to expense ladder and one-time events on confirm</span>
          </div>
          <pre className="mt-3 max-h-72 overflow-auto rounded-lg bg-gray-950 p-4 text-xs leading-5 text-amber-100">{deltaPreview}</pre>
        </div>
      )}

      {hasAppliedOptimization && (
        <p className="mt-3 text-xs text-amber-900">
          The current plan includes an applied optimization snapshot. Undo restores the prior expense ladder and one-time events, then re-runs the simulation.
        </p>
      )}
    </div>
  );
}