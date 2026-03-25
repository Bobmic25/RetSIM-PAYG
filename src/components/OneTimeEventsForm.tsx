import { Plus, Trash2, Info } from 'lucide-react';
import { OneTimeEvent, Scenario } from '../types/retirement';
import { formatCurrency, parseCurrency } from '../lib/formatters';
import { MAX_AGE } from '../lib/ageUtils';
import { AgeInput } from './AgeInput';

interface OneTimeEventsFormProps {
  events: OneTimeEvent[];
  onChange: (events: OneTimeEvent[]) => void;
  scenario?: Scenario;
}

export default function OneTimeEventsForm({ events, onChange, scenario }: OneTimeEventsFormProps) {
  const addEvent = () => {
    onChange([
      ...events,
      {
        event_type: 'expense',
        name: '',
        age: Math.min(MAX_AGE, 65),
        amount: 0,
        tax_rate: undefined,
        expense_reduction_pct: undefined
      }
    ]);
  };

  const updateEvent = (index: number, updates: Partial<OneTimeEvent>) => {
    const updated = [...events];
    updated[index] = { ...updated[index], ...updates };
    onChange(updated);
  };

  const removeEvent = (index: number) => {
    onChange(events.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">One-Time Events</h3>
          <p className="text-sm text-gray-600">Inheritances, major purchases, one-time expenses, or downsizing events</p>
        </div>
        <button
          type="button"
          onClick={addEvent}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Event
        </button>
      </div>

      <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800">
        <Info className="w-4 h-4 mt-0.5 shrink-0 text-blue-500" />
        <span>
          <strong>Enter amounts in today's dollars.</strong> All event amounts are automatically adjusted for inflation
          {scenario ? ` (${scenario.inflation_rate}% per year)` : ''} based on the age they occur — you do not need to account for
          inflation yourself.
        </span>
      </div>

      {events.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          No one-time events added. Click "Add Event" to get started.
        </div>
      )}

      {events.map((event, index) => (
        <div key={index} className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
          <div className="flex justify-between items-start">
            <h4 className="font-medium text-gray-900">Event {index + 1}</h4>
            <button
              type="button"
              onClick={() => removeEvent(index)}
              className="text-red-600 hover:text-red-700"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Event Type</label>
              <select
                value={event.event_type}
                onChange={(e) => updateEvent(index, { event_type: e.target.value as any })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="expense">Expense</option>
                <option value="inheritance">Inheritance</option>
                <option value="downsizing">Downsizing</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                type="text"
                value={event.name}
                onChange={(e) => updateEvent(index, { name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="e.g., Buy Boat, Inheritance from Parent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Age</label>
              <AgeInput
                value={event.age}
                min={18}
                max={MAX_AGE}
                onChange={v => updateEvent(index, { age: v! })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
              <input
                type="text"
                value={event.amount ? formatCurrency(event.amount) : ''}
                onChange={(e) => updateEvent(index, { amount: parseCurrency(e.target.value) })}
                placeholder={event.event_type === 'downsizing' ? '$0 net proceeds' : '$0'}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>

            {event.event_type === 'inheritance' && (
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Expected Tax Rate (%)
                  <span className="ml-2 text-xs text-gray-500 font-normal">— estate/probate/tax implications on inherited amount</span>
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    value={event.tax_rate ?? ''}
                    onChange={(e) => updateEvent(index, { tax_rate: e.target.value === '' ? undefined : parseFloat(e.target.value) })}
                    placeholder="0"
                    min="0"
                    max="100"
                    step="1"
                    className="w-32 px-3 py-2 border border-gray-300 rounded-lg"
                  />
                  <span className="text-sm text-gray-600">%</span>
                  {event.tax_rate && event.amount > 0 && (
                    <span className="text-sm text-gray-500">
                      Net after tax: {formatCurrency(event.amount * (1 - event.tax_rate / 100))}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Leave blank if no tax applies. The net amount after tax will be added to your cash flow.
                </p>
              </div>
            )}

            {event.event_type === 'downsizing' && (
              <div className="md:col-span-2 rounded-lg border border-amber-200 bg-amber-50 p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Net Proceeds Moved to Non-Registered Assets
                    </label>
                    <p className="text-xs text-gray-500">
                      Enter the net amount released from selling part of the primary residence.
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Permanent Living Expense Reduction (%)</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        value={event.expense_reduction_pct ?? ''}
                        onChange={(e) => updateEvent(index, { expense_reduction_pct: e.target.value === '' ? undefined : parseFloat(e.target.value) })}
                        placeholder="0"
                        min="0"
                        max="100"
                        step="1"
                        className="w-32 px-3 py-2 border border-gray-300 rounded-lg"
                      />
                      <span className="text-sm text-gray-600">%</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Applied from this age onward to future living expenses.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
