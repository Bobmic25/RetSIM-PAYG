export interface LiveInflationData {
  latestRate: number;
  latestObservationDate: string;
  lastYearAverage: number;
  fifteenYearAverage: number;
  sourceUrl: string;
  fetchedAt: string;
  isLive: boolean;
  notes: string;
}

const TOTAL_CPI_SERIES = 'STATIC_TOTALCPICHANGE';
const BANK_OF_CANADA_SOURCE_URL = `https://www.bankofcanada.ca/valet/observations/${TOTAL_CPI_SERIES}/json?recent=180`;
const CACHE_KEY = 'live_inflation_data';

type RawObservation = {
  d?: string;
  [TOTAL_CPI_SERIES]?: {
    v?: string;
  };
};

function roundToSingleDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function average(entries: Array<{ value: number }>): number {
  return entries.reduce((sum, entry) => sum + entry.value, 0) / entries.length;
}

function parseLiveInflationPayload(payload: { observations?: RawObservation[] }): LiveInflationData | null {
  const rawObservations = payload.observations ?? [];
  const parsed = rawObservations
    .map(observation => {
      const value = Number(observation[TOTAL_CPI_SERIES]?.v);
      return {
        date: observation.d ?? '',
        value,
      };
    })
    .filter(entry => entry.date && Number.isFinite(entry.value));

  if (parsed.length === 0) return null;

  const latest = parsed[0];
  const fifteenYearSample = parsed.slice(0, Math.min(parsed.length, 180));
  const previousCalendarYear = new Date(latest.date).getFullYear() - 1;
  const lastYearSample = parsed.filter(entry => new Date(entry.date).getFullYear() === previousCalendarYear);

  if (fifteenYearSample.length === 0 || lastYearSample.length === 0) {
    return null;
  }

  return {
    latestRate: roundToSingleDecimal(latest.value),
    latestObservationDate: latest.date,
    lastYearAverage: roundToSingleDecimal(average(lastYearSample)),
    fifteenYearAverage: roundToSingleDecimal(average(fifteenYearSample)),
    sourceUrl: BANK_OF_CANADA_SOURCE_URL,
    fetchedAt: new Date().toISOString(),
    isLive: true,
    notes: 'Live total CPI year-over-year inflation fetched from the Bank of Canada Valet API; default uses the rolling 15-year average of available monthly observations.',
  };
}

function readCachedInflationData(): LiveInflationData | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LiveInflationData;
    if (
      !Number.isFinite(parsed.latestRate) ||
      !Number.isFinite(parsed.lastYearAverage) ||
      !Number.isFinite(parsed.fifteenYearAverage)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeCachedInflationData(data: LiveInflationData) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage failures.
  }
}

export function getCachedInflationData(): LiveInflationData | null {
  return readCachedInflationData();
}

export async function fetchLiveInflationData(): Promise<LiveInflationData | null> {
  try {
    const response = await fetch(BANK_OF_CANADA_SOURCE_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const payload = await response.json();
    const parsed = parseLiveInflationPayload(payload);
    if (!parsed) throw new Error('Invalid inflation payload');

    writeCachedInflationData(parsed);
    return parsed;
  } catch {
    const cached = readCachedInflationData();
    if (cached) {
      return {
        ...cached,
        isLive: false,
        notes: 'Cached inflation data used because the latest live lookup was unavailable at startup.',
      };
    }
    return null;
  }
}