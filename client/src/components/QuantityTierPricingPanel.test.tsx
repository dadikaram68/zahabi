import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ saveTier: vi.fn(), invalidate: vi.fn() }));

vi.mock("@/lib/trpc", () => ({ trpc: {
  useUtils: () => ({ accounting: { priceListItems: { invalidate: mocks.invalidate } } }),
  accounting: {
    access: { useQuery: () => ({ data: { canManage: true } }) },
    priceLists: { useQuery: () => ({ data: [{ id: 3, code: "WHL", name: "الجملة", currencyCode: "USD" }] }) },
    priceListItems: { useQuery: () => ({ data: { items: [{ id: 9, variantId: 7, itemName: "صنف الجملة", color: null, size: null, barcode: null, unitPriceMinor: 250, tiers: [{ id: 4, minimumQuantity: 10, unitPriceMinor: 200 }] }] } }) },
    upsertPriceListItemTier: { useMutation: () => ({ mutate: mocks.saveTier, isPending: false }) },
  },
  inventory: { overview: { useQuery: () => ({ data: { items: [{ name: "صنف الجملة", variants: [{ id: 7, color: null, size: null }] }] } }) } },
} }));

import { QuantityTierPricingPanel } from "./AccountingPanels";

describe("QuantityTierPricingPanel", () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it("saves a quantity breakpoint for the selected price list item and renders existing tiers", () => {
    render(<QuantityTierPricingPanel />);
    expect(screen.getByText(/من 10 وحدة/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("الصنف"), { target: { value: "7" } });
    fireEvent.change(screen.getByLabelText("الحد الأدنى"), { target: { value: "25" } });
    fireEvent.change(screen.getByLabelText(/سعر المستوى/), { target: { value: "180" } });
    fireEvent.click(screen.getByRole("button", { name: "حفظ المستوى" }));
    expect(mocks.saveTier).toHaveBeenCalledWith({ priceListId: 3, variantId: 7, minimumQuantity: 25, unitPriceMinor: 180 });
  });
});
