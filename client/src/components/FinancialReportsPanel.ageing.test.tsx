import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

const saveBudget = vi.fn();
const calculateManualTax = vi.fn();
vi.mock("@/lib/trpc", () => ({ trpc: { useUtils: () => ({ accounting: { budgets: { invalidate: vi.fn() } } }), accounting: { access: { useQuery: () => ({ data: { canManage: true } }) }, budgets: { useQuery: () => ({ data: { fiscalPeriodName: "السنة المالية 2026", rows: [{ accountId: 41, code: "4100", name: "مبيعات", type: "revenue", budgetMinor: 120_000, actualMinor: 100_000, varianceMinor: -20_000 }] } }) }, dailyEntries: { useQuery: () => ({ data: [] }) }, upsertBudget: { useMutation: () => ({ mutate: saveBudget, isPending: false }) }, documents: { useQuery: () => ({ data: [] }) }, costCenters: { useQuery: () => ({ data: [] }) }, calculateManualTax: { useMutation: () => ({ mutate: calculateManualTax, isPending: false }) }, reports: { useQuery: () => ({ isLoading: false, data: {
  baseCurrencyCode: "USD",
  trialBalance: [],
  incomeStatement: { revenue: 0, costOfGoodsSold: 0, expenses: 0, netProfit: 0 },
  balanceSheet: { assets: 0, liabilities: 0, equity: 0, currentPeriodEarnings: 0, liabilitiesAndEquity: 0 },
  performance: { revenue: 100_000, costOfSales: 45_000, grossProfit: 55_000, payrollExpense: 12_000, operatingExpenses: 8_000, operatingProfit: 35_000, grossMarginBps: 5_500, operatingMarginBps: 3_500 },
  liquidity: { currentAssets: 140_000, currentLiabilities: 70_000, netWorkingCapital: 70_000, currentRatioBps: 20_000 },
  generalLedger: [],
  aging: [{ partnerName: "مورد الشرائح", type: "purchaseInvoice", totalMinor: 800, currentMinor: 10, days1To30Minor: 0, days31To60Minor: 720, days61To90Minor: 30, daysOver90Minor: 40 }],
  totals: { totalDebits: 0, totalCredits: 0, balanced: true },
} }) } }, inventory: { items: { useQuery: () => ({ data: [] }) }, movementReport: { useQuery: () => ({ data: [] }) } } } }));

import { FinancialReportsPanel } from "./AccountingPanels";

describe("FinancialReportsPanel ageing buckets", () => {
  it("renders every unsettled ageing bucket for a supplier or customer balance", () => {
    render(<FinancialReportsPanel />);
    expect(screen.getByDisplayValue("التقرير المالي")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "آخر 7 أيام" }));
    expect(screen.getByDisplayValue("التقرير الأسبوعي")).toBeInTheDocument();
    expect(screen.getByText("مورد الشرائح")).toBeInTheDocument();
    expect(screen.getByText(/حالي:/)).toHaveTextContent("١٠");
    expect(screen.getByText(/1–30:/)).toHaveTextContent("٠");
    expect(screen.getByText(/31–60:/)).toHaveTextContent("٧٢٠");
    expect(screen.getByText(/61–90:/)).toHaveTextContent("٣٠");
    expect(screen.getByText(/90\+:/)).toHaveTextContent("٤٠");
    expect(screen.getByText("الربحية من القيود المرحلة")).toBeInTheDocument();
    expect(screen.getByText("هامش الإجمالي")).toBeInTheDocument();
    expect(screen.getByText("رأس المال العامل")).toBeInTheDocument();
    expect(screen.getByText("نسبة التداول")).toBeInTheDocument();
    expect(screen.getByText("الخطة مقابل التنفيذ السنوي")).toBeInTheDocument();
    expect(screen.getByLabelText("موازنة مبيعات")).toHaveValue("1200");
    expect(screen.getByText("فاتورة واحدة أو فترة يحددها المحاسب")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("نسبة الضريبة"), { target: { value: "12.5" } });
    fireEvent.click(screen.getByRole("button", { name: "احتساب" }));
    expect(calculateManualTax).toHaveBeenCalledWith(expect.objectContaining({ rateBps: 1250 }));
    fireEvent.change(screen.getByDisplayValue("فترة محددة"), { target: { value: "document" } });
    expect(screen.getByText("لا توجد فواتير أو مرتجعات مرحلة صالحة للاحتساب الفردي.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "احتساب" })).toBeDisabled();
  });
});
