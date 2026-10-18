import { describe, expect, it, vi } from "vitest";

const inventoryDb = vi.hoisted(() => ({
  addInventoryItem: vi.fn(),
  deleteInventoryItems: vi.fn(),
  createInventoryImportBatch: vi.fn(),
  importInventoryRow: vi.fn(),
  completeInventoryImportBatch: vi.fn(),
  listInventoryImportBatches: vi.fn(),
  rollbackInventoryImportBatch: vi.fn(),
  addStockMovement: vi.fn(),
  ensureInventorySetup: vi.fn(),
  getInventorySettings: vi.fn(),
  getMovementHistory: vi.fn(),
  getRecentMovements: vi.fn(),
  listInventoryItems: vi.fn(),
  updateInventoryItem: vi.fn(),
  updateInventorySettings: vi.fn(),
}));

vi.mock("../inventoryDb", () => inventoryDb);

import { inventoryRouter } from "./inventory";

const adminContext = {
  user: { id: 7, role: "admin" },
} as any;

const userContext = {
  user: { id: 8, role: "user" },
} as any;

describe("inventory router flows", () => {
  it("creates an item with its image and opening variant", async () => {
    inventoryDb.addInventoryItem.mockResolvedValue({ id: 41 });
    const caller = inventoryRouter.createCaller(adminContext);

    await expect(
      caller.addItem({
        name: "صندوق أرشيف",
        imageUrl: "https://example.com/archive-box.png",
        lowStockThreshold: 8,
        variants: [
          {
            color: "أزرق",
            size: "كبير",
            barcode: "ARC-001",
            initialQuantity: 12,
          },
        ],
      })
    ).resolves.toEqual({ id: 41 });

    expect(inventoryDb.addInventoryItem).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        imageUrl: "https://example.com/archive-box.png",
        lowStockThreshold: 8,
      })
    );
  });

  it("accepts the internal storage path returned by the device image upload", async () => {
    inventoryDb.addInventoryItem.mockResolvedValue({ id: 42 });
    const caller = inventoryRouter.createCaller(adminContext);
    await expect(
      caller.addItem({
        name: "صنف بصورة مرفوعة",
        imageUrl: "/manus-storage/inventory-images/7/item.webp",
        imageKey: "inventory-images/7/item.webp",
        variants: [{ initialQuantity: 0 }],
      })
    ).resolves.toEqual({ id: 42 });
  });

  it("supports creating, updating, completing, listing, and rolling back import batches", async () => {
    inventoryDb.createInventoryImportBatch.mockResolvedValue({ id: 51 });
    inventoryDb.importInventoryRow.mockResolvedValue({
      itemId: 10,
      action: "updated",
    });
    inventoryDb.completeInventoryImportBatch.mockResolvedValue({
      success: true,
    });
    inventoryDb.listInventoryImportBatches.mockResolvedValue([
      { id: 51, status: "completed" },
    ]);
    inventoryDb.rollbackInventoryImportBatch.mockResolvedValue({
      success: true,
      restored: 1,
    });
    const caller = inventoryRouter.createCaller(adminContext);
    await expect(
      caller.createImportBatch({
        fileName: "stock.xlsx",
        mode: "update",
        totalRows: 1,
      })
    ).resolves.toEqual({ id: 51 });
    await expect(
      caller.importRow({
        batchId: 51,
        mode: "update",
        name: "صنف",
        color: "أحمر",
        size: "كبير",
        barcode: "A-1",
        quantity: 12,
      })
    ).resolves.toEqual({ itemId: 10, action: "updated" });
    await expect(
      caller.completeImportBatch({ batchId: 51, failedRows: 0 })
    ).resolves.toEqual({ success: true });
    await expect(caller.importBatches()).resolves.toEqual([
      { id: 51, status: "completed" },
    ]);
    await expect(caller.rollbackImportBatch({ batchId: 51 })).resolves.toEqual({
      success: true,
      restored: 1,
    });
  });

  it("deletes an imported batch through the protected inventory route", async () => {
    inventoryDb.deleteInventoryItems.mockResolvedValue({ deleted: 2 });
    const caller = inventoryRouter.createCaller(adminContext);
    await expect(caller.deleteItems({ ids: [41, 42] })).resolves.toEqual({
      deleted: 2,
    });
    expect(inventoryDb.deleteInventoryItems).toHaveBeenCalledWith({
      ids: [41, 42],
    });
  });

  it("updates the item threshold and image", async () => {
    const caller = inventoryRouter.createCaller(adminContext);
    await expect(
      caller.updateItem({
        id: 41,
        name: "صندوق أرشيف محدث",
        lowStockThreshold: 10,
        imageUrl: "https://example.com/archive-box-new.png",
      })
    ).resolves.toEqual({ success: true });

    expect(inventoryDb.updateInventoryItem).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 41,
        lowStockThreshold: 10,
        imageUrl: "https://example.com/archive-box-new.png",
      })
    );
  });

  it("records incoming stock for an authorised user", async () => {
    const caller = inventoryRouter.createCaller(userContext);
    await expect(
      caller.recordMovement({
        variantId: 9,
        type: "in",
        quantity: 4,
        reason: "استلام توريد",
        note: "اختبار",
      })
    ).resolves.toEqual({ success: true });

    expect(inventoryDb.addStockMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        variantId: 9,
        userId: 8,
        type: "in",
        quantity: 4,
      })
    );
  });

  it("surfaces the stock-out rejection when quantity is insufficient", async () => {
    inventoryDb.addStockMovement.mockRejectedValueOnce(
      new Error("الكمية المتاحة لا تكفي لعملية الإخراج")
    );
    const caller = inventoryRouter.createCaller(userContext);

    await expect(
      caller.recordMovement({
        variantId: 9,
        type: "out",
        quantity: 99,
        reason: "صرف طلب",
      })
    ).rejects.toThrow("الكمية المتاحة لا تكفي");
  });

  it("updates the global threshold from the settings flow", async () => {
    const caller = inventoryRouter.createCaller(adminContext);
    await expect(
      caller.updateSettings({ defaultLowStockThreshold: 9 })
    ).resolves.toEqual({ success: true });
    expect(inventoryDb.updateInventorySettings).toHaveBeenCalledWith(9);
  });
});
