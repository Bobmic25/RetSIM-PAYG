import { X } from 'lucide-react';
import {
  Scenario,
  YearlyProjection,
} from '../types/retirement';
import {
  GIS_MAX_COUPLE_ANNUAL_2026,
  GIS_MAX_SINGLE_ANNUAL_2026,
  adjustForInflation,
  applyOAS75Bump,
  calculateCPPBenefit,
  calculateOASBenefit,
  presentValue,
} from '../lib/benefitsEngine';
import { formatCurrency } from '../lib/formatters';
import { computeTaxAudit, getTaxData } from '../lib/taxEngine';

interface VerificationTaxExplainModalProps {
  scenario: Scenario;
  projections: YearlyProjection[];
  selectedYear: YearlyProjection;
  onClose: () => void;
}

const FOREIGN_WITHHOLDING_DIVIDEND_YIELD = 0.02;
const FOREIGN_WITHHOLDING_RATE = 0.15;
const FOREIGN_WITHHOLDING_DRAG = FOREIGN_WITHHOLDING_DIVIDEND_YIELD * FOREIGN_WITHHOLDING_RATE;

function formatFactor(value: number): string {
  return `${value.toFixed(4)}x`;
}

function formatPercent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

function getBenefitBreakdown(
  scenario: Scenario,
  selectedYear: YearlyProjection,
  person: 'primary' | 'spouse'
) {
  const yearIndex = selectedYear.year - 1;
  const age = selectedYear.age;
  const spouseAge = scenario.spouse_age != null ? scenario.spouse_age + yearIndex : age;
  const isSpouse = person === 'spouse';

  const cppStartAge = isSpouse ? (scenario.spouse_cpp_start_age || 65) : scenario.cpp_start_age;
  const cppAmount65 = isSpouse ? (scenario.spouse_cpp_amount_65 || 0) : scenario.cpp_amount_65;
  const baseCpp = calculateCPPBenefit(cppAmount65 || 0, cppStartAge);
  const cpp = age >= cppStartAge ? adjustForInflation(baseCpp, yearIndex, scenario.inflation_rate) : 0;

  const oasStartAge = isSpouse ? (scenario.spouse_oas_start_age || 65) : scenario.oas_start_age;
  const oasBaseAmount = isSpouse ? (scenario.spouse_oas_amount_65 || 8505) : (scenario.oas_amount_65 || 8505);
  const baseOas = calculateOASBenefit(oasStartAge, oasBaseAmount);
  const bumpedOas = applyOAS75Bump(baseOas, isSpouse ? spouseAge : age);
  const oas = age >= oasStartAge ? adjustForInflation(bumpedOas, yearIndex, scenario.inflation_rate) : 0;

  const hasDbPension = isSpouse ? scenario.spouse_has_db_pension : scenario.has_db_pension;
  const dbPensionAmount = isSpouse ? scenario.spouse_db_pension_amount : scenario.db_pension_amount;
  const dbPensionStartAge = isSpouse
    ? (scenario.spouse_db_pension_start_age ?? scenario.retirement_age)
    : (scenario.db_pension_start_age ?? scenario.retirement_age);
  const dbPensionIndexed = isSpouse ? scenario.spouse_db_pension_indexed : scenario.db_pension_indexed;
  const dbPension = hasDbPension && dbPensionAmount && age >= dbPensionStartAge
    ? (dbPensionIndexed ? adjustForInflation(dbPensionAmount, yearIndex, scenario.inflation_rate) : dbPensionAmount)
    : 0;

  return {
    cpp,
    oas,
    dbPension,
    total: cpp + oas + dbPension,
    age: isSpouse ? spouseAge : age,
  };
}

