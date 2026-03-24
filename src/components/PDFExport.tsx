import { FileText } from 'lucide-react';
import { YearlyProjection, Scenario, IncomeSource, SavingsAccount, ExpenseLadder, MonteCarloResult } from '../types/retirement';
import { formatCurrency } from '../lib/formatters';
import { presentValue } from '../lib/benefitsEngine';

interface PDFExportProps {
  projections: YearlyProjection[];
  scenario: Scenario;
  monteCarloResult?: MonteCarloResult;
  incomeSources: IncomeSource[];
  savingsAccounts: SavingsAccount[];
  expenseLadder: ExpenseLadder[];
  inflationRate: number;
}

export default function PDFExport({
  projections,
  scenario,
  monteCarloResult,
  incomeSources,
  savingsAccounts,
  expenseLadder,
  inflationRate,
}: PDFExportProps) {
  const handleExport = () => {
    if (!projections || projections.length === 0) return;
    const lastYear = projections[projections.length - 1];
    const runOutAge = projections.find(p => p.total_balance <= 0)?.age;
    const firstRetirementYear = projections.find(p => p.total_withdrawals > 0 || p.cpp > 0);
    const successRate = monteCarloResult ? `${monteCarloResult.success_rate.toFixed(1)}%` : 'N/A';
    const spouseRetirementAge = scenario.spouse_retirement_age ?? scenario.retirement_age;
    const pv = (amount: number, yearIndex: number) => presentValue(amount, yearIndex, inflationRate);
    const lastNetWorthPV = pv(lastYear.total_balance, lastYear.year - 1);
    const totalTaxPV = projections.reduce((s, p) => s + pv(p.total_tax, p.year - 1), 0);

    const tableRows = projections
      .filter((_, i) => i % 3 === 0 || i === projections.length - 1)
      .map(p => `
        <tr style="border-bottom:1px solid #e5e7eb">
          <td style="padding:4px 6px">${p.age}</td>
          <td style="padding:4px 6px;text-align:right">${formatCurrency(pv(p.salary, p.year - 1))}</td>
          <td style="padding:4px 6px;text-align:right">${formatCurrency(pv(p.cpp + p.oas, p.year - 1))}</td>
          <td style="padding:4px 6px;text-align:right">${formatCurrency(pv(p.rrsp_withdrawal + p.tfsa_withdrawal + p.non_reg_withdrawal, p.year - 1))}</td>
          <td style="padding:4px 6px;text-align:right">${formatCurrency(pv(p.total_tax, p.year - 1))}</td>
          <td style="padding:4px 6px;text-align:right">${formatCurrency(pv(p.total_expenses, p.year - 1))}</td>
          <td style="padding:4px 6px;text-align:right">${formatCurrency(pv(p.total_balance, p.year - 1))}</td>
        </tr>`).join('');

    const expenseRows = expenseLadder.map(e => `
      <tr style="border-bottom:1px solid #e5e7eb">
        <td style="padding:4px 6px">Age ${e.start_age}–${e.end_age}</td>
        <td style="padding:4px 6px;text-align:right">${formatCurrency(e.living_expenses)}</td>
        <td style="padding:4px 6px;text-align:right">${formatCurrency(e.travel_expenses)}</td>
        <td style="padding:4px 6px;text-align:right">${formatCurrency(e.other_expenses)}</td>
        <td style="padding:4px 6px;text-align:right">${formatCurrency(e.living_expenses + e.travel_expenses + e.other_expenses)}</td>
      </tr>`).join('');

    const incomeRows = incomeSources.map(s => `
      <tr style="border-bottom:1px solid #e5e7eb">
        <td style="padding:4px 6px">${s.name}</td>
        <td style="padding:4px 6px">${s.source_type}</td>
        <td style="padding:4px 6px">${s.person}</td>
        <td style="padding:4px 6px;text-align:right">${formatCurrency(s.amount)}</td>
        <td style="padding:4px 6px">Age ${s.start_age}${s.end_age ? `–${s.end_age}` : '+'}</td>
      </tr>`).join('');

    const accountRows = savingsAccounts.map(a => `
      <tr style="border-bottom:1px solid #e5e7eb">
        <td style="padding:4px 6px">${a.account_type.toUpperCase()}</td>
        <td style="padding:4px 6px">${a.person}</td>
        <td style="padding:4px 6px;text-align:right">${formatCurrency(a.current_balance)}</td>
        <td style="padding:4px 6px;text-align:right">${formatCurrency(a.monthly_contribution * 12)}/yr</td>
        <td style="padding:4px 6px">Until age ${a.contribution_end_age}</td>
      </tr>`).join('');

    const chartData = projections.map(p => ({
      age: p.age,
      balance: Math.round(pv(p.total_balance, p.year - 1)),
      rrsp: Math.round(pv(p.rrsp_balance, p.year - 1)),
      tfsa: Math.round(pv(p.tfsa_balance, p.year - 1)),
      nonReg: Math.round(pv(p.non_reg_balance, p.year - 1)),
      income: Math.round(pv(p.after_tax_income, p.year - 1)),
      expenses: Math.round(pv(p.total_expenses, p.year - 1)),
      tax: Math.round(pv(p.total_tax, p.year - 1)),
    }));

    const maxBalance = Math.max(...chartData.map(d => d.balance), 1);
    const maxIncome = Math.max(...chartData.map(d => Math.max(d.income, d.expenses)), 1);
    const maxTax = Math.max(...chartData.map(d => d.tax), 1);

    const chartWidth = 740;
    const chartHeight = 160;
    const padLeft = 70;
    const padRight = 10;
    const padTop = 10;
    const padBottom = 30;
    const innerW = chartWidth - padLeft - padRight;
    const innerH = chartHeight - padTop - padBottom;

    function toX(i: number, total: number): number {
      return padLeft + (i / Math.max(total - 1, 1)) * innerW;
    }
    function toY(val: number, max: number): number {
      return padTop + innerH - (val / max) * innerH;
    }
    function makePath(values: number[], max: number): string {
      return chartData.map((_, i) => `${i === 0 ? 'M' : 'L'}${toX(i, chartData.length).toFixed(1)},${toY(values[i], max).toFixed(1)}`).join(' ');
    }
    function yAxisLabels(max: number): string {
      return [0, 0.25, 0.5, 0.75, 1.0].map(f => {
        const val = f * max;
        const y = toY(val, max);
        const label = val >= 1000000 ? `$${(val / 1000000).toFixed(1)}M` : val >= 1000 ? `$${Math.round(val / 1000)}k` : `$${Math.round(val)}`;
        return `<text x="${padLeft - 4}" y="${(y + padTop).toFixed(1)}" text-anchor="end" font-size="9" fill="#6b7280">${label}</text>
                <line x1="${padLeft}" y1="${(y + padTop).toFixed(1)}" x2="${(padLeft + innerW).toFixed(1)}" y2="${(y + padTop).toFixed(1)}" stroke="#f3f4f6" stroke-width="1"/>`;
      }).join('');
    }
    function xAxisLabels(): string {
      const step = Math.max(1, Math.floor(chartData.length / 8));
      return chartData.filter((_, i) => i % step === 0 || i === chartData.length - 1).map(d => {
        const i = chartData.indexOf(d);
        return `<text x="${toX(i, chartData.length).toFixed(1)}" y="${(padTop + innerH + padBottom - 4).toFixed(1)}" text-anchor="middle" font-size="9" fill="#6b7280">${d.age}</text>`;
      }).join('');
    }

    const netWorthSvg = `<svg width="${chartWidth}" height="${chartHeight}" xmlns="http://www.w3.org/2000/svg">
      ${yAxisLabels(maxBalance)}
      ${xAxisLabels()}
      <path d="${makePath(chartData.map(d => d.rrsp), maxBalance)}" fill="none" stroke="#2563eb" stroke-width="1.5"/>
      <path d="${makePath(chartData.map(d => d.tfsa), maxBalance)}" fill="none" stroke="#16a34a" stroke-width="1.5"/>
      <path d="${makePath(chartData.map(d => d.nonReg), maxBalance)}" fill="none" stroke="#d97706" stroke-width="1.5"/>
      <path d="${makePath(chartData.map(d => d.balance), maxBalance)}" fill="none" stroke="#111827" stroke-width="2.5"/>
      <text x="${padLeft + 4}" y="${padTop + 14}" font-size="9" fill="#2563eb">RRSP</text>
      <text x="${padLeft + 36}" y="${padTop + 14}" font-size="9" fill="#16a34a">TFSA</text>
      <text x="${padLeft + 64}" y="${padTop + 14}" font-size="9" fill="#d97706">Non-Reg</text>
      <text x="${padLeft + 106}" y="${padTop + 14}" font-size="9" fill="#111827" font-weight="bold">Total</text>
    </svg>`;

    const cashFlowSvg = `<svg width="${chartWidth}" height="${chartHeight}" xmlns="http://www.w3.org/2000/svg">
      ${yAxisLabels(maxIncome)}
      ${xAxisLabels()}
      <path d="${makePath(chartData.map(d => d.income), maxIncome)}" fill="none" stroke="#2563eb" stroke-width="2"/>
      <path d="${makePath(chartData.map(d => d.expenses), maxIncome)}" fill="none" stroke="#ef4444" stroke-width="2" stroke-dasharray="5,3"/>
      <text x="${padLeft + 4}" y="${padTop + 14}" font-size="9" fill="#2563eb">After-Tax Income</text>
      <text x="${padLeft + 100}" y="${padTop + 14}" font-size="9" fill="#ef4444">Expenses</text>
    </svg>`;

    const taxSvg = `<svg width="${chartWidth}" height="${chartHeight}" xmlns="http://www.w3.org/2000/svg">
      ${yAxisLabels(maxTax)}
      ${xAxisLabels()}
      <path d="${makePath(chartData.map(d => d.tax), maxTax)}" fill="none" stroke="#f59e0b" stroke-width="2"/>
      <text x="${padLeft + 4}" y="${padTop + 14}" font-size="9" fill="#f59e0b">Annual Tax (Today's $)</text>
    </svg>`;
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Retirement Statement of Advice – ${scenario.name}</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 11px; color: #111; margin: 0; padding: 20px; }
    h1 { font-size: 20px; color: #1e3a5f; margin-bottom: 4px; }
    h2 { font-size: 14px; color: #1e3a5f; margin-top: 20px; margin-bottom: 6px; border-bottom: 2px solid #1e3a5f; padding-bottom: 3px; }
    h3 { font-size: 12px; color: #374151; margin-top: 14px; margin-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; }
    th { background: #1e3a5f; color: white; padding: 5px 6px; text-align: left; }
    th[align=right], td[style*="right"] { text-align: right; }
    .metric-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 10px 0; }
    .metric { background: #f3f4f6; border-radius: 6px; padding: 8px 12px; }
    .metric-label { font-size: 9px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; }
    .metric-value { font-size: 16px; font-weight: bold; color: #1e3a5f; }
    .disclosure { background: #fef3c7; border: 1px solid #d97706; border-radius: 6px; padding: 10px 14px; font-size: 10px; color: #78350f; margin-top: 20px; }
    .chart-box { border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px; margin: 10px 0; background: #fff; }
    .chart-title { font-size: 11px; font-weight: bold; color: #374151; margin-bottom: 6px; }
    .page-break { page-break-before: always; }
    @media print { body { margin: 0; } .page-break { page-break-before: always; } }
  </style>
</head>
<body>
  <h1>Retirement Statement of Advice</h1>
  <p style="color:#6b7280;margin-bottom:4px">Prepared for: <strong>${scenario.name}</strong> &nbsp;|&nbsp; Generated: ${new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
  <p style="color:#6b7280;margin-bottom:16px">Province: <strong>${scenario.province}</strong> &nbsp;|&nbsp; Profile: <strong>${scenario.profile_type}</strong> &nbsp;|&nbsp; Withdrawal Strategy: <strong>${scenario.withdrawal_strategy.replace(/_/g,' ')}</strong></p>

  <h2>1. Plan Summary</h2>
  <div class="metric-grid">
    <div class="metric">
      <div class="metric-label">Final Net Worth (Today's $)</div>
      <div class="metric-value">${formatCurrency(lastNetWorthPV)}</div>
      <div style="font-size:9px;color:#6b7280">At age ${lastYear.age}</div>
    </div>
    <div class="metric">
      <div class="metric-label">Total Tax Paid (Today's $)</div>
      <div class="metric-value">${formatCurrency(totalTaxPV)}</div>
    </div>
    <div class="metric">
      <div class="metric-label">${runOutAge ? 'Funds Run Out' : 'Funds Last'}</div>
      <div class="metric-value">${runOutAge ? `Age ${runOutAge}` : `Age ${lastYear.age}+`}</div>
    </div>
    <div class="metric">
      <div class="metric-label">Current Age / Retirement Age</div>
      <div class="metric-value">${scenario.current_age} / ${scenario.retirement_age}${scenario.profile_type === 'couple' ? ` / spouse ${spouseRetirementAge}` : ''}</div>
    </div>
    <div class="metric">
      <div class="metric-label">Plan Duration</div>
      <div class="metric-value">${scenario.plan_duration} years</div>
    </div>
    <div class="metric">
      <div class="metric-label">First Retirement Income (Today's $)</div>
      <div class="metric-value">${firstRetirementYear ? formatCurrency(pv(firstRetirementYear.after_tax_income, firstRetirementYear.year - 1)) : '—'}</div>
    </div>
    <div class="metric">
      <div class="metric-label">Success Rate</div>
      <div class="metric-value">${successRate}</div>
    </div>
  </div>

  <h2>2. Input Assumptions</h2>
  <h3>Profile</h3>
  <table>
    <tr><th>Parameter</th><th>Value</th></tr>
    <tr><td style="padding:4px 6px">Current Age</td><td style="padding:4px 6px">${scenario.current_age}</td></tr>
    <tr><td style="padding:4px 6px">Retirement Age</td><td style="padding:4px 6px">${scenario.retirement_age}${scenario.profile_type === 'couple' ? ` (spouse ${spouseRetirementAge})` : ''}</td></tr>
    <tr><td style="padding:4px 6px">Plan Duration</td><td style="padding:4px 6px">${scenario.plan_duration} years (to age ${scenario.current_age + (scenario.retirement_age - scenario.current_age) + scenario.plan_duration})</td></tr>
    <tr><td style="padding:4px 6px">Expected Return</td><td style="padding:4px 6px">${scenario.expected_return}% (${scenario.return_type})</td></tr>
    <tr><td style="padding:4px 6px">Inflation Rate</td><td style="padding:4px 6px">${scenario.inflation_rate}%</td></tr>
    <tr><td style="padding:4px 6px">CPP Start Age</td><td style="padding:4px 6px">${scenario.cpp_start_age}</td></tr>
    <tr><td style="padding:4px 6px">CPP Amount at 65</td><td style="padding:4px 6px">${formatCurrency(scenario.cpp_amount_65)}/yr</td></tr>
    <tr><td style="padding:4px 6px">OAS Start Age</td><td style="padding:4px 6px">${scenario.oas_start_age}</td></tr>
  </table>

  ${incomeSources.length > 0 ? `
  <h3>Income Sources</h3>
  <table>
    <tr><th>Name</th><th>Type</th><th>Person</th><th>Amount</th><th>Period</th></tr>
    ${incomeRows}
  </table>` : ''}

  ${savingsAccounts.length > 0 ? `
  <h3>Savings Accounts</h3>
  <table>
    <tr><th>Account</th><th>Person</th><th>Balance</th><th>Annual Contribution</th><th>Until</th></tr>
    ${accountRows}
  </table>` : ''}

  ${expenseLadder.length > 0 ? `
  <h3>Expense Ladder</h3>
  <table>
    <tr><th>Period</th><th>Living</th><th>Travel</th><th>Other</th><th>Total/yr</th></tr>
    ${expenseRows}
  </table>` : ''}

  <div class="page-break"></div>

  <h2>3. Portfolio Charts (Today's Dollars)</h2>

  <div class="chart-box">
    <div class="chart-title">Net Worth Overview</div>
    ${netWorthSvg}
  </div>

  <div class="chart-box">
    <div class="chart-title">Cash Flow – After-Tax Income vs Expenses</div>
    ${cashFlowSvg}
  </div>

  <div class="chart-box">
    <div class="chart-title">Annual Tax</div>
    ${taxSvg}
  </div>

  <h2>4. Annual Projection Summary (Today's Dollars, every 3rd year)</h2>
  <table>
    <tr>
      <th>Age</th>
      <th style="text-align:right">Employment Income</th>
      <th style="text-align:right">CPP + OAS</th>
      <th style="text-align:right">Withdrawals</th>
      <th style="text-align:right">Tax</th>
      <th style="text-align:right">Expenses</th>
      <th style="text-align:right">Net Worth</th>
    </tr>
    ${tableRows}
  </table>

  <div class="disclosure">
    <strong>Disclosure – Basis of Taxation Logic</strong><br><br>
    This projection uses 2026 Canadian federal and provincial tax brackets indexed for inflation. The following rules are applied:<br><br>
    <strong>Capital Gains (2024 Rules):</strong> Capital gains realized by individuals are subject to a 50% inclusion rate on the first $250,000 of net capital gains per year. Gains above $250,000 are subject to a 2/3 (66.7%) inclusion rate, as per the 2024 Federal Budget amendments to the Income Tax Act. This threshold is indexed for inflation in future projection years.<br><br>
    <strong>Eligible Dividends:</strong> Canadian eligible dividends are grossed up by 38% and eligible for the federal Enhanced Dividend Tax Credit. Provincial dividend tax credits are applied at province-specific rates.<br><br>
    <strong>OAS Clawback:</strong> Old Age Security is clawed back at 15 cents per dollar of net income above the annual threshold (approx. $95,323 in 2026), fully recovered at approximately $155,396.<br><br>
    <strong>GIS:</strong> Guaranteed Income Supplement eligibility is based on net income excluding OAS, including RRIF/RRSP withdrawals and taxable capital gains.<br><br>
    <strong>Pension Income Splitting:</strong> Where applicable, up to 50% of eligible pension income may be split between spouses to minimize combined household tax. The optimal split fraction is computed using 1% increments.<br><br>
    <strong>Disclaimer:</strong> This is a planning tool only. Actual results will differ due to market performance, legislative changes, and individual circumstances. This document does not constitute financial, legal, or tax advice. Consult a qualified financial advisor.
  </div>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  return (
    <button
      onClick={handleExport}
      className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm"
    >
      <FileText className="w-4 h-4" />
      Export to PDF
    </button>
  );
}
