export type JournalLineInput = {
  debitMinor: number;
  creditMinor: number;
  baseDebitMinor: number;
  baseCreditMinor: number;
};

export const BASE_CURRENCY_CODE = "USD";
export const BASE_CURRENCY_EXCHANGE_RATE_PPM = 1_000_000;

export function normalizeMarketExchangeRate(
  currencyCode: string,
  marketExchangeRate?: number
) {
  if (currencyCode === BASE_CURRENCY_CODE)
    return {
      marketExchangeRate: 1,
      exchangeRatePpm: BASE_CURRENCY_EXCHANGE_RATE_PPM,
    };
  if (
    typeof marketExchangeRate !== "number" ||
    !Number.isFinite(marketExchangeRate) ||
    marketExchangeRate <= 0
  )
    throw new Error(
      "أدخل سعر السوق الحقيقي للعملة، مثل عدد الدينار مقابل دولار واحد"
    );
  const rate = marketExchangeRate;
  return {
    marketExchangeRate: rate,
    exchangeRatePpm: Math.max(
      1,
      // IQD is stored in whole dinars while USD is stored in cents.
      // Therefore the conversion factor includes the 100 cents per USD.
      Math.round((BASE_CURRENCY_EXCHANGE_RATE_PPM * 100) / rate)
    ),
  };
}

export function normalizeExchangeRatePpm(
  currencyCode: string,
  exchangeRatePpm: number
) {
  if (currencyCode === BASE_CURRENCY_CODE)
    return BASE_CURRENCY_EXCHANGE_RATE_PPM;
  if (!Number.isInteger(exchangeRatePpm) || exchangeRatePpm <= 0)
    throw new Error("سعر الصرف يجب أن يكون رقماً صحيحاً موجباً");
  return exchangeRatePpm;
}

export function assertBaseAmountRepresentable(
  amountMinor: number,
  exchangeRatePpm: number
) {
  if (
    amountMinor > 0 &&
    calculateBaseAmount(amountMinor, exchangeRatePpm) <= 0
  ) {
    throw new Error(
      "سعر الصرف منخفض جداً لتحويل قيمة المستند إلى الدولار؛ أدخل سعر التحويل إلى USD × 1,000,000"
    );
  }
}

export function assertBalancedJournal(lines: JournalLineInput[]) {
  if (lines.length < 2) throw new Error("القيد المحاسبي يحتاج سطرين على الأقل");
  const debit = lines.reduce((total, line) => total + line.baseDebitMinor, 0);
  const credit = lines.reduce((total, line) => total + line.baseCreditMinor, 0);
  if (debit <= 0 || debit !== credit)
    throw new Error("القيد غير متوازن في العملة الأساس");
  for (const line of lines) {
    if (
      line.debitMinor < 0 ||
      line.creditMinor < 0 ||
      line.baseDebitMinor < 0 ||
      line.baseCreditMinor < 0
    ) {
      throw new Error("قيم القيد لا يمكن أن تكون سالبة");
    }
    if (
      (line.debitMinor > 0 && line.creditMinor > 0) ||
      (line.baseDebitMinor > 0 && line.baseCreditMinor > 0)
    ) {
      throw new Error("لا يجوز وضع مدين ودائن في السطر نفسه");
    }
  }
}

export function calculateBaseAmount(
  amountMinor: number,
  exchangeRatePpm: number
) {
  if (!Number.isInteger(amountMinor) || amountMinor < 0)
    throw new Error("قيمة العملة غير صحيحة");
  if (!Number.isInteger(exchangeRatePpm) || exchangeRatePpm <= 0)
    throw new Error("سعر الصرف غير صحيح");
  return Math.round((amountMinor * exchangeRatePpm) / 1_000_000);
}

export function calculateStraightLineDepreciation(input: {
  acquisitionMinor: number;
  salvageMinor: number;
  usefulLifeMonths: number;
  accumulatedDepreciationMinor: number;
}) {
  const {
    acquisitionMinor,
    salvageMinor,
    usefulLifeMonths,
    accumulatedDepreciationMinor,
  } = input;
  if (
    ![
      acquisitionMinor,
      salvageMinor,
      usefulLifeMonths,
      accumulatedDepreciationMinor,
    ].every(Number.isInteger) ||
    acquisitionMinor <= 0 ||
    salvageMinor < 0 ||
    salvageMinor >= acquisitionMinor ||
    usefulLifeMonths <= 0 ||
    accumulatedDepreciationMinor < 0
  )
    throw new Error("بيانات إهلاك الأصل غير صالحة");
  const depreciableMinor = acquisitionMinor - salvageMinor;
  const remainingMinor = Math.max(
    0,
    depreciableMinor - accumulatedDepreciationMinor
  );
  return {
    monthlyMinor: Math.min(
      remainingMinor,
      Math.round(depreciableMinor / usefulLifeMonths)
    ),
    remainingMinor,
  };
}