function getStrategicComments(params: {
  scenario: Scenario;
  selectedYear: YearlyProjection;
  effectiveRate: number;
  nonRegTaxableShare: number;
  balanceTrend: number;
}) {
  const { scenario, selectedYear, effectiveRate, nonRegTaxableShare, balanceTrend } = params;
  const comments: string[] = [];

  if (scenario.withdrawal_strategy === 'rrsp_meltdown' && selectedYear.rrsp_withdrawal > 0) {
    comments.push('This year is actively using the RRSP Meltdown strategy, so the plan is intentionally accelerating registered withdrawals to reduce future registered balances and potential terminal-tax pressure. The tradeoff is higher tax today in exchange for smoother brackets later.');
  } else if (selectedYear.rrsp_withdrawal > 0) {
    comments.push('RRSP and RRIF withdrawals are contributing materially to taxable income this year. If this is not an intentional meltdown year, the main planning question is whether those withdrawals are still landing inside acceptable marginal brackets.');
  } else {
    comments.push('This year is not relying on RRSP withdrawals, which keeps ordinary taxable income lower and leaves more registered assets compounding for later years. That is tax-light today, but it can defer tax concentration into later retirement or the estate year.');
  }

  if (selectedYear.non_reg_withdrawal > 0) {
    comments.push(
      nonRegTaxableShare <= 0.2
        ? 'The non-registered withdrawal is relatively tax-efficient because only a small share of the cash flow is showing up as taxable capital gain inclusion. That usually indicates a healthy adjusted cost base relative to market value.'
        : 'The non-registered withdrawal is carrying a meaningful taxable gain component, so capital-gains realization is now part of the tax bill. Monitoring the balance between RRSP drawdown and capital-gain harvesting matters more from this age onward.'
    );
  } else {
    comments.push('The plan is not drawing from non-registered assets in this year, so capital-gains taxation is not a major driver of the result. Tax efficiency is being determined primarily by pension-style income and registered withdrawals.');
  }

  comments.push(
    balanceTrend >= 0
      ? `Net estate preservation is still intact at this age, with the projected balance holding at ${formatCurrency(selectedYear.net_estate_value ?? selectedYear.total_balance)}. That suggests the current withdrawal pace is not yet forcing a structural drawdown in legacy value.`
      : `Net estate value is starting to compress at this age, with balances moving down by ${formatCurrency(Math.abs(balanceTrend))} from the prior year. If preserving legacy is a priority, this is where withdrawal sequencing and tax rate control start to matter more.`
  );

  if (effectiveRate > 0.2) {
    comments.push('The effective tax rate is now elevated, which usually means each additional RRSP dollar is costing more than earlier in retirement. That is a sign to review whether income smoothing could be improved.');
  }

  return comments.slice(0, 3);
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <span className="text-sm text-gray-600">{label}</span>
      <span className="text-sm font-medium text-gray-900 text-right">{value}</span>
    </div>
  );
}

