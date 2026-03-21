import { useState } from 'react';
import { ChevronDown, ChevronUp, Info, X } from 'lucide-react';
import { YearlyProjection, Scenario, IncomeSource, SavingsAccount, ExpenseLadder, OneTimeEvent } from '../types/retirement';
import { formatCurrency } from '../lib/formatters';
import { runCppOasOptimization, CppOasOptimizationRow } from '../lib/projectionEngine';
import { presentValue, GIS_MAX_SINGLE_ANNUAL_2026, GIS_MAX_COUPLE_ANNUAL_2026, GIS_CLAWBACK_RATE } from '../lib/benefitsEngine';
import {
  OAS_CLAWBACK_THRESHOLD_2026,
  OAS_CLAWBACK_RATE,
  OAS_MAX_CLAWBACK_THRESHOLD_2026,
  FEDERAL_BRACKETS_2026,
  calcTieredCapitalGainInclusion
} from '../lib/taxEngine';

interface ProjectionTableProps {
  projections: YearlyProjection[];
  scenario: Scenario;
  incomeSources: IncomeSource[];
  savingsAccounts: SavingsAccount[];
  expenseLadder: ExpenseLadder[];
  oneTimeEvents: OneTimeEvent[];
  showTodayDollars?: boolean;
  inflationRate?: number;
}

function CollapseHeader({ title, isOpen, onToggle, badge }: {
  title: string; isOpen: boolean; onToggle: () => void; badge?: string;
}) {
  return (
    <button onClick={onToggle}
      className="w-full flex items-center justify-between px-4 py-3 bg-gray-100 border border-gray-200 rounded-lg hover:bg-gray-200 transition-colors">
      <div className="flex items-center gap-3">
        <span className="font-semibold text-gray-900">{title}</span>
        {badge && <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">{badge}</span>}
      </div>
      {isOpen ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
    </button>
  );
}

function TaxInfoModal({ onClose }: { onClose: () => void }) {
  const lowestFedRate = (FEDERAL_BRACKETS_2026[0].rate * 100).toFixed(0);
  const highestFedRate = (FEDERAL_BRACKETS_2026[FEDERAL_BRACKETS_2026.length - 1].rate * 100).toFixed(0);
  const oasClawbackPct = (OAS_CLAWBACK_RATE * 100).toFixed(0);
  const oasThresholdFmt = OAS_CLAWBACK_THRESHOLD_2026.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });
  const gisClawbackPct = (GIS_CLAWBACK_RATE * 100).toFixed(0);
  const gisSingleFmt = GIS_MAX_SINGLE_ANNUAL_2026.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });
  const gisCoupleFmt = GIS_MAX_COUPLE_ANNUAL_2026.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-gray-900">How Tax is Calculated</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5 text-gray-600" /></button>
        </div>
        <div className="space-y-3 text-sm text-gray-700">
          <p><strong>Total Tax = Federal + Provincial + CPP/EI + OAS Clawback</strong></p>
          <ul className="space-y-2 list-disc pl-5">
            <li><strong>Federal Tax:</strong> 2026 federal brackets ({lowestFedRate}%–{highestFedRate}%)</li>
            <li><strong>Provincial Tax:</strong> Province-specific brackets</li>
            <li><strong>CPP Contributions:</strong> 5.95% on employment income up to YMPE</li>
            <li><strong>EI Premiums:</strong> 1.66% on employment income up to insurable earnings</li>
            <li><strong>OAS Clawback:</strong> {oasClawbackPct}% on income above {oasThresholdFmt}</li>
            <li><strong>GIS Clawback:</strong> {gisClawbackPct}% on other income (max {gisSingleFmt} single / {gisCoupleFmt} couple)</li>
          </ul>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-2">
            <p className="text-blue-800"><strong>After-Tax Income</strong> = Total Income − All Taxes + TFSA Withdrawals</p>
            <p className="text-xs text-blue-700 mt-1">TFSA withdrawals are added back — they are tax-free.</p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <p className="text-gray-700"><strong>Taxable Income</strong> = Salary + CPP + OAS + RRSP W/D + Non-Reg Capital Gain Inclusion</p>
          </div>
        </div>
      </div>
    </div>
  );
}

