export function formatCurrency(value: number): string {
  return '$' + Math.round(value).toLocaleString('en-CA');
}

export function parseCurrency(value: string): number {
  const cleaned = value.replace(/[$,]/g, '');
  return parseFloat(cleaned) || 0;
}

export function useLiveCurrencyInput(
  value: number,
  onChange: (n: number) => void
) {
  const displayValue = value === 0 ? '' : formatCurrency(value);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[$,]/g, '');
    const parsed = parseFloat(raw);
    onChange(isNaN(parsed) ? 0 : parsed);
  };

  return { displayValue, handleChange };
}
