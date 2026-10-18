import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import {
  accountingCostCenters,
  businessPartners,
  inventoryImportBatchItems,
  inventoryImportBatches,
  inventoryItems,
  inventoryMovements,
  inventorySettings,
  inventoryVariants,
  users,
} from "../drizzle/schema";
import { getDb } from "./db";
import { getMovementResult } from "./inventoryRules";

export type VariantInput = {
  color?: string | null;
  size?: string | null;
  barcode?: string | null;
  initialQuantity?: number;
};

export async function ensureInventorySetup(_userId: number) {
  const db = await getDb();
  if (!db) throw new Error("تعذر الاتصال بقاعدة البيانات");

  const settings = await db.select().from(inventorySettings).limit(1);
  if (settings.length === 0) {
    await db.insert(inventorySettings).values({ defaultLowStockThreshold: 5 });
  }
}

export async function getInventorySettings() {
  const db = await getDb();
  if (!db) throw new Error("تعذر الاتصال بقاعدة البيانات");
  const settings = await db.select().from(inventorySettings).limit(1);
  return (
    settings[0] ?? { id: 0, defaultLowStockThreshold: 5, updatedAt: new Date() }
  );
}

export async function updateInventorySettings(
  defaultLowStockThreshold: number
) {
  const db = await getDb();
  if (!db) throw new Error("تعذر الاتصال بقاعدة البيانات");
  const current = await db
    .select({ id: inventorySettings.id })
    .from(inventorySettings)
    .limit(1);
  if (current[0]) {
    await db
      .update(inventorySettings)
      .set({ defaultLowStockThreshold })
      .where(eq(inventorySettings.id, current[0].id));
  } else {
    await db.insert(inventorySettings).values({ defaultLowStockThreshold });
  }
}

export async function listInventoryItems() {
  const db = await getDb();
  if (!db) throw new Error("تعذر الاتصال بقاعدة البيانات");

  const rows = await db
    .select({
      itemId: inventoryItems.id,
      itemName: inventoryItems.name,
      imageUrl: inventoryItems.imageUrl,
      imageKey: inventoryItems.imageKey,
      lowStockThreshold: inventoryItems.lowStockThreshold,
      itemStatus: inventoryItems.status,
      itemCreatedAt: inventoryItems.createdAt,
      variantId: inventoryVariants.id,
      color: inventoryVariants.color,
      size: inventoryVariants.size,
      barcode: inventoryVariants.barcode,
      stockQuantity: inventoryVariants.stockQuantity,
    })
    .from(inventoryItems)
    .leftJoin(
      inventoryVariants,
      eq(inventoryVariants.itemId, inventoryItems.id)
    )
    .orderBy(desc(inventoryItems.createdAt), desc(inventoryVariants.id));

  const grouped = new Map<
    number,
    {
      id: number;
      name: string;
      imageUrl: string | null;
      imageKey: string | null;
      lowStockThreshold: number | null;
      status: "active" | "archived";
      createdAt: Date;
      variants: Array<{
        id: number;
        color: string | null;
        size: string | null;
        barcode: string | null;
        stockQuantity: number;
      }>;
    }
  >();

  for (const row of rows) {
    let item = grouped.get(row.itemId);
    if (!item) {
      item = {
        id: row.itemId,
        name: row.itemName,
        imageUrl: row.imageUrl,
        imageKey: row.imageKey,
        lowStockThreshold: row.lowStockThreshold,
        status: row.itemStatus,
        createdAt: row.itemCreatedAt,
        variants: [],
      };
      grouped.set(row.itemId, item);
    }
    if (row.variantId !== null) {
      item.variants.push({
        id: row.variantId,
        color: row.color,
        size: row.size,
        barcode: row.barcode,
        stockQuantity: row.stockQuantity ?? 0,
      });
    }
  }

  return Array.from(grouped.values());
}

