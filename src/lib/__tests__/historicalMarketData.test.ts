import { describe, expect, it } from 'vitest';

import {
  HISTORICAL_DATA_PROVENANCE,
  HISTORICAL_MARKET_DATA,
  validateHistoricalMarketData,
} from '../data/historicalMarketData';

describe('historical market dataset', () => {
  it('is continuous and numerically valid', () => {
    expect(validateHistoricalMarketData(HISTORICAL_MARKET_DATA)).toBe(true);
    expect(HISTORICAL_MARKET_DATA[0]?.year).toBe(1925);
    expect(HISTORICAL_MARKET_DATA[HISTORICAL_MARKET_DATA.length - 1]?.year).toBeGreaterThanOrEqual(2025);
  });

  it('publishes provenance for every tracked series', () => {
    expect(HISTORICAL_DATA_PROVENANCE).toHaveLength(4);
    expect(HISTORICAL_DATA_PROVENANCE.every(entry => entry.coverage.length > 0 && entry.notes.length > 0)).toBe(true);
  });

  it('uses sourced values where coverage exists', () => {
    const year2008 = HISTORICAL_MARKET_DATA.find(entry => entry.year === 2008);
    const year1995 = HISTORICAL_MARKET_DATA.find(entry => entry.year === 1995);

    expect(year2008).toBeDefined();
    expect(year1995).toBeDefined();
    expect(year2008!.sp500_return).toBeLessThan(-30);
    expect(year2008!.tsx_return).toBeLessThan(-30);
    expect(year1995!.canada_cpi).toBeGreaterThan(1);
    expect(year1995!.canada_cpi).toBeLessThan(3);
  });
});