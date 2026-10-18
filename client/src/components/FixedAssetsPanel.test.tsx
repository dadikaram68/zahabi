import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createAsset: vi.fn(), postDepreciation: vi.fn(), confirm: vi.fn() }));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ accounting: { fixedAssets: { invalidate: vi.fn() }, accounts: { invalidate: vi.fn() }, journals: { invalidate: vi.fn() }, reports: { invalidate: vi.fn() }, overview: { invalidate: vi.fn() } } }),
    accounting: {
      fixedAssets: { useQuery: () => ({ data: { assets: [{ id: 41, assetNumber: "AST-41", name: "حاسوب", acquiredAt: new Date("2026-08-01T00:00:00.000Z"), acquisitionMinor: 120_000, salvageMinor: 0, usefulLifeMonths: 12, accumulatedDepreciationMinor: 0, status: "active", branchId: 1, branchName: "الرئيسي", assetAccountId: 13, assetAccountCode: "1300", assetAccountName: "الأصول الثابتة", accumulatedDepreciationAccountId: 14, accumulatedDepreciationAccountCode: "1310", accumulatedDepreciationAccountName: "مجمع الإهلاك", depreciationExpenseAccountId: 15, depreciationExpenseAccountCode: "6300", depreciationExpenseAccountName: "مصروف الإهلاك", createdAt: new Date() }], depreciation: [] }, isLoading: false }) },
      createFixedAsset: { useMutation: () => ({ mutate: mocks.createAsset, isPending: false }) },
      postFixedAssetDepreciation: { useMutation: () => ({ mutate: mocks.postDepreciation, isPending: false }) },
    },
  },
}));

import { FixedAssetsPanel } from "./FixedAssetsPanel";

const accounts = [
  { id: 11, code: "1110", name: "الصندوق", type: "asset", isActive: true, acceptsPosting: true },
  { id: 13, code: "1300", name: "الأصول الثابتة", type: "asset", isActive: true, acceptsPosting: true },
  { id: 14, code: "1310", name: "مجمع الإهلاك", type: "asset", isActive: true, acceptsPosting: true },
  { id: 15, code: "6300", name: "مصروف الإهلاك", type: "expense", isActive: true, acceptsPosting: true },
];

describe("FixedAssetsPanel", () => {
  afterEach(() => cleanup());
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.confirm.mockReturnValue(true);
    vi.stubGlobal("confirm", mocks.confirm);
  });

  it("submits a USD capitalization form with the selected accounting controls", () => {
    render(<FixedAssetsPanel accounts={accounts} branches={[{ id: 1, name: "الرئيسي", isActive: true }]} />);
    fireEvent.change(screen.getByLabelText("رقم الأصل"), { target: { value: "AST-2026-009" } });
    fireEvent.change(screen.getByLabelText("اسم الأصل"), { target: { value: "خادم محاسبة" } });
    fireEvent.change(screen.getByLabelText("تكلفة الاستحواذ USD"), { target: { value: "1200" } });
    fireEvent.change(screen.getByLabelText("القيمة المتبقية USD"), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText("العمر الإنتاجي (شهر)"), { target: { value: "24" } });
    fireEvent.click(screen.getByRole("button", { name: "رسملة الأصل وإضافة السجل" }));
    expect(mocks.createAsset).toHaveBeenCalledWith(expect.objectContaining({ assetNumber: "AST-2026-009", name: "خادم محاسبة", acquisitionMinor: 120_000, salvageMinor: 10_000, usefulLifeMonths: 24, assetAccountId: 13, accumulatedDepreciationAccountId: 14, depreciationExpenseAccountId: 15, creditAccountId: 11 }));
  });

  it("asks for confirmation then routes the recommended monthly depreciation", () => {
    render(<FixedAssetsPanel accounts={accounts} branches={[{ id: 1, name: "الرئيسي", isActive: true }]} />);
    fireEvent.click(screen.getByRole("button", { name: "ترحيل الإهلاك" }));
    expect(mocks.confirm).toHaveBeenCalled();
    expect(mocks.postDepreciation).toHaveBeenCalledWith({ assetId: 41, periodKey: "2026-09" });
  });
});
