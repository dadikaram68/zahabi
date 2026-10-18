import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ save: vi.fn(), invalidate: vi.fn() }));

vi.mock("@/lib/trpc", () => ({ trpc: {
  useUtils: () => ({ accounting: { priceListItems: { invalidate: mocks.invalidate } } }),
  accounting: {
    access: { useQuery: () => ({ data: { canManage: true } }) },
    priceLists: { useQuery: () => ({ data: [{ id: 5, code: "RETAIL", name: "قطاعي", currencyCode: "USD", maxDiscountBps: 500 }] }) },
    priceListItems: { useQuery: () => ({ data: { priceList: { id: 5, name: "قطاعي", code: "RETAIL", currencyCode: "USD", isActive: true }, items: [{ id: 9, variantId: 17, itemName: "مادة اختبار", color: "أحمر", size: "L", barcode: "PL-17", unitPriceMinor: 250 }] } }) },
    upsertPriceListItem: { useMutation: () => ({ mutate: mocks.save, isPending: false }) },
  },
  inventory: { overview: { useQuery: () => ({ data: { items: [{ name: "مادة اختبار", variants: [{ id: 17, color: "أحمر", size: "L" }] }] } }) } },
} }));

import { PriceListItemsPanel } from "./AccountingPanels";

describe("PriceListItemsPanel", () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it("lets a financial manager store an item price in the selected active price list", async () => {
    render(<PriceListItemsPanel />);
    await waitFor(() => expect((screen.getByLabelText("قائمة الأسعار") as HTMLSelectElement).value).toBe("5"));
    expect(screen.getByText("PL-17")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("الصنف"), { target: { value: "17" } });
    fireEvent.change(screen.getByLabelText("السعر (USD minor)"), { target: { value: "325" } });
    fireEvent.click(screen.getByRole("button", { name: "حفظ السعر" }));
    expect(mocks.save).toHaveBeenCalledWith({ priceListId: 5, variantId: 17, unitPriceMinor: 325 });
  });
});
