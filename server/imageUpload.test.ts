import { describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({ storagePut: vi.fn() }));
vi.mock("./storage", () => storage);

import { uploadAccountingAttachment, uploadItemImage } from "./imageUpload";

describe("direct item image upload", () => {
  it("stores a valid PNG data URL using managed storage", async () => {
    storage.storagePut.mockResolvedValue({ key: "inventory-images/5/photo.png", url: "/manus-storage/inventory-images/5/photo.png" });
    await expect(uploadItemImage({ dataUrl: "data:image/png;base64,aGVsbG8=", userId: 5 })).resolves.toEqual(expect.objectContaining({ url: "/manus-storage/inventory-images/5/photo.png" }));
    expect(storage.storagePut).toHaveBeenCalledWith(expect.stringContaining("inventory-images/5/"), expect.any(Buffer), "image/png");
  });

  it("rejects unsupported image formats", async () => {
    await expect(uploadItemImage({ dataUrl: "data:image/gif;base64,aGVsbG8=", userId: 5 })).rejects.toThrow("JPG أو PNG أو WEBP");
  });

  it("stores a PDF accounting attachment", async () => {
    storage.storagePut.mockResolvedValue({ key: "accounting-attachments/5/receipt.pdf", url: "/manus-storage/accounting-attachments/5/receipt.pdf" });
    await expect(uploadAccountingAttachment({ dataUrl: "data:application/pdf;base64,aGVsbG8=", userId: 5 })).resolves.toEqual(expect.objectContaining({ url: "/manus-storage/accounting-attachments/5/receipt.pdf" }));
    expect(storage.storagePut).toHaveBeenCalledWith(expect.stringContaining("accounting-attachments/5/"), expect.any(Buffer), "application/pdf");
  });
});
