import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  addInventoryItem,
  completeInventoryImportBatch,
  createInventoryImportBatch,
  deleteInventoryItems,
  importInventoryRow,
  listInventoryImportBatches,
  rollbackInventoryImportBatch,
  addStockMovement,
  reverseStockMovement,
  ensureInventorySetup,
  getInventorySettings,
  getItemMovementReport,
  getMovementHistory,
  getRecentMovements,
  listInventoryItems,
  updateInventorySettings,
  updateInventoryItem,
} from "../inventoryDb";
import { uploadItemImage } from "../imageUpload";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { hasDelegatedAppPermission } from "../appPermissions";

const inventoryManageProcedure = protectedProcedure.use(
  async ({ ctx, next }) => {
    const allowed = await hasDelegatedAppPermission({
      userId: ctx.user.id,
      globalRole: ctx.user.role,
      permission: "inventory.manage",
      legacyRoles: ["system_admin", "warehouse_keeper"],
    });
    if (!allowed)
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "لا تملك صلاحية إدارة المخزون",
      });
    return next();
  }
);
const inventoryReadProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const allowed = await hasDelegatedAppPermission({
    userId: ctx.user.id,
    globalRole: ctx.user.role,
    permission: "inventory.read",
    legacyRoles: ["system_admin", "warehouse_keeper", "accountant", "cashier"],
  });
  if (!allowed)
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "لا تملك صلاحية عرض المخزون",
    });
  return next();
});

const variantSchema = z.object({
  color: z.string().trim().max(80).optional().nullable(),
  size: z.string().trim().max(80).optional().nullable(),
  barcode: z.string().trim().max(120).optional().nullable(),
  initialQuantity: z.coerce.number().int().min(0).max(1_000_000).default(0),
});

