import { and, desc, eq, gte, sql } from "drizzle-orm";
import {
  businessPartners,
  inventoryInvoiceLines,
  inventoryInvoices,
  inventoryItems,
  inventoryMovements,
  inventoryVariants,
} from "../drizzle/schema";
import { getDb } from "./db";

export type PartnerType = "supplier" | "customer" | "both";

export async function listPartners(type?: "supplier" | "customer") {
  const db = await getDb();
  if (!db) throw new Error("تعذر الاتصال بقاعدة البيانات");
  const filter = type
    ? sql`${businessPartners.type} = ${type} OR ${businessPartners.type} = 'both'`
    : undefined;
  return db.select().from(businessPartners).where(filter).orderBy(desc(businessPartners.createdAt));
}

export async function createPartner(input: {
  type: PartnerType;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  userId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("تعذر الاتصال بقاعدة البيانات");
  const result = await db.insert(businessPartners).values({
    type: input.type,
    name: input.name,
    phone: input.phone || null,
    email: input.email || null,
    address: input.address || null,
    createdBy: input.userId,
  });
  return { id: Number(result[0].insertId) };
}

export async function createInventoryInvoice(input: {
  type: "purchase" | "issue";
  partnerId: number;
  note?: string | null;
  userId: number;
  lines: Array<{ variantId: number; quantity: number; unitPrice: number }>;
}) {
  const db = await getDb();
  if (!db) throw new Error("تعذر الاتصال بقاعدة البيانات");
  const expectedPartnerType = input.type === "purchase" ? "supplier" : "customer";

  return db.transaction(async (tx) => {
    const partners = await tx
      .select({ id: businessPartners.id, type: businessPartners.type })
      .from(businessPartners)
      .where(eq(businessPartners.id, input.partnerId))
      .limit(1);
    const partner = partners[0];
    if (!partner || (partner.type !== expectedPartnerType && partner.type !== "both")) {
      throw new Error(input.type === "purchase" ? "اختر مورداً صالحاً للفاتورة" : "اختر عميلاً صالحاً للفاتورة");
    }

    const invoiceNumber = `${input.type === "purchase" ? "PUR" : "ISS"}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const totalAmount = input.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
    const invoiceResult = await tx.insert(inventoryInvoices).values({
      invoiceNumber,
      type: input.type,
      partnerId: input.partnerId,
      totalAmount,
      note: input.note || null,
      createdBy: input.userId,
    });
    const invoiceId = Number(invoiceResult[0].insertId);

    for (const line of input.lines) {
      const quantityExpression = input.type === "purchase"
        ? sql`${inventoryVariants.stockQuantity} + ${line.quantity}`
        : sql`${inventoryVariants.stockQuantity} - ${line.quantity}`;
      const condition = input.type === "issue"
        ? and(eq(inventoryVariants.id, line.variantId), gte(inventoryVariants.stockQuantity, line.quantity))
        : eq(inventoryVariants.id, line.variantId);
      const updateResult = await tx.update(inventoryVariants).set({ stockQuantity: quantityExpression }).where(condition);
      if (updateResult[0].affectedRows !== 1) {
        throw new Error(input.type === "issue" ? "كمية أحد بنود الصرف أكبر من المتوفر" : "أحد متغيرات الصنف غير موجود");
      }
      await tx.insert(inventoryInvoiceLines).values({
        invoiceId,
        variantId: line.variantId,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        lineTotal: line.quantity * line.unitPrice,
      });
      await tx.insert(inventoryMovements).values({
        variantId: line.variantId,
        type: input.type === "purchase" ? "in" : "out",
        quantity: line.quantity,
        reason: `${input.type === "purchase" ? "فاتورة شراء" : "فاتورة صرف"} ${invoiceNumber}`,
        note: input.note || null,
        performedBy: input.userId,
      });
    }

    return { id: invoiceId, invoiceNumber };
  });
}

export async function listInventoryInvoices(limit = 50) {
  const db = await getDb();
  if (!db) throw new Error("تعذر الاتصال بقاعدة البيانات");
  return db
    .select({
      id: inventoryInvoices.id,
      invoiceNumber: inventoryInvoices.invoiceNumber,
      type: inventoryInvoices.type,
      totalAmount: inventoryInvoices.totalAmount,
      note: inventoryInvoices.note,
      createdAt: inventoryInvoices.createdAt,
      partnerName: businessPartners.name,
      partnerType: businessPartners.type,
    })
    .from(inventoryInvoices)
    .innerJoin(businessPartners, eq(inventoryInvoices.partnerId, businessPartners.id))
    .orderBy(desc(inventoryInvoices.createdAt))
    .limit(limit);
}

export async function getInventorySnapshot() {
  const db = await getDb();
  if (!db) throw new Error("تعذر الاتصال بقاعدة البيانات");
  return db
    .select({
      itemName: inventoryItems.name,
      variantId: inventoryVariants.id,
      color: inventoryVariants.color,
      size: inventoryVariants.size,
      barcode: inventoryVariants.barcode,
      stockQuantity: inventoryVariants.stockQuantity,
    })
    .from(inventoryVariants)
    .innerJoin(inventoryItems, eq(inventoryVariants.itemId, inventoryItems.id));
}
