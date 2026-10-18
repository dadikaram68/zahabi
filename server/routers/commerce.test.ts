import { describe, expect, it, vi } from "vitest";

const commerceDb = vi.hoisted(() => ({
  createInventoryInvoice: vi.fn(),
  createPartner: vi.fn(),
  getInventorySnapshot: vi.fn(),
  listInventoryInvoices: vi.fn(),
  listPartners: vi.fn(),
}));

vi.mock("../commerceDb", () => commerceDb);

import { commerceRouter } from "./commerce";

const adminContext = { user: { id: 3, role: "admin" } } as any;
const userContext = { user: { id: 4, role: "user" } } as any;

describe("commerce router flows", () => {
  it("creates a supplier record as an administrator", async () => {
    commerceDb.createPartner.mockResolvedValue({ id: 12 });
    const caller = commerceRouter.createCaller(adminContext);
    await expect(caller.partners.create({ type: "supplier", name: "شركة التوريد", phone: "0999999999" })).resolves.toEqual({ id: 12 });
    expect(commerceDb.createPartner).toHaveBeenCalledWith(expect.objectContaining({ userId: 3, type: "supplier" }));
  });

  it("records a purchase invoice for an authorised user", async () => {
    commerceDb.createInventoryInvoice.mockResolvedValue({ id: 24, invoiceNumber: "PUR-001" });
    const caller = commerceRouter.createCaller(userContext);
    await expect(caller.invoices.create({ type: "purchase", partnerId: 12, lines: [{ variantId: 7, quantity: 8, unitPrice: 125 }] })).resolves.toEqual({ id: 24, invoiceNumber: "PUR-001" });
    expect(commerceDb.createInventoryInvoice).toHaveBeenCalledWith(expect.objectContaining({ userId: 4, type: "purchase", partnerId: 12 }));
  });

  it("surfaces insufficient stock when an issue invoice is rejected", async () => {
    commerceDb.createInventoryInvoice.mockRejectedValueOnce(new Error("كمية أحد بنود الصرف أكبر من المتوفر"));
    const caller = commerceRouter.createCaller(userContext);
    await expect(caller.invoices.create({ type: "issue", partnerId: 13, lines: [{ variantId: 7, quantity: 999, unitPrice: 125 }] })).rejects.toThrow("أكبر من المتوفر");
  });
});
