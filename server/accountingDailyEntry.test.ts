import { describe, expect, it } from "vitest";
import {
  assertBalancedJournal,
  calculateBaseAmount,
  normalizeMarketExchangeRate,
} from "./accountingRules";

describe("daily accounting entry rules", () => {
  it("keeps the visible IQD market rate while converting to USD minor units", () => {
    const rate = normalizeMarketExchangeRate("IQD", 1570);
    expect(rate.marketExchangeRate).toBe(1570);
    expect(rate.exchangeRatePpm).toBe(63_694);
    expect(calculateBaseAmount(15_000, rate.exchangeRatePpm)).toBe(955);
  });

  it("accepts a balanced dual-entry voucher and rejects mismatched base totals", () => {
    expect(() =>
      assertBalancedJournal([
        {
          debitMinor: 15_000,
          creditMinor: 0,
          baseDebitMinor: 955,
          baseCreditMinor: 0,
        },
        {
          debitMinor: 0,
          creditMinor: 15_000,
          baseDebitMinor: 0,
          baseCreditMinor: 955,
        },
      ])
    ).not.toThrow();
    expect(() =>
      assertBalancedJournal([
        {
          debitMinor: 15_000,
          creditMinor: 0,
          baseDebitMinor: 955,
          baseCreditMinor: 0,
        },
        {
          debitMinor: 0,
          creditMinor: 15_000,
          baseDebitMinor: 0,
          baseCreditMinor: 954,
        },
      ])
    ).toThrow("القيد غير متوازن");
  });
});