const ROW_HEIGHT = 40;
const VISIBLE_ROWS = 10;
const TABLE_HEIGHT = ROW_HEIGHT * VISIBLE_ROWS;

export default function ProjectionTable({
  projections, scenario, incomeSources, savingsAccounts, expenseLadder, oneTimeEvents,
  showTodayDollars = false, inflationRate = 2.5
}: ProjectionTableProps) {
  const [showMainTable, setShowMainTable] = useState(true);
  const [showIncomeTable, setShowIncomeTable] = useState(true);
  const [showGrowthTable, setShowGrowthTable] = useState(true);
  const [showOptimTable, setShowOptimTable] = useState(true);
  const [showTaxInfo, setShowTaxInfo] = useState(false);
  const [optimRows, setOptimRows] = useState<CppOasOptimizationRow[] | null>(null);
  const [isRunningOptim, setIsRunningOptim] = useState(false);

  if (!projections.length) return null;

  const pv = (amount: number, yearIndex: number) =>
    showTodayDollars ? presentValue(amount, yearIndex, inflationRate) : amount;

  const fmtPv = (amount: number, yearIndex: number) =>
    formatCurrency(pv(amount, yearIndex));

  const totalTaxPaid = projections.reduce((s, p) => s + p.total_tax, 0);
  const totalWithdrawals = projections.reduce((s, p) => s + p.total_withdrawals, 0);
  const avgTaxRate = (() => {
    const rows = projections.filter(p => {
      const t = p.salary + p.cpp + p.oas + p.rrsp_withdrawal + p.non_reg_withdrawal;
      return t > 0;
    });
    if (!rows.length) return 0;
    return rows.reduce((s, p) => {
      const t = p.salary + p.cpp + p.oas + p.rrsp_withdrawal + p.non_reg_withdrawal;
      return s + (p.total_tax / t);
    }, 0) / rows.length;
  })();

  const retirementRows = projections.filter(p => p.total_withdrawals > 0 || p.cpp > 0 || p.oas > 0);

  const runOptimization = () => {
    setIsRunningOptim(true);
    setTimeout(() => {
      const rows = runCppOasOptimization(scenario, incomeSources, savingsAccounts, expenseLadder, oneTimeEvents);
      setOptimRows(rows);
      setIsRunningOptim(false);
    }, 50);
  };

  const hasNonReg = projections.some(p => p.non_reg_withdrawal > 0 || p.non_reg_balance > 0);
  const hasFhsa = projections.some(p => p.fhsa_balance > 0);

  return (
    <div className="space-y-4">
      {showTaxInfo && <TaxInfoModal onClose={() => setShowTaxInfo(false)} />}

      <CollapseHeader title="Year-by-Year Projection" isOpen={showMainTable}
        onToggle={() => setShowMainTable(v => !v)} badge={`${projections.length} years`} />

      {showMainTable && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div style={{ height: TABLE_HEIGHT, overflowY: 'auto', overflowX: 'auto' }}>
            <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-gray-800 text-white">
                    <th className="px-3 py-2 text-left font-medium sticky left-0 bg-gray-800 z-20 whitespace-nowrap">Age</th>
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Salary</th>
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap">CPP</th>
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap">OAS</th>
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Inheritance</th>
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap">RRSP W/D</th>
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap">TFSA W/D</th>
                    {hasNonReg && <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Non-Reg W/D</th>}
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Taxable Inc.</th>
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap">
                      <button onClick={() => setShowTaxInfo(true)}
                        className="flex items-center gap-1 text-white hover:text-blue-200 whitespace-nowrap">
                        Federal Tax <Info className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Prov. Tax</th>
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap">CPP/EI/OAS</th>
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Total Tax</th>
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap">After-Tax</th>
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Expenses</th>
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Net Flow</th>
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap">RRSP Bal.</th>
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap">TFSA Bal.</th>
                    {hasFhsa && <th className="px-3 py-2 text-right font-medium whitespace-nowrap">FHSA Bal.</th>}
                    {hasNonReg && <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Non-Reg Bal.</th>}
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Net Worth</th>
                  </tr>
                </thead>
                <tbody>
                  {projections.map((row, i) => {
                    const taxableIncome = row.salary + row.cpp + row.oas + row.rrsp_withdrawal + row.non_reg_withdrawal;
                    const isRetirement = row.total_withdrawals > 0 || row.cpp > 0;
                    const yr = row.year - 1;
                    return (
                      <tr key={row.age} style={{ height: ROW_HEIGHT }}
                        className={`border-b border-gray-100 ${isRetirement
                          ? i % 2 === 0 ? 'bg-blue-50' : 'bg-blue-50/60'
                          : i % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                        } hover:bg-yellow-50 transition-colors`}>
                        <td className={`px-3 py-1.5 font-semibold sticky left-0 z-10 ${isRetirement ? 'bg-blue-50 text-blue-800' : 'bg-white text-gray-900'}`}>{row.age}</td>
                        <td className="px-3 py-1.5 text-right text-gray-700">{row.salary > 0 ? fmtPv(row.salary, yr) : '—'}</td>
                        <td className="px-3 py-1.5 text-right text-green-700">{row.cpp > 0 ? fmtPv(row.cpp, yr) : '—'}</td>
                        <td className="px-3 py-1.5 text-right text-green-700">{row.oas > 0 ? fmtPv(row.oas, yr) : '—'}</td>
                        <td className="px-3 py-1.5 text-right text-amber-700">{row.inheritance > 0 ? fmtPv(row.inheritance, yr) : '—'}</td>
                        <td className="px-3 py-1.5 text-right text-blue-700">{row.rrsp_withdrawal > 0 ? fmtPv(row.rrsp_withdrawal, yr) : '—'}</td>
                        <td className="px-3 py-1.5 text-right text-teal-700">{row.tfsa_withdrawal > 0 ? fmtPv(row.tfsa_withdrawal, yr) : '—'}</td>
                        {hasNonReg && <td className="px-3 py-1.5 text-right text-orange-700">{row.non_reg_withdrawal > 0 ? fmtPv(row.non_reg_withdrawal, yr) : '—'}</td>}
                        <td className="px-3 py-1.5 text-right font-medium text-gray-800">{fmtPv(taxableIncome, yr)}</td>
                        <td className="px-3 py-1.5 text-right text-red-600">{row.federal_tax > 0 ? fmtPv(row.federal_tax, yr) : '—'}</td>
                        <td className="px-3 py-1.5 text-right text-red-500">{row.provincial_tax > 0 ? fmtPv(row.provincial_tax, yr) : '—'}</td>
                        <td className="px-3 py-1.5 text-right text-orange-600">{row.cpp_ei_tax > 0 ? fmtPv(row.cpp_ei_tax, yr) : '—'}</td>
                        <td className="px-3 py-1.5 text-right font-semibold text-red-700">{row.total_tax > 0 ? fmtPv(row.total_tax, yr) : '—'}</td>
                        <td className="px-3 py-1.5 text-right font-medium text-gray-900">{fmtPv(row.after_tax_income, yr)}</td>
                        <td className="px-3 py-1.5 text-right text-gray-600">{fmtPv(row.total_expenses, yr)}</td>
                        <td className={`px-3 py-1.5 text-right font-medium ${row.net_cash_flow >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmtPv(row.net_cash_flow, yr)}</td>
                        <td className="px-3 py-1.5 text-right text-gray-600">{fmtPv(row.rrsp_balance, yr)}</td>
                        <td className="px-3 py-1.5 text-right text-gray-600">{fmtPv(row.tfsa_balance, yr)}</td>
                        {hasFhsa && <td className="px-3 py-1.5 text-right text-gray-600">{fmtPv(row.fhsa_balance, yr)}</td>}
                        {hasNonReg && <td className="px-3 py-1.5 text-right text-gray-600">{fmtPv(row.non_reg_balance, yr)}</td>}
                        <td className={`px-3 py-1.5 text-right font-bold ${row.total_balance < 0 ? 'text-red-700' : 'text-gray-900'}`}>{fmtPv(row.total_balance, yr)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
          </div>
        </div>
      )}

      <CollapseHeader title="Income &amp; Tax Summary" isOpen={showIncomeTable}
        onToggle={() => setShowIncomeTable(v => !v)} />

      {showIncomeTable && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-sm text-gray-600">Total Tax Paid</p>
              <p className="text-2xl font-bold text-red-600 mt-1">{formatCurrency(totalTaxPaid)}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-sm text-gray-600">Total Withdrawals</p>
              <p className="text-2xl font-bold text-blue-600 mt-1">{formatCurrency(totalWithdrawals)}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-sm text-gray-600">Avg. Effective Tax Rate</p>
              <p className="text-2xl font-bold text-orange-600 mt-1">{(avgTaxRate * 100).toFixed(1)}%</p>
            </div>
          </div>

          {retirementRows.length > 0 && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <div style={{ height: TABLE_HEIGHT, overflowY: 'auto' }}>
                  <table className="w-full text-sm border-collapse">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-gray-700 text-white">
                        <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Age</th>
                        <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Salary</th>
                        <th className="px-3 py-2 text-right font-medium whitespace-nowrap">CPP</th>
                        <th className="px-3 py-2 text-right font-medium whitespace-nowrap">OAS</th>
                        <th className="px-3 py-2 text-right font-medium whitespace-nowrap">RRSP W/D</th>
                        <th className="px-3 py-2 text-right font-medium whitespace-nowrap">TFSA W/D</th>
                        {hasNonReg && <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Non-Reg W/D</th>}
                        <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Non-Reg Taxable</th>
                        <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Total Pre-Tax</th>
                        <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Total Tax</th>
                        <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Eff. Rate</th>
                        <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Net Withdrawn</th>
                      </tr>
                    </thead>
                    <tbody>
                      {retirementRows.map((row, i) => {
                        const preTax = row.salary + row.cpp + row.oas + row.rrsp_withdrawal + row.non_reg_withdrawal;
                        const effRate = preTax > 0 ? (row.total_tax / preTax) * 100 : 0;
                        const yr = row.year - 1;
                        const nonRegGrowthRatio = (row.non_reg_balance + row.non_reg_withdrawal) > 0
                          ? Math.max(0, ((row.non_reg_balance + row.non_reg_withdrawal) - row.non_reg_acb) / (row.non_reg_balance + row.non_reg_withdrawal))
                          : 0;
                        const nonRegCapGain = row.non_reg_withdrawal * nonRegGrowthRatio;
                        const nonRegTaxable = calcTieredCapitalGainInclusion(nonRegCapGain, yr);
                        return (
                          <tr key={row.age} style={{ height: ROW_HEIGHT }}
                            className={`border-b border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50`}>
                            <td className="px-3 py-1.5 font-semibold text-gray-900">{row.age}</td>
                            <td className="px-3 py-1.5 text-right text-gray-700">{row.salary > 0 ? fmtPv(row.salary, yr) : '—'}</td>
                            <td className="px-3 py-1.5 text-right text-green-700">{row.cpp > 0 ? fmtPv(row.cpp, yr) : '—'}</td>
                            <td className="px-3 py-1.5 text-right text-green-700">{row.oas > 0 ? fmtPv(row.oas, yr) : '—'}</td>
                            <td className="px-3 py-1.5 text-right text-blue-700">{row.rrsp_withdrawal > 0 ? fmtPv(row.rrsp_withdrawal, yr) : '—'}</td>
                            <td className="px-3 py-1.5 text-right text-teal-700">{row.tfsa_withdrawal > 0 ? fmtPv(row.tfsa_withdrawal, yr) : '—'}</td>
                            {hasNonReg && <td className="px-3 py-1.5 text-right text-orange-700">{row.non_reg_withdrawal > 0 ? fmtPv(row.non_reg_withdrawal, yr) : '—'}</td>}
                            <td className="px-3 py-1.5 text-right text-gray-600">{row.non_reg_withdrawal > 0 ? fmtPv(nonRegTaxable, yr) : '—'}</td>
                            <td className="px-3 py-1.5 text-right font-medium text-gray-800">{fmtPv(preTax, yr)}</td>
                            <td className="px-3 py-1.5 text-right font-semibold text-red-600">{row.total_tax > 0 ? fmtPv(row.total_tax, yr) : '—'}</td>
                            <td className="px-3 py-1.5 text-right text-orange-600">{effRate > 0 ? `${effRate.toFixed(1)}%` : '—'}</td>
                            <td className="px-3 py-1.5 text-right font-medium text-gray-900">{fmtPv(row.after_tax_income, yr)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <CollapseHeader title="Net Account Growth" isOpen={showGrowthTable}
        onToggle={() => setShowGrowthTable(v => !v)} badge={`${projections.length} years`} />

      {showGrowthTable && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div style={{ height: TABLE_HEIGHT, overflowY: 'auto', overflowX: 'auto' }}>
            <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-gray-800 text-white">
                    <th className="px-3 py-2 text-left font-medium sticky left-0 bg-gray-800 z-20 whitespace-nowrap">Age</th>
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap">RRSP Market Return</th>
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap">TFSA Market Return</th>
                    {hasFhsa && <th className="px-3 py-2 text-right font-medium whitespace-nowrap">FHSA Market Return</th>}
                    {hasNonReg && <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Non-Reg Market Return</th>}
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap">RRSP Growth</th>
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap">TFSA Growth</th>
                    {hasFhsa && <th className="px-3 py-2 text-right font-medium whitespace-nowrap">FHSA Growth</th>}
                    {hasNonReg && <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Non-Reg Growth</th>}
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Total Growth</th>
                    <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Funds Added</th>
                  </tr>
                </thead>
                <tbody>
                  {projections.map((row, i) => {
                    const prev = i === 0 ? null : projections[i - 1];
                    const yr = row.year - 1;

                    const rrspGrowth = prev ? row.rrsp_balance - prev.rrsp_balance : 0;
                    const tfsaGrowth = prev ? row.tfsa_balance - prev.tfsa_balance : 0;
                    const fhsaGrowth = prev ? row.fhsa_balance - prev.fhsa_balance : 0;
                    const nonRegGrowth = prev ? row.non_reg_balance - prev.non_reg_balance : 0;
                    const totalGrowth = rrspGrowth + tfsaGrowth + fhsaGrowth + (hasNonReg ? nonRegGrowth : 0);

                    const fundParts: string[] = [];
                    if (row.rrsp_contribution > 0) fundParts.push(`RRSP +${formatCurrency(pv(row.rrsp_contribution, yr))}`);
                    if (row.tfsa_contribution > 0) fundParts.push(`TFSA +${formatCurrency(pv(row.tfsa_contribution, yr))}`);
                    if (row.fhsa_contribution > 0) fundParts.push(`FHSA +${formatCurrency(pv(row.fhsa_contribution, yr))}`);
                    if (row.non_reg_contribution > 0) fundParts.push(`Non-Reg +${formatCurrency(pv(row.non_reg_contribution, yr))}`);
                    if (row.non_reg_surplus > 0) fundParts.push(`Non-Reg surplus +${formatCurrency(pv(row.non_reg_surplus, yr))}`);
                    const fundsLabel = fundParts.length > 0 ? fundParts.join(' / ') : '—';

                    const isRetirement = row.total_withdrawals > 0 || row.cpp > 0;
                    const rowBg = isRetirement
                      ? i % 2 === 0 ? 'bg-blue-50' : 'bg-blue-50/60'
                      : i % 2 === 0 ? 'bg-white' : 'bg-gray-50';

                    const growthColor = (v: number) => v > 0 ? 'text-green-700' : v < 0 ? 'text-red-600' : 'text-gray-400';

                    return (
                      <tr key={row.age} style={{ height: ROW_HEIGHT }}
                        className={`border-b border-gray-100 ${rowBg} hover:bg-yellow-50 transition-colors`}>
                        <td className={`px-3 py-1.5 font-semibold sticky left-0 z-10 ${isRetirement ? 'bg-blue-50 text-blue-800' : 'bg-white text-gray-900'}`}>{row.age}</td>
                        <td className={`px-3 py-1.5 text-right font-medium ${growthColor(row.rrsp_market_return ?? 0)}`}>{(row.rrsp_market_return ?? 0) !== 0 ? fmtPv(row.rrsp_market_return ?? 0, yr) : '—'}</td>
                        <td className={`px-3 py-1.5 text-right font-medium ${growthColor(row.tfsa_market_return ?? 0)}`}>{(row.tfsa_market_return ?? 0) !== 0 ? fmtPv(row.tfsa_market_return ?? 0, yr) : '—'}</td>
                        {hasFhsa && <td className={`px-3 py-1.5 text-right font-medium ${growthColor(row.fhsa_market_return ?? 0)}`}>{(row.fhsa_market_return ?? 0) !== 0 ? fmtPv(row.fhsa_market_return ?? 0, yr) : '—'}</td>}
                        {hasNonReg && <td className={`px-3 py-1.5 text-right font-medium ${growthColor(row.non_reg_market_return ?? 0)}`}>{(row.non_reg_market_return ?? 0) !== 0 ? fmtPv(row.non_reg_market_return ?? 0, yr) : '—'}</td>}
                        <td className={`px-3 py-1.5 text-right font-medium ${growthColor(rrspGrowth)}`}>{i === 0 ? '—' : fmtPv(rrspGrowth, yr)}</td>
                        <td className={`px-3 py-1.5 text-right font-medium ${growthColor(tfsaGrowth)}`}>{i === 0 ? '—' : fmtPv(tfsaGrowth, yr)}</td>
                        {hasFhsa && <td className={`px-3 py-1.5 text-right font-medium ${growthColor(fhsaGrowth)}`}>{i === 0 ? '—' : fmtPv(fhsaGrowth, yr)}</td>}
                        {hasNonReg && <td className={`px-3 py-1.5 text-right font-medium ${growthColor(nonRegGrowth)}`}>{i === 0 ? '—' : fmtPv(nonRegGrowth, yr)}</td>}
                        <td className={`px-3 py-1.5 text-right font-bold ${growthColor(totalGrowth)}`}>{i === 0 ? '—' : fmtPv(totalGrowth, yr)}</td>
                        <td className="px-3 py-1.5 text-left text-gray-600 text-xs">{fundsLabel}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
          </div>
        </div>
      )}

      <CollapseHeader title="CPP &amp; OAS Start Age Optimization" isOpen={showOptimTable}
        onToggle={() => setShowOptimTable(v => !v)} />

      {showOptimTable && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Compare outcomes by starting CPP and OAS at different ages. Each row simulates the entire plan
            with that start age combination.
          </p>

          {!optimRows && (
            <button
              onClick={runOptimization}
              disabled={isRunningOptim}
              className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-blue-400 text-sm font-medium"
            >
              {isRunningOptim ? 'Calculating...' : 'Run CPP/OAS Optimization (11 scenarios)'}
            </button>
          )}

          {optimRows && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <div style={{ height: TABLE_HEIGHT, overflowY: 'auto' }}>
                  <table className="w-full text-sm border-collapse">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-gray-700 text-white">
                        <th className="px-4 py-2 text-left font-medium">CPP Start Age</th>
                        <th className="px-4 py-2 text-left font-medium">OAS Start Age</th>
                        <th className="px-4 py-2 text-right font-medium">Total Lifetime Withdrawals</th>
                        <th className="px-4 py-2 text-right font-medium">Total Lifetime Taxes Paid</th>
                        <th className="px-4 py-2 text-right font-medium">Final Net Worth</th>
                      </tr>
                    </thead>
                <tbody>
                  {optimRows.map((row, i) => {
                    const isCurrent = row.cpp_start_age === scenario.cpp_start_age && row.oas_start_age === scenario.oas_start_age;
                    const bestNetWorth = Math.max(...optimRows.map(r => r.final_net_worth));
                    const isHighlighted = row.final_net_worth === bestNetWorth;
                    return (
                      <tr key={i} style={{ height: ROW_HEIGHT }}
                        className={`border-b border-gray-100 ${
                          isHighlighted
                            ? 'bg-green-50 font-medium'
                            : isCurrent
                            ? 'bg-blue-50'
                            : i % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                        }`}>
                        <td className="px-4 py-2">
                          <span className="font-semibold">{row.cpp_start_age}</span>
                          {isCurrent && <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Current</span>}
                          {isHighlighted && !isCurrent && <span className="ml-2 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Best</span>}
                        </td>
                        <td className="px-4 py-2">{row.oas_start_age}</td>
                        <td className="px-4 py-2 text-right text-blue-700">{formatCurrency(row.total_withdrawals)}</td>
                        <td className="px-4 py-2 text-right text-red-600">{formatCurrency(row.total_taxes_paid)}</td>
                        <td className={`px-4 py-2 text-right font-bold ${row.final_net_worth < 0 ? 'text-red-700' : 'text-gray-900'}`}>
                          {formatCurrency(row.final_net_worth)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