export default function VerificationTaxExplainModal({
  scenario,
  projections,
  selectedYear,
  onClose,
}: VerificationTaxExplainModalProps) {
  const yearIndex = selectedYear.year - 1;
  const selectedIndex = projections.findIndex(projection => projection.age === selectedYear.age && projection.year === selectedYear.year);
  const indexedProjections = selectedIndex >= 0 ? projections.slice(0, selectedIndex + 1) : [selectedYear];
  const inflationFactor = Math.pow(1 + scenario.inflation_rate / 100, selectedYear.age - scenario.current_age);
  const todayExpenses = presentValue(selectedYear.total_expenses, selectedYear.age - scenario.current_age, scenario.inflation_rate);
  const isCouple = scenario.profile_type === 'couple';
  const primaryBenefits = getBenefitBreakdown(scenario, selectedYear, 'primary');
  const spouseBenefits = isCouple ? getBenefitBreakdown(scenario, selectedYear, 'spouse') : null;
  const primarySalary = selectedYear.primary_salary ?? selectedYear.salary;
  const spouseSalary = isCouple ? Math.max(0, selectedYear.salary - primarySalary) : 0;
  const primaryRrsp = selectedYear.rrsp_withdrawal_primary ?? selectedYear.rrsp_withdrawal;
  const spouseRrsp = selectedYear.rrsp_withdrawal_spouse ?? 0;
  const primaryRrspSalaryDeduction = selectedYear.rrsp_salary_deduction_primary ?? selectedYear.rrsp_salary_deduction ?? 0;
  const spouseRrspSalaryDeduction = selectedYear.rrsp_salary_deduction_spouse ?? 0;
  const primaryCapitalGain = selectedYear.non_reg_capital_gain_inclusion_primary ?? selectedYear.non_reg_capital_gain_inclusion;
  const spouseCapitalGain = selectedYear.non_reg_capital_gain_inclusion_spouse ?? 0;
  const primaryTaxableIncome = Math.max(0, primarySalary - primaryRrspSalaryDeduction) + primaryBenefits.total + primaryRrsp + primaryCapitalGain;
  const spouseTaxableIncome = Math.max(0, spouseSalary - spouseRrspSalaryDeduction) + (spouseBenefits?.total ?? 0) + spouseRrsp + spouseCapitalGain;
  const primaryAudit = computeTaxAudit(
    primaryTaxableIncome,
    scenario.province,
    primarySalary,
    primaryBenefits.oas,
    yearIndex,
    scenario.inflation_rate,
    undefined,
    selectedYear.age,
    primaryBenefits.cpp + primaryBenefits.dbPension + primaryRrsp,
  );
  const spouseAudit = isCouple
    ? computeTaxAudit(
        spouseTaxableIncome,
        scenario.province,
        spouseSalary,
        spouseBenefits?.oas ?? 0,
        yearIndex,
        scenario.inflation_rate,
        undefined,
        spouseBenefits?.age ?? selectedYear.age,
        (spouseBenefits?.cpp ?? 0) + (spouseBenefits?.dbPension ?? 0) + spouseRrsp,
      )
    : null;

  const taxData = getTaxData(scenario.province, yearIndex, scenario.inflation_rate);
  const federalBracket1Top = taxData.federalBrackets[0]?.max ?? 0;
  const provincialBracket1Top = taxData.provincialBrackets[0]?.max ?? 0;
  const growthRatio = selectedYear.non_reg_balance > 0
    ? Math.max(0, (selectedYear.non_reg_balance - selectedYear.non_reg_acb) / selectedYear.non_reg_balance)
    : 0;
  const estimatedCapitalGain = selectedYear.non_reg_withdrawal * growthRatio;
  const baseCapitalGainInclusion = estimatedCapitalGain * 0.5;
  const actualCapitalGainInclusion = selectedYear.non_reg_capital_gain_inclusion;
  const currentYearGrowth =
    (selectedYear.rrsp_market_return ?? 0) +
    (selectedYear.tfsa_market_return ?? 0) +
    (selectedYear.fhsa_market_return ?? 0) +
    (selectedYear.non_reg_market_return ?? 0);
  const cumulativeGrowth = indexedProjections.reduce(
    (sum, projection) => sum +
      (projection.rrsp_market_return ?? 0) +
      (projection.tfsa_market_return ?? 0) +
      (projection.fhsa_market_return ?? 0) +
      (projection.non_reg_market_return ?? 0),
    0,
  );
  const gisMax = adjustForInflation(
    isCouple ? GIS_MAX_COUPLE_ANNUAL_2026 : GIS_MAX_SINGLE_ANNUAL_2026,
    yearIndex,
    scenario.inflation_rate,
  );
  const gisApplicable = selectedYear.age >= 65 && selectedYear.oas > 0;
  const gisBenefit = selectedYear.gis_benefit ?? 0;
  const gisRecovery = gisApplicable ? Math.max(0, gisMax - gisBenefit) : 0;
  const householdOasClawback = primaryAudit.oasClawback + (spouseAudit?.oasClawback ?? 0);
  const totalClawbackPressure = householdOasClawback + gisRecovery;
  const effectiveRate = selectedYear.total_tax > 0 && selectedYear.after_tax_income + selectedYear.total_tax > 0
    ? selectedYear.total_tax / (selectedYear.after_tax_income + selectedYear.total_tax)
    : 0;
  const nonRegTaxableShare = selectedYear.non_reg_withdrawal > 0
    ? actualCapitalGainInclusion / selectedYear.non_reg_withdrawal
    : 0;
  const previousYear = selectedIndex > 0 ? projections[selectedIndex - 1] : null;
  const balanceTrend = previousYear ? selectedYear.total_balance - previousYear.total_balance : 0;
  const strategicComments = getStrategicComments({
    scenario,
    selectedYear,
    effectiveRate,
    nonRegTaxableShare,
    balanceTrend,
  });
  const rrspScheduleNote = scenario.withdrawal_strategy === 'rrsp_meltdown'
    ? (selectedYear.rrsp_withdrawal > 0 ? 'Yes. RRSP Meltdown is the active withdrawal strategy and registered withdrawals are occurring in this year.' : 'Strategy is RRSP Meltdown, but this year has no RRSP withdrawal posted.')
    : `No. Current withdrawal strategy is ${scenario.withdrawal_strategy.replace(/_/g, ' ')}.`;
  const incomeSplittingText = isCouple
    ? 'The current projection taxes each spouse on their own projected income and then combines the two tax results. This panel does not apply a separate pension-income splitting override, so the household result is the sum of spouse-level tax calculations.'
    : 'Single profile. No spouse-level income splitting applies.';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="flex h-[calc(100vh-2rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Tax Calculation Explain Tip</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Verification detail for age {selectedYear.age} using indexed {taxData.year} tax data
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-200"
            aria-label="Close tax explanation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          <section className="rounded-2xl border border-gray-200">
            <div className="border-b border-gray-200 bg-gray-50 px-5 py-3">
              <h3 className="text-sm font-semibold text-gray-900">1. Household Cash Flow Status at Age {selectedYear.age}</h3>
            </div>
            <div className="space-y-2 px-5 py-4">
              <DetailRow label="Expense Target" value={`${formatCurrency(selectedYear.total_expenses)} future value, ${formatCurrency(todayExpenses)} in today's dollars`} />
              <DetailRow label="Guaranteed Income" value={`${formatCurrency(selectedYear.cpp + selectedYear.oas + selectedYear.db_pension)} total`} />
              <DetailRow label="Primary Guaranteed Income" value={formatCurrency(primaryBenefits.total)} />
              {spouseBenefits && <DetailRow label="Spouse Guaranteed Income" value={formatCurrency(spouseBenefits.total)} />}
              <DetailRow label="Salary-Funded RRSP Deduction" value={`${formatCurrency(selectedYear.rrsp_salary_deduction ?? 0)} total${selectedYear.rrsp_salary_deduction ? ' reducing taxable salary this year' : ''}`} />
              <DetailRow label="Non-Registered Withdrawal" value={formatCurrency(selectedYear.non_reg_withdrawal)} />
              <DetailRow label="RRSP / RRIF Withdrawal" value={`${formatCurrency(selectedYear.rrsp_withdrawal)}. ${rrspScheduleNote}`} />
              <DetailRow label="Non-Reg Growth Ratio" value={`${formatPercent(growthRatio, 2)} from (${formatCurrency(selectedYear.non_reg_balance)} - ${formatCurrency(selectedYear.non_reg_acb)}) / ${formatCurrency(selectedYear.non_reg_balance || 0)}`} />
              <DetailRow label="Estimated Capital Gain Math" value={`${formatCurrency(selectedYear.non_reg_withdrawal)} × ${formatPercent(growthRatio, 2)} = ${formatCurrency(estimatedCapitalGain)}`} />
              <DetailRow label="Taxable Inclusion" value={`${formatCurrency(baseCapitalGainInclusion)} at 50% base inclusion; engine used ${formatCurrency(actualCapitalGainInclusion)}`} />
              <DetailRow label="Account Growth" value={`${formatCurrency(currentYearGrowth)} this year, ${formatCurrency(cumulativeGrowth)} cumulative to this age`} />
              <DetailRow label="Tax Drag Note" value={`The return logic applies a ${(FOREIGN_WITHHOLDING_DRAG * 100).toFixed(2)}% drag on the US-equity sleeve; blended drag depends on each account's stock and US equity mix.`} />
              <DetailRow label="Government Payment" value={`${formatCurrency(selectedYear.total_tax)} total tax including federal, provincial, surtax/health premium where applicable, CPP/EI, and OAS recovery tax`} />
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200">
            <div className="border-b border-gray-200 bg-gray-50 px-5 py-3">
              <h3 className="text-sm font-semibold text-gray-900">2. Exact Tax Calculation and Indexed Brackets</h3>
            </div>
            <div className="grid gap-5 px-5 py-4 md:grid-cols-2">
              <div className="space-y-2 rounded-xl border border-gray-200 p-4">
                <DetailRow label="Tax Indexing Note" value={`${formatFactor(inflationFactor)} = (1 + ${(scenario.inflation_rate / 100).toFixed(4)})^${selectedYear.age - scenario.current_age}`} />
                <DetailRow label="Overall Household Taxable Income" value={formatCurrency(primaryTaxableIncome + spouseTaxableIncome)} />
                <DetailRow label="Income Splitting" value={incomeSplittingText} />
                <DetailRow label="Federal Bracket 1 Threshold" value={formatCurrency(federalBracket1Top)} />
                <DetailRow label="Federal Tax Total" value={formatCurrency(selectedYear.federal_tax)} />
              </div>
              <div className="space-y-2 rounded-xl border border-gray-200 p-4">
                <DetailRow label="Provincial Bracket 1 Threshold" value={formatCurrency(provincialBracket1Top)} />
                <DetailRow label="Ontario Surtax" value={scenario.province === 'ON' ? formatCurrency(primaryAudit.ontarioSurtax + (spouseAudit?.ontarioSurtax ?? 0)) : 'Not applicable outside Ontario'} />
                <DetailRow label="Ontario Health Premium per Person" value={scenario.province === 'ON'
                  ? `Primary ${formatCurrency(primaryAudit.ontarioHealthPremium)}${spouseAudit ? `; Spouse ${formatCurrency(spouseAudit.ontarioHealthPremium)}` : ''}`
                  : 'Not applicable outside Ontario'}
                />
                <DetailRow label="Final Provincial Tax" value={formatCurrency(selectedYear.provincial_tax)} />
                <DetailRow label="CPP / EI / OAS Recovery" value={formatCurrency(selectedYear.cpp_ei_tax)} />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200">
            <div className="border-b border-gray-200 bg-gray-50 px-5 py-3">
              <h3 className="text-sm font-semibold text-gray-900">3. Tax Deductions and Credits (Indexed)</h3>
            </div>
            <div className="grid gap-5 px-5 py-4 md:grid-cols-2">
              <div className="space-y-2 rounded-xl border border-gray-200 p-4">
                <DetailRow label="Federal BPA" value={`${formatCurrency(primaryAudit.federalBPA)}${spouseAudit ? ` per spouse taxable profile; spouse ${formatCurrency(spouseAudit.federalBPA)}` : ''}`} />
                <DetailRow label="Provincial BPA" value={`${formatCurrency(primaryAudit.provincialBPA)}${spouseAudit ? ` per spouse taxable profile; spouse ${formatCurrency(spouseAudit.provincialBPA)}` : ''}`} />
                <DetailRow label="Age Amount" value={`${formatCurrency(primaryAudit.ageAmount)} for primary${spouseAudit ? `; spouse ${formatCurrency(spouseAudit.ageAmount)}` : ''}`} />
              </div>
              <div className="space-y-2 rounded-xl border border-gray-200 p-4">
                <DetailRow label="Age Amount Status" value={`${primaryAudit.ageAmount > 0 ? 'Primary eligible' : 'Primary not eligible or fully phased out'}${spouseAudit ? `; ${spouseAudit.ageAmount > 0 ? 'spouse eligible' : 'spouse not eligible or fully phased out'}` : ''}`} />
                <DetailRow label="Pension Income Credit Base" value={`${formatCurrency(primaryAudit.pensionIncomeCreditBase)} for primary${spouseAudit ? `; spouse ${formatCurrency(spouseAudit.pensionIncomeCreditBase)}` : ''}`} />
                <DetailRow label="Pension Income Credit Applied" value={`${formatCurrency(primaryAudit.pensionIncomeCredit)} federal credit value for primary${spouseAudit ? `; spouse ${formatCurrency(spouseAudit.pensionIncomeCredit)}` : ''}`} />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200">
            <div className="border-b border-gray-200 bg-gray-50 px-5 py-3">
              <h3 className="text-sm font-semibold text-gray-900">4. Explanations of Clawbacks</h3>
            </div>
            <div className="space-y-2 px-5 py-4">
              <DetailRow
                label="OAS Clawback"
                value={`Primary income ${formatCurrency(primaryTaxableIncome)} versus threshold ${formatCurrency(taxData.oasClawbackThreshold)} = ${formatCurrency(primaryAudit.oasClawback)}${spouseAudit ? `; spouse income ${formatCurrency(spouseTaxableIncome)} = ${formatCurrency(spouseAudit.oasClawback)}` : ''}`}
              />
              <DetailRow
                label="GIS Clawback"
                value={!gisApplicable
                  ? 'Not applicable before OAS eligibility.'
                  : gisBenefit > 0
                    ? `Eligible. Projected GIS benefit is ${formatCurrency(gisBenefit)}, implying ${formatCurrency(gisRecovery)} of indexed entitlement was clawed back.`
                    : `Not eligible or fully clawed back at this income level. Indexed maximum GIS was ${formatCurrency(gisMax)}.`}
              />
              <DetailRow label="Total Clawback Pressure" value={`${formatCurrency(totalClawbackPressure)} = ${formatCurrency(householdOasClawback)} OAS recovery + ${formatCurrency(gisRecovery)} GIS recovery`} />
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200">
            <div className="border-b border-gray-200 bg-gray-50 px-5 py-3">
              <h3 className="text-sm font-semibold text-gray-900">5. Expert Comments</h3>
            </div>
            <div className="space-y-3 px-5 py-4">
              {strategicComments.map((comment, index) => (
                <p key={index} className="rounded-xl bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-900">
                  {comment}
                </p>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}