export async function addInventoryItem(input: {
  name: string;
  lowStockThreshold?: number | null;
  imageUrl?: string | null;
  imageKey?: string | null;
  variants: VariantInput[];
  userId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("تعذر الاتصال بقاعدة البيانات");

  return db.transaction(async tx => {
    const itemResult = await tx.insert(inventoryItems).values({
      name: input.name,
      lowStockThreshold: input.lowStockThreshold ?? null,
      imageUrl: input.imageUrl ?? null,
      imageKey: input.imageKey ?? null,
      createdBy: input.userId,
    });
    const itemId = Number(itemResult[0].insertId);

    for (const variant of input.variants) {
      const openingQuantity = variant.initialQuantity ?? 0;
      const variantResult = await tx.insert(inventoryVariants).values({
        itemId,
        color: variant.color || null,
        size: variant.size || null,
        barcode: variant.barcode || null,
        stockQuantity: openingQuantity,
      });

      if (openingQuantity > 0) {
        await tx.insert(inventoryMovements).values({
          variantId: Number(variantResult[0].insertId),
          type: "in",
          quantity: openingQuantity,
          reason: "رصيد افتتاحي",
          performedBy: input.userId,
        });
      }
    }

    return { id: itemId };
  });
}

export type InventoryImportMode = "create" | "update";

export async function createInventoryImportBatch(input: {
  fileName: string;
  mode: InventoryImportMode;
  totalRows: number;
  userId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("تعذر الاتصال بقاعدة البيانات");
  const result = await db.insert(inventoryImportBatches).values({
    fileName: input.fileName.slice(0, 255),
    mode: input.mode,
    totalRows: input.totalRows,
    createdBy: input.userId,
  });
  return { id: Number(result[0].insertId) };
}

export async function listInventoryImportBatches() {
  const db = await getDb();
  if (!db) throw new Error("تعذر الاتصال بقاعدة البيانات");
  return db
    .select()
    .from(inventoryImportBatches)
    .orderBy(desc(inventoryImportBatches.createdAt))
    .limit(100);
}

function normalizeImportValue(value: string | null | undefined) {
  return (value ?? "").trim().toLocaleLowerCase();
}

export async function importInventoryRow(input: {
  batchId: number;
  mode: InventoryImportMode;
  name: string;
  color?: string | null;
  size?: string | null;
  barcode?: string | null;
  quantity: number;
  lowStockThreshold?: number | null;
  imageUrl?: string | null;
  imageKey?: string | null;
  userId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("تعذر الاتصال بقاعدة البيانات");
  return db.transaction(async tx => {
    const [batch] = await tx
      .select({
        id: inventoryImportBatches.id,
        mode: inventoryImportBatches.mode,
        status: inventoryImportBatches.status,
      })
      .from(inventoryImportBatches)
      .where(eq(inventoryImportBatches.id, input.batchId));
    if (!batch || batch.status !== "running" || batch.mode !== input.mode)
      throw new Error("دفعة الاستيراد غير متاحة للتعديل");

    const allItems = await tx.select().from(inventoryItems);
    const allVariants = await tx.select().from(inventoryVariants);
    const normalizedName = normalizeImportValue(input.name);
    const normalizedBarcode = normalizeImportValue(input.barcode);
    const normalizedColor = normalizeImportValue(input.color);
    const normalizedSize = normalizeImportValue(input.size);
    const item =
      input.mode === "update"
        ? allItems.find(candidate => {
            if (normalizeImportValue(candidate.name) !== normalizedName)
              return false;
            const variants = allVariants.filter(
              variant => variant.itemId === candidate.id
            );
            return variants.some(variant =>
              normalizedBarcode
                ? normalizeImportValue(variant.barcode) === normalizedBarcode
                : normalizeImportValue(variant.color) === normalizedColor &&
                  normalizeImportValue(variant.size) === normalizedSize
            );
          })
        : undefined;

    if (!item) {
      const itemResult = await tx.insert(inventoryItems).values({
        name: input.name,
        lowStockThreshold: input.lowStockThreshold ?? null,
        imageUrl: input.imageUrl ?? null,
        imageKey: input.imageKey ?? null,
        createdBy: input.userId,
      });
      const itemId = Number(itemResult[0].insertId);
      const variantResult = await tx.insert(inventoryVariants).values({
        itemId,
        color: input.color || null,
        size: input.size || null,
        barcode: input.barcode || null,
        stockQuantity: input.quantity,
      });
      if (input.quantity > 0)
        await tx.insert(inventoryMovements).values({
          variantId: Number(variantResult[0].insertId),
          type: "in",
          quantity: input.quantity,
          reason: "رصيد افتتاحي من استيراد المخزن",
          performedBy: input.userId,
        });
      await tx.insert(inventoryImportBatchItems).values({
        batchId: input.batchId,
        itemId,
        action: "created",
        snapshot: null,
      });
      await tx
        .update(inventoryImportBatches)
        .set({
          createdRows: sql`${inventoryImportBatches.createdRows} + 1`,
        })
        .where(eq(inventoryImportBatches.id, input.batchId));
      return { itemId, action: "created" as const };
    }

    const variants = allVariants.filter(variant => variant.itemId === item.id);
    const matchedVariant = variants.find(variant =>
      normalizedBarcode
        ? normalizeImportValue(variant.barcode) === normalizedBarcode
        : normalizeImportValue(variant.color) === normalizedColor &&
          normalizeImportValue(variant.size) === normalizedSize
    );
    const snapshot = JSON.stringify({ item, variants });
    await tx
      .update(inventoryItems)
      .set({
        name: input.name,
        lowStockThreshold: input.lowStockThreshold ?? item.lowStockThreshold,
        imageUrl: input.imageUrl ?? item.imageUrl,
        imageKey: input.imageKey ?? item.imageKey,
      })
      .where(eq(inventoryItems.id, item.id));
    if (matchedVariant) {
      const difference = input.quantity - matchedVariant.stockQuantity;
      if (difference !== 0) {
        await tx
          .update(inventoryVariants)
          .set({ stockQuantity: input.quantity })
          .where(eq(inventoryVariants.id, matchedVariant.id));
        await tx.insert(inventoryMovements).values({
          variantId: matchedVariant.id,
          type: difference > 0 ? "in" : "out",
          quantity: Math.abs(difference),
          reason: "تحديث كمية من استيراد المخزن",
          performedBy: input.userId,
        });
      }
    } else {
      const variantResult = await tx.insert(inventoryVariants).values({
        itemId: item.id,
        color: input.color || null,
        size: input.size || null,
        barcode: input.barcode || null,
        stockQuantity: input.quantity,
      });
      if (input.quantity > 0)
        await tx.insert(inventoryMovements).values({
          variantId: Number(variantResult[0].insertId),
          type: "in",
          quantity: input.quantity,
          reason: "متغير جديد من استيراد المخزن",
          performedBy: input.userId,
        });
    }
    await tx.insert(inventoryImportBatchItems).values({
      batchId: input.batchId,
      itemId: item.id,
      action: "updated",
      snapshot,
    });
    await tx
      .update(inventoryImportBatches)
      .set({
        updatedRows: sql`${inventoryImportBatches.updatedRows} + 1`,
      })
      .where(eq(inventoryImportBatches.id, input.batchId));
    return { itemId: item.id, action: "updated" as const };
  });
}

export async function completeInventoryImportBatch(input: {
  batchId: number;
  failedRows: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("تعذر الاتصال بقاعدة البيانات");
  await db
    .update(inventoryImportBatches)
    .set({
      status: input.failedRows > 0 ? "completed" : "completed",
      failedRows: input.failedRows,
      completedAt: new Date(),
    })
    .where(
      and(
        eq(inventoryImportBatches.id, input.batchId),
        eq(inventoryImportBatches.status, "running")
      )
    );
  return { success: true };
}

export async function rollbackInventoryImportBatch(input: { batchId: number }) {
  const db = await getDb();
  if (!db) throw new Error("تعذر الاتصال بقاعدة البيانات");
  return db.transaction(async tx => {
    const [batch] = await tx
      .select()
      .from(inventoryImportBatches)
      .where(eq(inventoryImportBatches.id, input.batchId));
    if (!batch || batch.status !== "completed")
      throw new Error("لا يمكن التراجع عن هذه الدفعة");
    const entries = await tx
      .select()
      .from(inventoryImportBatchItems)
      .where(eq(inventoryImportBatchItems.batchId, input.batchId));
    for (const entry of entries.reverse()) {
      if (entry.action === "created") {
        await tx
          .delete(inventoryItems)
          .where(eq(inventoryItems.id, entry.itemId));
        continue;
      }
      if (!entry.snapshot) continue;
      const snapshot = JSON.parse(entry.snapshot) as {
        item: typeof inventoryItems.$inferSelect;
        variants: Array<typeof inventoryVariants.$inferSelect>;
      };
      await tx
        .update(inventoryItems)
        .set({
          name: snapshot.item.name,
          lowStockThreshold: snapshot.item.lowStockThreshold,
          imageUrl: snapshot.item.imageUrl,
          imageKey: snapshot.item.imageKey,
          status: snapshot.item.status,
        })
        .where(eq(inventoryItems.id, entry.itemId));
      const currentVariants = await tx
        .select({ id: inventoryVariants.id })
        .from(inventoryVariants)
        .where(eq(inventoryVariants.itemId, entry.itemId));
      if (currentVariants.length)
        await tx.delete(inventoryMovements).where(
          inArray(
            inventoryMovements.variantId,
            currentVariants.map(v => v.id)
          )
        );
      if (currentVariants.length)
        await tx.delete(inventoryVariants).where(
          inArray(
            inventoryVariants.id,
            currentVariants.map(v => v.id)
          )
        );
      for (const variant of snapshot.variants) {
        await tx.insert(inventoryVariants).values({
          id: variant.id,
          itemId: entry.itemId,
          color: variant.color,
          size: variant.size,
          barcode: variant.barcode,
          stockQuantity: variant.stockQuantity,
          averageCostUsdMinor: variant.averageCostUsdMinor,
          inventoryValueUsdMinor: variant.inventoryValueUsdMinor,
          createdAt: variant.createdAt,
          updatedAt: variant.updatedAt,
        });
      }
    }
    await tx
      .update(inventoryImportBatches)
      .set({ status: "rolled_back", rolledBackAt: new Date() })
      .where(eq(inventoryImportBatches.id, input.batchId));
    return { success: true, restored: entries.length };
  });
}

export async function deleteInventoryItems(input: { ids: number[] }) {
  const db = await getDb();
  if (!db) throw new Error("تعذر الاتصال بقاعدة البيانات");
  const ids = Array.from(
    new Set(input.ids.filter(id => Number.isInteger(id) && id > 0))
  );
  if (!ids.length) return { deleted: 0 };
  return db.transaction(async tx => {
    const variants = await tx
      .select({ id: inventoryVariants.id })
      .from(inventoryVariants)
      .where(inArray(inventoryVariants.itemId, ids));
    const variantIds = variants.map(row => row.id);
    if (variantIds.length)
      await tx
        .delete(inventoryMovements)
        .where(inArray(inventoryMovements.variantId, variantIds));
    if (variantIds.length)
      await tx
        .delete(inventoryVariants)
        .where(inArray(inventoryVariants.id, variantIds));
    const result = await tx
      .delete(inventoryItems)
      .where(inArray(inventoryItems.id, ids));
    return { deleted: Number(result[0]?.affectedRows ?? 0) };
  });
}

export async function updateInventoryItem(input: {
  id: number;
  name: string;
  lowStockThreshold?: number | null;
  imageUrl?: string | null;
  imageKey?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("تعذر الاتصال بقاعدة البيانات");
  await db
    .update(inventoryItems)
    .set({
      name: input.name,
      lowStockThreshold: input.lowStockThreshold ?? null,
      imageUrl: input.imageUrl ?? null,
      imageKey: input.imageKey ?? null,
    })
    .where(eq(inventoryItems.id, input.id));
}

export async function addStockMovement(input: {
  variantId: number;
  type: "in" | "out";
  quantity: number;
  reason: string;
  note?: string | null;
  userId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("تعذر الاتصال بقاعدة البيانات");

  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    getMovementResult(0, input.type, input.quantity);
  }

  return db.transaction(async tx => {
    const quantityExpression =
      input.type === "in"
        ? sql`${inventoryVariants.stockQuantity} + ${input.quantity}`
        : sql`${inventoryVariants.stockQuantity} - ${input.quantity}`;
    const condition =
      input.type === "out"
        ? and(
            eq(inventoryVariants.id, input.variantId),
            gte(inventoryVariants.stockQuantity, input.quantity)
          )
        : eq(inventoryVariants.id, input.variantId);
    const updateResult = await tx
      .update(inventoryVariants)
      .set({ stockQuantity: quantityExpression })
      .where(condition);

    if (updateResult[0].affectedRows !== 1) {
      throw new Error(
        input.type === "out"
          ? "الكمية المتاحة لا تكفي لعملية الإخراج"
          : "لم يتم العثور على متغير الصنف"
      );
    }

    await tx.insert(inventoryMovements).values({
      variantId: input.variantId,
      type: input.type,
      quantity: input.quantity,
      reason: input.reason,
      note: input.note || null,
      performedBy: input.userId,
    });
  });
}

export async function reverseStockMovement(input: {
  movementId: number;
  note: string;
  userId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("تعذر الاتصال بقاعدة البيانات");
  const note = input.note.trim();
  if (note.length < 2) throw new Error("اكتب ملاحظة سبب التراجع");

  return db.transaction(async tx => {
    const [movement] = await tx
      .select()
      .from(inventoryMovements)
      .where(eq(inventoryMovements.id, input.movementId))
      .limit(1);
    if (!movement) throw new Error("الحركة المطلوب التراجع عنها غير موجودة");

    const reversalReason = `تراجع عن حركة #${movement.id}`;
    const [existing] = await tx
      .select({ id: inventoryMovements.id })
      .from(inventoryMovements)
      .where(
        and(
          eq(inventoryMovements.variantId, movement.variantId),
          eq(inventoryMovements.reason, reversalReason)
        )
      )
      .limit(1);
    if (existing) throw new Error("تم التراجع عن هذه الحركة مسبقاً");

    const reverseType = movement.type === "in" ? "out" : "in";
    const condition =
      reverseType === "out"
        ? and(
            eq(inventoryVariants.id, movement.variantId),
            gte(inventoryVariants.stockQuantity, movement.quantity)
          )
        : eq(inventoryVariants.id, movement.variantId);
    const updateResult = await tx
      .update(inventoryVariants)
      .set({
        stockQuantity:
          reverseType === "in"
            ? sql`${inventoryVariants.stockQuantity} + ${movement.quantity}`
            : sql`${inventoryVariants.stockQuantity} - ${movement.quantity}`,
      })
      .where(condition);
    if (updateResult[0].affectedRows !== 1)
      throw new Error("لا يمكن التراجع لأن الكمية الحالية لا تسمح بذلك");

    const [created] = await tx
      .insert(inventoryMovements)
      .values({
        variantId: movement.variantId,
        type: reverseType,
        quantity: movement.quantity,
        reason: reversalReason,
        note: `ملاحظة التراجع: ${note} | الحركة الأصلية: ${movement.reason}`,
        performedBy: input.userId,
      })
      .$returningId();
    return { reversalId: created.id, originalId: movement.id };
  });
}

export async function getRecentMovements(limit = 12) {
  const db = await getDb();
  if (!db) throw new Error("تعذر الاتصال بقاعدة البيانات");
  return db
    .select({
      id: inventoryMovements.id,
      type: inventoryMovements.type,
      quantity: inventoryMovements.quantity,
      reason: inventoryMovements.reason,
      note: inventoryMovements.note,
      createdAt: inventoryMovements.createdAt,
      itemName: inventoryItems.name,
      color: inventoryVariants.color,
      size: inventoryVariants.size,
      barcode: inventoryVariants.barcode,
    })
    .from(inventoryMovements)
    .innerJoin(
      inventoryVariants,
      eq(inventoryMovements.variantId, inventoryVariants.id)
    )
    .innerJoin(inventoryItems, eq(inventoryVariants.itemId, inventoryItems.id))
    .orderBy(desc(inventoryMovements.createdAt))
    .limit(limit);
}

export async function getMovementHistory() {
  const db = await getDb();
  if (!db) throw new Error("تعذر الاتصال بقاعدة البيانات");
  return db
    .select({
      id: inventoryMovements.id,
      type: inventoryMovements.type,
      quantity: inventoryMovements.quantity,
      reason: inventoryMovements.reason,
      note: inventoryMovements.note,
      createdAt: inventoryMovements.createdAt,
      itemName: inventoryItems.name,
      color: inventoryVariants.color,
      size: inventoryVariants.size,
      barcode: inventoryVariants.barcode,
    })
    .from(inventoryMovements)
    .innerJoin(
      inventoryVariants,
      eq(inventoryMovements.variantId, inventoryVariants.id)
    )
    .innerJoin(inventoryItems, eq(inventoryVariants.itemId, inventoryItems.id))
    .orderBy(desc(inventoryMovements.createdAt));
}

export async function getItemMovementReport(input: {
  itemId?: number;
  variantId?: number;
  startDate?: string;
  endDate?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("تعذر الاتصال بقاعدة البيانات");
  const filters = [];
  if (input.itemId) filters.push(eq(inventoryVariants.itemId, input.itemId));
  if (input.variantId)
    filters.push(eq(inventoryMovements.variantId, input.variantId));
  if (input.startDate)
    filters.push(
      gte(
        inventoryMovements.createdAt,
        new Date(`${input.startDate}T00:00:00.000Z`)
      )
    );
  if (input.endDate)
    filters.push(
      lte(
        inventoryMovements.createdAt,
        new Date(`${input.endDate}T23:59:59.999Z`)
      )
    );
  const rows = await db
    .select({
      id: inventoryMovements.id,
      createdAt: inventoryMovements.createdAt,
      type: inventoryMovements.type,
      quantity: inventoryMovements.quantity,
      reason: inventoryMovements.reason,
      note: inventoryMovements.note,
      supplierPartnerId: inventoryMovements.supplierPartnerId,
      costCenterId: inventoryMovements.costCenterId,
      unitCostUsdMinor: inventoryMovements.unitCostUsdMinor,
      totalValueUsdMinor: inventoryMovements.totalValueUsdMinor,
      itemId: inventoryItems.id,
      itemName: inventoryItems.name,
      variantId: inventoryVariants.id,
      color: inventoryVariants.color,
      size: inventoryVariants.size,
      barcode: inventoryVariants.barcode,
      performedBy: inventoryMovements.performedBy,
    })
    .from(inventoryMovements)
    .innerJoin(
      inventoryVariants,
      eq(inventoryMovements.variantId, inventoryVariants.id)
    )
    .innerJoin(inventoryItems, eq(inventoryVariants.itemId, inventoryItems.id))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(inventoryMovements.createdAt), desc(inventoryMovements.id));
  const partnerIds = Array.from(
    new Set(
      rows
        .map(row => row.supplierPartnerId)
        .filter((id): id is number => id !== null)
    )
  );
  const centerIds = Array.from(
    new Set(
      rows
        .map(row => row.costCenterId)
        .filter((id): id is number => id !== null)
    )
  );
  const userIds = Array.from(new Set(rows.map(row => row.performedBy)));
  const [partners, centers, performers] = await Promise.all([
    partnerIds.length
      ? db
          .select({ id: businessPartners.id, name: businessPartners.name })
          .from(businessPartners)
          .where(inArray(businessPartners.id, partnerIds))
      : [],
    centerIds.length
      ? db
          .select({
            id: accountingCostCenters.id,
            code: accountingCostCenters.code,
            name: accountingCostCenters.name,
          })
          .from(accountingCostCenters)
          .where(inArray(accountingCostCenters.id, centerIds))
      : [],
    userIds.length
      ? db
          .select({ id: users.id, name: users.name })
          .from(users)
          .where(inArray(users.id, userIds))
      : [],
  ]);
  const partnerById = new Map(partners.map(row => [row.id, row.name]));
  const centerById = new Map(centers.map(row => [row.id, row]));
  const performerById = new Map(performers.map(row => [row.id, row.name]));
  let runningQuantity = 0;
  return rows.map(row => {
    runningQuantity += row.type === "in" ? row.quantity : -row.quantity;
    const center = row.costCenterId
      ? centerById.get(row.costCenterId)
      : undefined;
    return {
      ...row,
      direction: row.type === "in" ? "دخول" : "خروج",
      variantLabel:
        [row.color, row.size].filter(Boolean).join(" / ") || "الأساسي",
      supplierName: row.supplierPartnerId
        ? (partnerById.get(row.supplierPartnerId) ?? "")
        : "",
      costCenterName: center ? `${center.code} — ${center.name}` : "",
      performedByName: performerById.get(row.performedBy) ?? "",
      runningQuantity,
    };
  });
}
