import { Lightbulb, TrendingUp, Shield, DollarSign, X } from 'lucide-react';
import { Suggestion, ComparisonMetrics } from '../lib/suggestionEngine';
import { formatCurrency } from '../lib/formatters';

interface AISuggestionsPanelProps {
  suggestions: Suggestion[];
  activeSuggestion: Suggestion | null;
  onApplySuggestion: (suggestion: Suggestion) => void;
  onResetOptimization: () => void;
  defaultMetrics?: ComparisonMetrics;
  optimizedMetrics?: ComparisonMetrics;
}

function SuggestionCard({
  suggestion,
  isActive,
  onApply,
  defaultMetrics,
  optimizedMetrics
}: {
  suggestion: Suggestion;
  isActive: boolean;
  onApply: () => void;
  defaultMetrics?: ComparisonMetrics;
  optimizedMetrics?: ComparisonMetrics;
}) {
  const icons: Record<string, React.ComponentType<{ className?: string }>> = {
    minimal_tax: DollarSign,
    tax_meltdown: TrendingUp,
    lifestyle_upgrade: Lightbulb,
    safety_buffer_delay: Shield,
    safety_buffer_savings: Shield
  };

  const Icon = icons[suggestion.id] || Lightbulb;

  const renderMetricComparison = () => {
    if (!isActive || !defaultMetrics || !optimizedMetrics) return null;

    const metrics = [
      {
        label: 'Lifetime Taxes',
        default: defaultMetrics.lifetimeTaxes,
        optimized: optimizedMetrics.lifetimeTaxes,
        format: formatCurrency
      },
      {
        label: 'Final Net Worth',
        default: defaultMetrics.finalNetWorth,
        optimized: optimizedMetrics.finalNetWorth,
        format: formatCurrency
      },
      {
        label: 'Terminal Tax',
        default: defaultMetrics.terminalTax,
        optimized: optimizedMetrics.terminalTax,
        format: formatCurrency
      }
    ].filter(m => m.default !== m.optimized);

    if (metrics.length === 0) return null;

    return (
      <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
        <p className="text-xs font-semibold text-gray-700">Impact:</p>
        {metrics.map(metric => {
          const diff = metric.optimized - metric.default;
          const isImprovement =
            (metric.label.includes('Tax') && diff < 0) ||
            (metric.label.includes('Worth') && diff > 0);

          return (
            <div key={metric.label} className="flex justify-between text-xs">
              <span className="text-gray-600">{metric.label}:</span>
              <span className={isImprovement ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                {diff > 0 ? '+' : ''}{metric.format(diff)}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className={`border rounded-lg p-4 transition-all ${
      isActive
        ? 'border-blue-500 bg-blue-50'
        : 'border-gray-200 bg-white hover:border-blue-300 hover:shadow-md'
    }`}>
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
          isActive ? 'bg-blue-600' : 'bg-blue-100'
        }`}>
          <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-blue-600'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-gray-900 mb-1">{suggestion.title}</h4>
          <p className="text-xs text-gray-600 mb-2">{suggestion.description}</p>
          <p className="text-xs text-blue-700 font-medium">{suggestion.benefit}</p>
          {renderMetricComparison()}
          <button
            onClick={onApply}
            disabled={isActive}
            className={`mt-3 w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              isActive
                ? 'bg-blue-600 text-white cursor-default'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {isActive ? 'Applied' : 'Apply Suggestion'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AISuggestionsPanel({
  suggestions,
  activeSuggestion,
  onApplySuggestion,
  onResetOptimization,
  defaultMetrics,
  optimizedMetrics
}: AISuggestionsPanelProps) {
  if (suggestions.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Lightbulb className="w-5 h-5 text-green-600" />
          <h3 className="text-lg font-bold text-gray-900">AI Suggested Improvements</h3>
        </div>
        <div className="text-center py-8 text-gray-500">
          <Lightbulb className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="text-sm font-medium">Your plan is already well optimized!</p>
          <p className="text-xs mt-1">No major improvements detected at this time.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-bold text-gray-900">AI Suggested Improvements</h3>
        </div>
        {activeSuggestion && (
          <button
            onClick={onResetOptimization}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
            Reset to Default
          </button>
        )}
      </div>

      <p className="text-sm text-gray-600 mb-4">
        We analyzed your retirement plan and found {suggestions.length} potential optimization{suggestions.length !== 1 ? 's' : ''}.
        Click to apply and compare results.
      </p>

      <div className="space-y-3">
        {suggestions.map(suggestion => (
          <SuggestionCard
            key={suggestion.id}
            suggestion={suggestion}
            isActive={activeSuggestion?.id === suggestion.id}
            onApply={() => onApplySuggestion(suggestion)}
            defaultMetrics={defaultMetrics}
            optimizedMetrics={optimizedMetrics}
          />
        ))}
      </div>

      {activeSuggestion && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-xs text-blue-800">
            <strong>Comparison Mode Active:</strong> Charts now show both your default plan (lighter) and the optimized plan (darker) for easy comparison.
          </p>
        </div>
      )}
    </div>
  );
}
