import { X, ExternalLink } from 'lucide-react';
import { TaxAudit } from '../lib/taxEngine';
import { formatCurrency } from '../lib/formatters';

interface TaxInfoModalProps {
  audit: TaxAudit;
  province: string;
  onClose: () => void;
}

export default function TaxInfoModal({ audit, province, onClose }: TaxInfoModalProps) {
  const data = audit.appliedData;

  const federalLowestRate = data.federalBrackets[0]?.rate ?? 0.14;
  const provLowestRate = data.provincialBrackets[0]?.rate ?? 0.10;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">

        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50 rounded-t-2xl">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Taxation Details</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {data.year} tax data — indexed from 2026 base using scenario inflation rate
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-200 transition-colors text-gray-500"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-blue-900 mb-2">Logic Confirmation — How Your Tax Was Calculated</h3>
            <p className="text-sm text-blue-800 leading-relaxed">
              {audit.grossIncome > 0 ? (() => {
                const parts: string[] = [];
                let prev = 0;
                for (const b of audit.federalBrackets) {
                  const amount = Math.min(audit.grossIncome, b.to === Infinity ? audit.grossIncome : b.to) - prev;
                  if (amount <= 0) break;
                  parts.push(`the ${prev === 0 ? 'first' : 'next'} ${formatCurrency(amount)} at ${(b.rate * 100).toFixed(1)}%`);
                  prev = b.to === Infinity ? audit.grossIncome : b.to;
                }
                return `Your ${formatCurrency(audit.grossIncome)} gross income is taxed federally as: ${parts.join(', ')}. ` +
                  `The gross federal tax of ${formatCurrency(audit.federalGrossTax)} is reduced by a Basic Personal Amount credit of ` +
                  `${formatCurrency(audit.federalBPACredit)} (${formatCurrency(audit.federalBPA)} BPA × ${(federalLowestRate * 100).toFixed(0)}%), ` +
                  `giving net federal tax of ${formatCurrency(audit.federalNetTax)}. ` +
                  `Provincial tax similarly nets to ${formatCurrency(audit.provincialNetTax)}.`;
              })() : 'Enter income data to see a tax calculation breakdown.'}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                Federal Tax Brackets ({data.year})
              </h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="text-left px-3 py-2 rounded-tl-lg text-gray-600 font-medium">Bracket</th>
                    <th className="text-right px-3 py-2 text-gray-600 font-medium">Rate</th>
                    <th className="text-right px-3 py-2 rounded-tr-lg text-gray-600 font-medium">Tax</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.federalBrackets.length > 0 ? audit.federalBrackets.map((b, i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-3 py-2 text-gray-700">{b.label}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{(b.rate * 100).toFixed(2)}%</td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900">{formatCurrency(b.taxInBracket)}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan={3} className="px-3 py-2 text-gray-400 text-center">No taxable income</td></tr>
                  )}
                  <tr className="bg-blue-50 font-semibold">
                    <td className="px-3 py-2 text-blue-900" colSpan={2}>Gross Federal Tax</td>
                    <td className="px-3 py-2 text-right text-blue-900">{formatCurrency(audit.federalGrossTax)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-teal-500 inline-block" />
                {province} Provincial Brackets ({data.year})
              </h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="text-left px-3 py-2 rounded-tl-lg text-gray-600 font-medium">Bracket</th>
                    <th className="text-right px-3 py-2 text-gray-600 font-medium">Rate</th>
                    <th className="text-right px-3 py-2 rounded-tr-lg text-gray-600 font-medium">Tax</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.provincialBrackets.length > 0 ? audit.provincialBrackets.map((b, i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-3 py-2 text-gray-700">{b.label}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{(b.rate * 100).toFixed(2)}%</td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900">{formatCurrency(b.taxInBracket)}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan={3} className="px-3 py-2 text-gray-400 text-center">No taxable income</td></tr>
                  )}
                  <tr className="bg-teal-50 font-semibold">
                    <td className="px-3 py-2 text-teal-900" colSpan={2}>Gross Provincial Tax</td>
                    <td className="px-3 py-2 text-right text-teal-900">{formatCurrency(audit.provincialGrossTax)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-800">Non-Refundable Credits Applied</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Credits reduce gross tax directly — more valuable than deductions
              </p>
            </div>
            <div className="divide-y divide-gray-100">
              <div className="px-4 py-3 flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium text-gray-800">Federal Basic Personal Amount (BPA)</p>
                  <p className="text-xs text-gray-500">
                    {formatCurrency(audit.federalBPA)} × {(federalLowestRate * 100).toFixed(0)}% lowest rate
                    {audit.grossIncome > data.federalBPAPhaseOutStart && (
                      <span className="text-amber-600"> — reduced due to income phase-out</span>
                    )}
                  </p>
                </div>
                <span className="text-sm font-semibold text-green-700">−{formatCurrency(audit.federalBPACredit)}</span>
              </div>
              <div className="px-4 py-3 flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium text-gray-800">Provincial BPA ({province})</p>
                  <p className="text-xs text-gray-500">
                    {formatCurrency(audit.provincialBPA)} × {(provLowestRate * 100).toFixed(2)}% lowest provincial rate
                  </p>
                </div>
                <span className="text-sm font-semibold text-green-700">−{formatCurrency(audit.provincialBPACredit)}</span>
              </div>
            </div>
          </div>

          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-800">Full Tax Summary</h3>
            </div>
            <div className="divide-y divide-gray-100">
              {[
                { label: 'Gross Federal Tax', value: audit.federalGrossTax, indent: false },
                { label: 'Less: Federal BPA Credit', value: -audit.federalBPACredit, indent: true },
                { label: 'Net Federal Tax', value: audit.federalNetTax, indent: false, bold: true },
                { label: 'Gross Provincial Tax', value: audit.provincialGrossTax, indent: false },
                { label: 'Less: Provincial BPA Credit', value: -audit.provincialBPACredit, indent: true },
                { label: 'Net Provincial Tax', value: audit.provincialNetTax, indent: false, bold: true },
                { label: 'CPP Contributions', value: audit.cppContribution, indent: false },
                { label: 'EI Premiums', value: audit.eiContribution, indent: false },
                { label: 'OAS Clawback (Recovery Tax)', value: audit.oasClawback, indent: false },
              ].map((row, i) => (
                <div key={i} className={`px-4 py-2.5 flex justify-between items-center ${row.bold ? 'bg-gray-50' : ''}`}>
                  <span className={`text-sm ${row.indent ? 'pl-4 text-gray-500' : row.bold ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                    {row.label}
                  </span>
                  <span className={`text-sm ${row.value < 0 ? 'text-green-700 font-medium' : row.bold ? 'font-bold text-gray-900' : 'text-gray-800'}`}>
                    {row.value < 0 ? `−${formatCurrency(-row.value)}` : formatCurrency(row.value)}
                  </span>
                </div>
              ))}
              <div className="px-4 py-3 flex justify-between items-center bg-red-50">
                <span className="text-sm font-bold text-red-900">Total Tax Payable</span>
                <span className="text-sm font-bold text-red-900">{formatCurrency(audit.totalTax)}</span>
              </div>
              <div className="px-4 py-2.5 flex justify-between items-center">
                <span className="text-sm text-gray-600">Effective Tax Rate</span>
                <span className="text-sm font-semibold text-gray-900">{(audit.effectiveRate * 100).toFixed(1)}%</span>
              </div>
            </div>
          </div>

          <div className={`border rounded-xl p-4 ${data.isLive ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
            <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
              Data Source
              {data.isLive && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium border border-green-200">
                  Live — from database
                </span>
              )}
              {!data.isLive && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium border border-amber-200">
                  Built-in fallback
                </span>
              )}
            </h3>
            <div className="space-y-1.5">
              <div className="flex items-start gap-2">
                <span className="text-xs text-gray-500 w-28 shrink-0">Source:</span>
                <a
                  href={data.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 underline break-all"
                >
                  Canada Revenue Agency — Tax Rates
                  <ExternalLink className="w-3 h-3 shrink-0" />
                </a>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-28 shrink-0">Base Year:</span>
                <span className="text-xs text-gray-700">{data.isLive ? `${data.year - (data.year - 2026)} CRA verified rates` : '2026 CRA announced federal rates (Budget 2024/2025)'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-28 shrink-0">Last Updated:</span>
                <span className="text-xs text-gray-700">
                  {data.fetchedAt
                    ? new Date(data.fetchedAt).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })
                    : data.lastUpdated}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-28 shrink-0">Indexing:</span>
                <span className="text-xs text-gray-700">Brackets and BPA auto-indexed at your scenario's inflation rate for year {data.year}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-28 shrink-0">Note:</span>
                <span className="text-xs text-gray-600">Surtaxes (ON, PEI), AMT, and Quebec abatement not included. For detailed planning, consult a CPA.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