export function calculateDocumentTotals(
  lines: Array<{
    quantity: number;
    unitPriceMinor: number;
    discountMinor?: number;
  }>,
  taxRateBps = 0
) {
  if (!lines.length) throw new Error("المستند يحتاج بنداً واحداً على الأقل");
  if (!Number.isInteger(taxRateBps) || taxRateBps < 0 || taxRateBps > 10_000)
    throw new Error("معدل الضريبة غير صحيح");
  const totals = lines.reduce(
    (totals, line) => {
      if (
        !Number.isInteger(line.quantity) ||
        line.quantity <= 0 ||
        !Number.isInteger(line.unitPriceMinor) ||
        line.unitPriceMinor < 0
      ) {
        throw new Error("كمية أو سعر أحد البنود غير صحيح");
      }
      const gross = line.quantity * line.unitPriceMinor;
      const discount = line.discountMinor ?? 0;
      if (!Number.isInteger(discount) || discount < 0 || discount > gross)
        throw new Error("خصم أحد البنود غير صحيح");
      totals.subtotalMinor += gross;
      totals.discountMinor += discount;
      totals.totalMinor += gross - discount;
      return totals;
    },
    { subtotalMinor: 0, discountMinor: 0, totalMinor: 0 }
  );
  const taxMinor = Math.round((totals.totalMinor * taxRateBps) / 10_000);
  return { ...totals, taxMinor, totalMinor: totals.totalMinor + taxMinor };
}

export function exceedsDiscountLimit(
  subtotalMinor: number,
  discountMinor: number,
  maxDiscountBps: number
) {
  if (subtotalMinor <= 0) return discountMinor > 0;
  return discountMinor * 10_000 > subtotalMinor * maxDiscountBps;
}

export function assertApproverSeparation(
  createdBy: number,
  approverId: number
) {
  if (createdBy === approverId)
    throw new Error("لا يمكن لمنشئ المستند اعتماده أو ترحيله بنفسه");
}

export function canManagerApproveOwnDocument(
  roles: string[],
  permissions: string[]
) {
  const isManager =
    roles.some(role => ["system_admin", "finance_manager"].includes(role)) ||
    permissions.includes("*") ||
    permissions.includes("accounting.manage");
  const canApproveDocuments =
    roles.some(role => ["system_admin", "finance_manager"].includes(role)) ||
    permissions.includes("*") ||
    permissions.includes("documents.approve");
  return isManager && canApproveDocuments;
}

export function assertDocumentSubmitter(
  createdBy: number,
  submitterId: number
) {
  if (createdBy !== submitterId)
    throw new Error("لا يمكن إلا لمنشئ المستند إرساله للموافقة");
}

export function buildStockTransferEffects(input: {
  sourceWarehouseId: number | null;
  destinationWarehouseId: number | null;
  lines: Array<{ variantId: number | null; quantity: number }>;
}) {
  if (
    !input.sourceWarehouseId ||
    !input.destinationWarehouseId ||
    input.sourceWarehouseId === input.destinationWarehouseId
  ) {
    throw new Error("بيانات تحويل المخزون غير صالحة");
  }
  if (!input.lines.length)
    throw new Error("يتطلب التحويل بنداً واحداً على الأقل");

  const warehouseDeltas: Array<{
    warehouseId: number;
    variantId: number;
    quantityChange: number;
  }> = [];
  const movements: Array<{
    variantId: number;
    type: "out" | "in";
    quantity: number;
  }> = [];
  for (const line of input.lines) {
    if (!line.variantId)
      throw new Error("يتطلب التحويل اختيار صنف مخزني لكل بند");
    if (!Number.isInteger(line.quantity) || line.quantity <= 0)
      throw new Error("كمية تحويل المخزون غير صحيحة");
    warehouseDeltas.push(
      {
        warehouseId: input.sourceWarehouseId,
        variantId: line.variantId,
        quantityChange: -line.quantity,
      },
      {
        warehouseId: input.destinationWarehouseId,
        variantId: line.variantId,
        quantityChange: line.quantity,
      }
    );
    movements.push(
      { variantId: line.variantId, type: "out", quantity: line.quantity },
      { variantId: line.variantId, type: "in", quantity: line.quantity }
    );
  }
  const companyQuantityDelta = warehouseDeltas.reduce(
    (total, delta) => total + delta.quantityChange,
    0
  );
  if (companyQuantityDelta !== 0)
    throw new Error("أثر التحويل على إجمالي الشركة غير متوازن");
  return { warehouseDeltas, movements, companyQuantityDelta };
}

