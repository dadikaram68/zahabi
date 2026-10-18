import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ settle: vi.fn(), invalidate: vi.fn() }));

vi.mock("@/lib/trpc", () => ({ trpc: {
  useUtils: () => ({ accounting: { cheques: { invalidate: mocks.invalidate }, journals: { invalidate: mocks.invalidate }, reports: { invalidate: mocks.invalidate } } }),
  accounting: {
    cheques: { useQuery: () => ({ data: [{ id: 11, chequeNumber: "R-2026-11", direction: "received", amountMinor: 12500, currencyCode: "USD", status: "pending", documentNumber: "RC-11", documentType: "receipt", paymentAccountName: "دفتر الشيكات", createdAt: new Date(), clearedAt: null, bouncedAt: null }, { id: 12, chequeNumber: "R-2026-12", direction: "received", amountMinor: 7500, currencyCode: "USD", status: "pending", documentNumber: "RC-12", documentType: "receipt", paymentAccountName: "دفتر الشيكات", createdAt: new Date(), clearedAt: null, bouncedAt: null }] }) },
    paymentAccounts: { useQuery: () => ({ data: [{ id: 22, name: "البنك الرئيسي", type: "bank", currencyCode: "USD" }] }) },
    settleCheque: { useMutation: () => ({ mutate: mocks.settle, isPending: false }) },
  },
} }));

import { ChequesPanel } from "./AccountingPanels";

describe("ChequesPanel", () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it("selects a matching bank for clearance and can record a bounce for a pending cheque", () => {
    render(<ChequesPanel />);
    expect(screen.getByText("شيك R-2026-11")).toBeInTheDocument();
    fireEvent.change(screen.getAllByLabelText("البنك عند التسوية")[0]!, { target: { value: "22" } });
    fireEvent.click(screen.getAllByRole("button", { name: "تسوية في البنك" })[0]!);
    expect(mocks.settle).toHaveBeenCalledWith({ chequeId: 11, action: "clear", bankPaymentAccountId: 22 });
    fireEvent.click(screen.getAllByRole("button", { name: "تسجيل ارتداد" })[1]!);
    expect(mocks.settle).toHaveBeenCalledWith({ chequeId: 12, action: "bounce" });
  });
});
