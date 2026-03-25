import React, { useState } from 'react';
import { HelpCircle, MessageSquareText, X } from 'lucide-react';
import { Province } from '../types/retirement';

interface HeaderProps {
  province: Province;
  onOpenAssistant: () => void;
}

const provinceNames: Record<string, string> = {
  ON: 'Ontario', BC: 'British Columbia', AB: 'Alberta', QC: 'Quebec',
  MB: 'Manitoba', SK: 'Saskatchewan', NS: 'Nova Scotia', NB: 'New Brunswick',
  NL: 'Newfoundland', PE: 'Prince Edward Island', NT: 'Northwest Territories',
  YT: 'Yukon', NU: 'Nunavut'
};

const SecureWealthIcon = ({ size = 24, className = "" }: { size?: number, className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M12 22C12 22 20 18 20 12V5L12 2L4 5V12C4 18 12 22 12 22Z" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <rect x="8" y="13" width="2" height="4" rx="0.5" fill="#10B981"/>
    <rect x="11" y="10" width="2" height="7" rx="0.5" fill="#059669"/>
    <rect x="14" y="8" width="2" height="9" rx="0.5" fill="#047857"/>
  </svg>
);

const Header: React.FC<HeaderProps> = ({ province, onOpenAssistant }) => {
  const [showAbout, setShowAbout] = useState(false);
  const currentMonthYear = new Intl.DateTimeFormat('en-CA', { month: 'long', year: 'numeric' }).format(new Date());

  return (
    <div className="bg-[#0f172a] border-b border-slate-800">
      {showAbout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50 rounded-t-2xl">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-blue-600" />
                <h2 className="text-lg font-bold text-gray-900">About the Simulator</h2>
              </div>
              <button
                onClick={() => setShowAbout(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-200 transition-colors text-gray-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">
              <div>
                <h3 className="text-base font-semibold text-blue-600 mb-2">Target</h3>
                <p className="text-sm text-gray-700 leading-relaxed">
                  This application provides a high-precision roadmap for Canadian retirement, modeling complexities of the tax and benefits system to transition from accumulation to efficient decumulation.
                </p>
              </div>
              
              <div>
                <h3 className="text-base font-semibold text-blue-600 mb-2">How it Works</h3>
                <p className="text-sm text-gray-700 leading-relaxed">
                  It uses three integrated engines: a <strong>Projection Engine</strong> for tax-efficient withdrawal hierarchies, a <strong>Tax Engine</strong> for province-specific (Ontario-optimized) calculations including pension splitting and capital gains rules, and a <strong>Benefits Engine</strong> for precise CPP/OAS/GIS modeling.
                </p>
              </div>
              
              <div>
                <h3 className="text-base font-semibold text-blue-600 mb-2">Usage</h3>
                <p className="text-sm text-gray-700 leading-relaxed">
                  Users input profile assumptions, income/savings, and a multi-phase "Expense Ladder" to visualize net worth longevity and minimize lifetime tax.
                </p>
              </div>
              
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <p className="text-xs text-amber-800 leading-relaxed italic">
                  <strong>Disclaimer:</strong> Although every measure has been taken to provide a comprehensive and detailed simulation, this tool is intended for informational and illustrative purposes only. It should not be considered a replacement for professional financial planning. The creator assumes no responsibility for the accuracy or completeness of the output.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
      
      <header className="max-w-6xl mx-auto py-8 px-4 md:px-8 flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-6">
          <SecureWealthIcon size={64} className="flex-shrink-0" />
          <div className="flex flex-col">
            <h1 className="text-3xl md:text-4xl font-serif font-bold tracking-tight text-white leading-none">
              Canadian Retirement Planner
            </h1>
            <p className="text-base text-slate-400 font-medium mt-2 opacity-70 italic">
              Plan your financial future
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3 text-center md:text-right border-t md:border-t-0 md:border-l border-slate-700 pt-4 md:pt-0 md:pl-10">
          <div>
            <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.25em] mb-1.5">Detailed Analysis</p>
            <p className="text-xs font-semibold text-slate-300">
              Audit Created in {provinceNames[province] || province}, Canada — {currentMonthYear}
            </p>
          </div>
          <button
            onClick={onOpenAssistant}
            className="flex-shrink-0 flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200 transition-colors hover:bg-emerald-500/20 hover:text-white"
            title="Open planning assistant"
          >
            <MessageSquareText className="w-4 h-4" />
            Ask Assistant
          </button>
          <button
            onClick={() => setShowAbout(true)}
            className="flex-shrink-0 text-slate-400 hover:text-blue-400 transition-colors p-1.5 rounded-full hover:bg-slate-800"
            title="About the simulator"
          >
            <HelpCircle className="w-5 h-5" />
          </button>
        </div>
      </header>
    </div>
  );
};

export default Header;
