import { describe, expect, it } from "vitest";
import {
  applyInboundInventoryValuation,
  applyOutboundInventoryValuation,
  applyPurchaseReturnInventoryValuation,
  assertApproverSeparation,
  assertBalancedJournal,
  assertBaseAmountRepresentable,
  assertDocumentSubmitter,
  canManagerApproveOwnDocument,
  buildStockTransferEffects,
  calculateBaseAmount,
  calculateDocumentTotals,
  calculateFinancialStatements,
  calculateStraightLineDepreciation,
  exceedsDiscountLimit,
  normalizeExchangeRatePpm,
  normalizeMarketExchangeRate,
} from "./accountingRules";

describe("accounting rules", () => {
  it("accepts a balanced double-entry journal", () => {
    expect(() =>
      assertBalancedJournal([
        {
          debitMinor: 100_000,
          creditMinor: 0,
          baseDebitMinor: 100_000,
          baseCreditMinor: 0,
        },
        {
          debitMinor: 0,
          creditMinor: 100_000,
          baseDebitMinor: 0,
          baseCreditMinor: 100_000,
        },
      ])
    ).not.toThrow();
  });

  it("rejects an unbalanced journal", () => {
    expect(() =>
      assertBalancedJournal([
        {
          debitMinor: 100,
          creditMinor: 0,
          baseDebitMinor: 100,
          baseCreditMinor: 0,
        },
        {
          debitMinor: 0,
          creditMinor: 90,
          baseDebitMinor: 0,
          baseCreditMinor: 90,
        },
      ])
    ).toThrow("غير متوازن");
  });

  it("calculates base currency and discount controls deterministically", () => {
    expect(calculateBaseAmount(100_00, 1_250_000)).toBe(125_00);
    expect(calculateBaseAmount(100, 1_000_000)).toBe(100);
    expect(calculateBaseAmount(1_300, 76_923)).toBe(100);
    expect(
      calculateDocumentTotals([
        { quantity: 2, unitPriceMinor: 50_000, discountMinor: 5_000 },
      ])
    ).toEqual({
      subtotalMinor: 100_000,
      discountMinor: 5_000,
      taxMinor: 0,
      totalMinor: 95_000,
    });
    expect(
      calculateDocumentTotals(
        [{ quantity: 1, unitPriceMinor: 10_005, discountMinor: 5 }],
        1_000
      )
    ).toEqual({
      subtotalMinor: 10_005,
      discountMinor: 5,
      taxMinor: 1_000,
      totalMinor: 11_000,
    });
    expect(exceedsDiscountLimit(100_000, 6_000, 500)).toBe(true);
  });

  it("normalizes USD documents and rejects a rate that rounds a foreign amount to zero USD", () => {
    expect(normalizeExchangeRatePpm("USD", 1_570)).toBe(1_000_000);
    expect(normalizeExchangeRatePpm("IQD", 63_694)).toBe(63_694);
    expect(() => assertBaseAmountRepresentable(140, 1_570)).toThrow(
      "سعر الصرف منخفض جداً"
    );
    expect(() => assertBaseAmountRepresentable(140, 1_000_000)).not.toThrow();
    expect(normalizeMarketExchangeRate("USD", 1570)).toEqual({
      marketExchangeRate: 1,
      exchangeRatePpm: 1_000_000,
    });
    expect(normalizeMarketExchangeRate("IQD", 1570)).toEqual({
      marketExchangeRate: 1570,
      exchangeRatePpm: 63_694,
    });
    expect(() => normalizeMarketExchangeRate("IQD")).toThrow(
      "سعر السوق الحقيقي"
    );
  });

  it("requires a different user to approve a document", () => {
    expect(
      calculateStraightLineDepreciation({
        acquisitionMinor: 12_100,
        salvageMinor: 100,
        usefulLifeMonths: 12,
        accumulatedDepreciationMinor: 0,
      })
    ).toEqual({ monthlyMinor: 1_000, remainingMinor: 12_000 });
    expect(
      calculateStraightLineDepreciation({
        acquisitionMinor: 12_100,
        salvageMinor: 100,
        usefulLifeMonths: 12,
        accumulatedDepreciationMinor: 11_500,
      })
    ).toEqual({ monthlyMinor: 500, remainingMinor: 500 });
    expect(() =>
      calculateStraightLineDepreciation({
        acquisitionMinor: 100,
        salvageMinor: 100,
        usefulLifeMonths: 12,
        accumulatedDepreciationMinor: 0,
      })
    ).toThrow("غير صالحة");
    expect(() => assertApproverSeparation(7, 7)).toThrow("منشئ المستند");
    expect(() => assertApproverSeparation(7, 8)).not.toThrow();
  });

  it("allows only the document creator to submit it for approval", () => {
    expect(() => assertDocumentSubmitter(7, 8)).toThrow("إرساله للموافقة");
    expect(() => assertDocumentSubmitter(7, 7)).not.toThrow();
  });

  it("allows self-approval only when manager and invoice-approval permissions coexist", () => {
    expect(canManagerApproveOwnDocument(["accountant"], ["documents.approve"])).toBe(false);
    expect(canManagerApproveOwnDocument([], ["accounting.manage", "documents.approve"])).toBe(true);
    expect(canManagerApproveOwnDocument(["finance_manager"], [])).toBe(true);
  });

  it("plans paired warehouse movements without changing the company-wide quantity", () => {
    const effects = buildStockTransferEffects({
      sourceWarehouseId: 3,
      destinationWarehouseId: 8,
      lines: [
        { variantId: 14, quantity: 3 },
        { variantId: 15, quantity: 2 },
      ],
    });
    expect(effects.warehouseDeltas).toEqual([
      { warehouseId: 3, variantId: 14, quantityChange: -3 },
      { warehouseId: 8, variantId: 14, quantityChange: 3 },
      { warehouseId: 3, variantId: 15, quantityChange: -2 },
      { warehouseId: 8, variantId: 15, quantityChange: 2 },
    ]);
    expect(effects.movements).toEqual([
      { variantId: 14, type: "out", quantity: 3 },
      { variantId: 14, type: "in", quantity: 3 },
      { variantId: 15, type: "out", quantity: 2 },
      { variantId: 15, type: "in", quantity: 2 },
    ]);
    expect(effects.companyQuantityDelta).toBe(0);
  });

  it("rejects an incomplete stock transfer before applying warehouse changes", () => {
    expect(() =>
      buildStockTransferEffects({
        sourceWarehouseId: 3,
        destinationWarehouseId: 3,
        lines: [{ variantId: 14, quantity: 1 }],
      })
    ).toThrow("غير صالحة");
    expect(() =>
      buildStockTransferEffects({
        sourceWarehouseId: 3,
        destinationWarehouseId: 8,
        lines: [{ variantId: null, quantity: 1 }],
      })
    ).toThrow("صنف مخزني");
  });

  it("maintains weighted-average inventory value and derives cost of goods sold", () => {
    expect(
      applyInboundInventoryValuation({
        currentQuantity: 10,
        currentValueUsdMinor: 1_000,
        incomingQuantity: 5,
        incomingValueUsdMinor: 750,
      })
    ).toEqual({ quantity: 15, valueUsdMinor: 1_750, averageCostUsdMinor: 117 });
    expect(
      applyOutboundInventoryValuation({
        currentQuantity: 15,
        currentValueUsdMinor: 1_750,
        averageCostUsdMinor: 117,
        outgoingQuantity: 3,
      })
    ).toEqual({
      quantity: 12,
      valueUsdMinor: 1_399,
      averageCostUsdMinor: 117,
      costOfGoodsSoldUsdMinor: 351,
    });
    expect(() =>
      applyOutboundInventoryValuation({
        currentQuantity: 2,
        currentValueUsdMinor: 200,
        averageCostUsdMinor: 100,
        outgoingQuantity: 3,
      })
    ).toThrow("غير كافٍ");
  });

  it("reverses a purchase return at its historical USD value instead of the current average", () => {
    expect(
      applyPurchaseReturnInventoryValuation({
        currentQuantity: 12,
        currentValueUsdMinor: 1_500,
        returnedQuantity: 3,
        historicalReturnValueUsdMinor: 360,
      })
    ).toEqual({
      quantity: 9,
      valueUsdMinor: 1_140,
      averageCostUsdMinor: 127,
      historicalReturnValueUsdMinor: 360,
    });
    expect(() =>
      applyPurchaseReturnInventoryValuation({
        currentQuantity: 2,
        currentValueUsdMinor: 200,
        returnedQuantity: 3,
        historicalReturnValueUsdMinor: 150,
      })
    ).toThrow("غير كافٍ");
    expect(() =>
      applyPurchaseReturnInventoryValuation({
        currentQuantity: 3,
        currentValueUsdMinor: 200,
        returnedQuantity: 2,
        historicalReturnValueUsdMinor: 250,
      })
    ).toThrow("قيمة المخزون");
  });

  it("includes current-period profit in a balanced USD balance sheet", () => {
    const statements = calculateFinancialStatements([
      { type: "asset", debitMinor: 1_000, creditMinor: 0 },
      { type: "revenue", debitMinor: 0, creditMinor: 1_000 },
    ]);
    expect(statements.incomeStatement).toEqual({
      revenue: 1_000,
      expenses: 0,
      netProfit: 1_000,
    });
    expect(statements.balanceSheet).toEqual({
      assets: 1_000,
      liabilities: 0,
      equity: 0,
      currentPeriodEarnings: 1_000,
      liabilitiesAndEquity: 1_000,
    });
  });
});