export function applyInboundInventoryValuation(input: {
  currentQuantity: number;
  currentValueUsdMinor: number;
  incomingQuantity: number;
  incomingValueUsdMinor: number;
}) {
  if (
    ![
      input.currentQuantity,
      input.currentValueUsdMinor,
      input.incomingQuantity,
      input.incomingValueUsdMinor,
    ].every(Number.isInteger) ||
    input.currentQuantity < 0 ||
    input.currentValueUsdMinor < 0 ||
    input.incomingQuantity <= 0 ||
    input.incomingValueUsdMinor < 0
  ) {
    throw new Error("بيانات تقييم المخزون الوارد غير صحيحة");
  }
  const quantity = input.currentQuantity + input.incomingQuantity;
  const valueUsdMinor =
    input.currentValueUsdMinor + input.incomingValueUsdMinor;
  return {
    quantity,
    valueUsdMinor,
    averageCostUsdMinor:
      quantity === 0 ? 0 : Math.round(valueUsdMinor / quantity),
  };
}

export function applyOutboundInventoryValuation(input: {
  currentQuantity: number;
  currentValueUsdMinor: number;
  averageCostUsdMinor: number;
  outgoingQuantity: number;
}) {
  if (
    ![
      input.currentQuantity,
      input.currentValueUsdMinor,
      input.averageCostUsdMinor,
      input.outgoingQuantity,
    ].every(Number.isInteger) ||
    input.currentQuantity < 0 ||
    input.currentValueUsdMinor < 0 ||
    input.averageCostUsdMinor < 0 ||
    input.outgoingQuantity <= 0
  ) {
    throw new Error("بيانات تقييم المخزون الصادر غير صحيحة");
  }
  if (input.outgoingQuantity > input.currentQuantity)
    throw new Error("رصيد المخزون غير كافٍ للترحيل");
  const costOfGoodsSoldUsdMinor =
    input.averageCostUsdMinor * input.outgoingQuantity;
  const quantity = input.currentQuantity - input.outgoingQuantity;
  const valueUsdMinor = Math.max(
    0,
    input.currentValueUsdMinor - costOfGoodsSoldUsdMinor
  );
  return {
    quantity,
    valueUsdMinor,
    averageCostUsdMinor: quantity === 0 ? 0 : input.averageCostUsdMinor,
    costOfGoodsSoldUsdMinor,
  };
}

export function applyPurchaseReturnInventoryValuation(input: {
  currentQuantity: number;
  currentValueUsdMinor: number;
  returnedQuantity: number;
  historicalReturnValueUsdMinor: number;
}) {
  if (
    ![
      input.currentQuantity,
      input.currentValueUsdMinor,
      input.returnedQuantity,
      input.historicalReturnValueUsdMinor,
    ].every(Number.isInteger) ||
    input.currentQuantity < 0 ||
    input.currentValueUsdMinor < 0 ||
    input.returnedQuantity <= 0 ||
    input.historicalReturnValueUsdMinor < 0
  ) {
    throw new Error("بيانات عكس قيمة مرتجع الشراء غير صحيحة");
  }
  if (input.returnedQuantity > input.currentQuantity)
    throw new Error("رصيد المخزون غير كافٍ لمرتجع الشراء");
  if (input.historicalReturnValueUsdMinor > input.currentValueUsdMinor)
    throw new Error("قيمة المخزون الحالية لا تغطي قيمة مرتجع الشراء التاريخية");
  const quantity = input.currentQuantity - input.returnedQuantity;
  const valueUsdMinor =
    input.currentValueUsdMinor - input.historicalReturnValueUsdMinor;
  return {
    quantity,
    valueUsdMinor,
    averageCostUsdMinor:
      quantity === 0 ? 0 : Math.round(valueUsdMinor / quantity),
    historicalReturnValueUsdMinor: input.historicalReturnValueUsdMinor,
  };
}

export function calculateFinancialStatements(
  rows: Array<{ type: string; debitMinor: number; creditMinor: number }>
) {
  const incomeStatement = { revenue: 0, expenses: 0 };
  const balanceSheet = { assets: 0, liabilities: 0, equity: 0 };
  for (const row of rows) {
    const debit = Number(row.debitMinor);
    const credit = Number(row.creditMinor);
    if (row.type === "revenue") incomeStatement.revenue += credit - debit;
    if (row.type === "expense") incomeStatement.expenses += debit - credit;
    if (row.type === "asset") balanceSheet.assets += debit - credit;
    if (row.type === "liability") balanceSheet.liabilities += credit - debit;
    if (row.type === "equity") balanceSheet.equity += credit - debit;
  }
  const currentPeriodEarnings =
    incomeStatement.revenue - incomeStatement.expenses;
  return {
    incomeStatement: { ...incomeStatement, netProfit: currentPeriodEarnings },
    balanceSheet: {
      ...balanceSheet,
      currentPeriodEarnings,
      liabilitiesAndEquity:
        balanceSheet.liabilities + balanceSheet.equity + currentPeriodEarnings,
    },
  };
}