export const inventoryRouter = router({
  overview: inventoryReadProcedure.query(async ({ ctx }) => {
    await ensureInventorySetup(ctx.user.id);
    const [items, settings, recentMovements] = await Promise.all([
      listInventoryItems(),
      getInventorySettings(),
      getRecentMovements(1_000_000),
    ]);
    return { items, settings, recentMovements };
  }),

  history: inventoryReadProcedure.query(async ({ ctx }) => {
    await ensureInventorySetup(ctx.user.id);
    return getMovementHistory();
  }),

  items: inventoryReadProcedure.query(async ({ ctx }) => {
    await ensureInventorySetup(ctx.user.id);
    return listInventoryItems();
  }),

  movementReport: inventoryReadProcedure
    .input(
      z
        .object({
          itemId: z.coerce.number().int().positive().optional(),
          variantId: z.coerce.number().int().positive().optional(),
          startDate: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional(),
          endDate: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      await ensureInventorySetup(ctx.user.id);
      return getItemMovementReport(input ?? {});
    }),

  importBatches: inventoryReadProcedure.query(() =>
    listInventoryImportBatches()
  ),

  createImportBatch: inventoryManageProcedure
    .input(
      z.object({
        fileName: z.string().trim().min(1).max(255),
        mode: z.enum(["create", "update"]),
        totalRows: z.coerce.number().int().min(1).max(5_000),
      })
    )
    .mutation(({ ctx, input }) =>
      createInventoryImportBatch({ ...input, userId: ctx.user.id })
    ),

  importRow: inventoryManageProcedure
    .input(
      z.object({
        batchId: z.coerce.number().int().positive(),
        mode: z.enum(["create", "update"]),
        name: z.string().trim().min(2).max(200),
        color: z.string().trim().max(80).optional().nullable(),
        size: z.string().trim().max(80).optional().nullable(),
        barcode: z.string().trim().max(120).optional().nullable(),
        quantity: z.coerce.number().int().min(0).max(1_000_000),
        lowStockThreshold: z.coerce
          .number()
          .int()
          .min(0)
          .max(1_000_000)
          .optional()
          .nullable(),
        imageUrl: z.string().max(2_000).optional().nullable(),
        imageKey: z.string().max(2_000).optional().nullable(),
      })
    )
    .mutation(({ ctx, input }) =>
      importInventoryRow({ ...input, userId: ctx.user.id })
    ),

  completeImportBatch: inventoryManageProcedure
    .input(
      z.object({
        batchId: z.coerce.number().int().positive(),
        failedRows: z.coerce.number().int().min(0).max(5_000),
      })
    )
    .mutation(input => completeInventoryImportBatch(input.input)),

  rollbackImportBatch: inventoryManageProcedure
    .input(z.object({ batchId: z.coerce.number().int().positive() }))
    .mutation(({ input }) => rollbackInventoryImportBatch(input)),

  addItem: inventoryManageProcedure
    .input(
      z.object({
        name: z.string().trim().min(2, "اكتب اسم الصنف").max(200),
        lowStockThreshold: z.coerce
          .number()
          .int()
          .min(0)
          .max(1_000_000)
          .optional()
          .nullable(),
        imageUrl: z
          .string()
          .max(2_000)
          .refine(
            value =>
              value.startsWith("/manus-storage/") ||
              (() => {
                try {
                  new URL(value);
                  return true;
                } catch {
                  return false;
                }
              })(),
            "اكتب رابط صورة صحيحاً"
          )
          .optional()
          .nullable(),
        imageKey: z.string().max(2_000).optional().nullable(),
        variants: z
          .array(variantSchema)
          .min(1, "أضف متغيراً واحداً على الأقل")
          .max(30),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return addInventoryItem({ ...input, userId: ctx.user.id });
    }),

  deleteItems: inventoryManageProcedure
    .input(
      z.object({
        ids: z.array(z.coerce.number().int().positive()).min(1).max(5_000),
      })
    )
    .mutation(({ input }) => deleteInventoryItems(input)),

  updateItem: inventoryManageProcedure
    .input(
      z.object({
        id: z.coerce.number().int().positive(),
        name: z.string().trim().min(2, "اكتب اسم الصنف").max(200),
        lowStockThreshold: z.coerce
          .number()
          .int()
          .min(0)
          .max(1_000_000)
          .optional()
          .nullable(),
        imageUrl: z
          .string()
          .max(2_000)
          .refine(
            value =>
              value.startsWith("/manus-storage/") ||
              (() => {
                try {
                  new URL(value);
                  return true;
                } catch {
                  return false;
                }
              })(),
            "اكتب رابط صورة صحيحاً"
          )
          .optional()
          .nullable(),
        imageKey: z.string().max(2_000).optional().nullable(),
      })
    )
    .mutation(async ({ input }) => {
      await updateInventoryItem(input);
      return { success: true };
    }),

  recordMovement: inventoryManageProcedure
    .input(
      z.object({
        variantId: z.coerce.number().int().positive(),
        type: z.enum(["in", "out"]),
        quantity: z.coerce.number().int().min(1).max(1_000_000),
        reason: z.string().trim().min(2, "اختر أو اكتب سبب الحركة").max(255),
        note: z.string().trim().max(1_000).optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await addStockMovement({ ...input, userId: ctx.user.id });
        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error ? error.message : "تعذر تسجيل حركة المخزون",
        });
      }
    }),

  reverseMovement: inventoryManageProcedure
    .input(
      z.object({
        movementId: z.coerce.number().int().positive(),
        note: z.string().trim().min(2, "اكتب ملاحظة سبب التراجع").max(1_000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await reverseStockMovement({ ...input, userId: ctx.user.id });
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error ? error.message : "تعذر التراجع عن الحركة",
        });
      }
    }),
  updateSettings: inventoryManageProcedure
    .input(
      z.object({
        defaultLowStockThreshold: z.coerce.number().int().min(0).max(1_000_000),
      })
    )
    .mutation(async ({ input }) => {
      await updateInventorySettings(input.defaultLowStockThreshold);
      return { success: true };
    }),

  uploadImage: inventoryManageProcedure
    .input(z.object({ dataUrl: z.string().min(32).max(8_000_000) }))
    .mutation(({ ctx, input }) =>
      uploadItemImage({ ...input, userId: ctx.user.id })
    ),
});
