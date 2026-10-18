import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import {
  buildInventoryImportBatchSections,
  findDuplicateImportIndices,
  inventoryImportKey,
  parseWorkbook,
} from "./InventoryWorkbookImporter";

// Fixture only existed on the original Manus dev server; skip locally when absent.
const workbookFixtureExists = existsSync(
  "/home/ubuntu/upload/MateriaRegisterlist08.09.2026.xlsx"
);

type Row = Parameters<typeof inventoryImportKey>[0];
const row = (name: string, barcode = ""): Row => ({
  sheet: "المخزن",
  name,
  color: "أحمر",
  size: "",
  barcode,
  quantity: 1,
  threshold: null,
});

describe("Inventory workbook importer", () => {
  it("detects exact repeated item rows while preserving the first row", () => {
    expect(
      findDuplicateImportIndices([
        row("صمون", "100"),
        row("صمون", "100"),
        row("زيت"),
      ])
    ).toEqual([1]);
  });
  it("normalizes the duplicate key without changing quantities", () => {
    expect(inventoryImportKey(row("  صمون ", "X"))).toBe("صمون|أحمر||x");
  });
  it("builds an export section with batch mode, status, counts, and date", () => {
    const sections = buildInventoryImportBatchSections([
      {
        fileName: "stock.xlsx",
        mode: "update",
        status: "completed",
        totalRows: 4,
        createdRows: 1,
        updatedRows: 3,
        failedRows: 0,
        createdAt: "2026-10-10T12:00:00.000Z",
      },
    ]);
    expect(sections[0]?.columns).toContain("أصناف محدثة");
    expect(sections[0]?.rows[0]).toContain("تحديث");
    expect(sections[0]?.rows[0]).toContain("مكتملة");
  });

  it.skipIf(!workbookFixtureExists)("previews the supplied warehouse workbook and detects embedded images", async () => {
    const buffer = await readFile(
      "/home/ubuntu/upload/MateriaRegisterlist08.09.2026.xlsx"
    );
    const preview = await parseWorkbook(new Uint8Array(buffer).buffer);
    expect(preview.rows.length).toBeGreaterThan(0);
    expect(preview.sheets.length).toBeGreaterThan(0);
    expect(preview.imageCount).toBeGreaterThan(0);
    expect(preview.imageDataUrls.length).toBeGreaterThan(0);
    expect(preview.rows[0]).toMatchObject({
      barcode: "DARA0001",
      quantity: 39,
    });
    expect(preview.rows.find(row => row.barcode === "DARA0008")).toMatchObject({
      barcode: "DARA0008",
      quantity: 14,
    });
  }, 120_000);
});
