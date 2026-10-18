import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  createInventoryInvoice,
  createPartner,
  getInventorySnapshot,
  listInventoryInvoices,
  listPartners,
} from "../commerceDb";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { hasDelegatedAppPermission } from "../appPermissions";

const commerceManageProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const allowed = await hasDelegatedAppPermission({ userId: ctx.user.id, globalRole: ctx.user.role, permission: "commerce.manage", legacyRoles: ["system_admin", "accountant", "cashier"] });
  if (!allowed) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية إدارة الشركاء والفواتير" });
  return next();
});
const commerceReadProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const allowed = await hasDelegatedAppPermission({ userId: ctx.user.id, globalRole: ctx.user.role, permission: "commerce.read", legacyRoles: ["system_admin", "accountant", "cashier"] });
  if (!allowed) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية عرض الشركاء والفواتير" });
  return next();
});

const partnerTypeSchema = z.enum(["supplier", "customer", "both"]);
const invoiceLineSchema = z.object({
  variantId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().int().min(1).max(1_000_000),
  unitPrice: z.coerce.number().int().min(0).max(1_000_000_000),
});

export const commerceRouter = router({
  partners: router({
    list: commerceReadProcedure
      .input(z.object({ type: z.enum(["supplier", "customer"]).optional() }).optional())
      .query(({ input }) => listPartners(input?.type)),
    create: commerceManageProcedure
      .input(z.object({
        type: partnerTypeSchema,
        name: z.string().trim().min(2).max(200),
        phone: z.string().trim().max(50).optional().nullable(),
        email: z.string().trim().email().max(320).optional().nullable(),
        address: z.string().trim().max(1_000).optional().nullable(),
      }))
      .mutation(({ ctx, input }) => createPartner({ ...input, userId: ctx.user.id })),
  }),
  invoices: router({
    list: commerceReadProcedure.query(() => listInventoryInvoices()),
    snapshot: commerceReadProcedure.query(() => getInventorySnapshot()),
    create: commerceManageProcedure
      .input(z.object({
        type: z.enum(["purchase", "issue"]),
        partnerId: z.coerce.number().int().positive(),
        note: z.string().trim().max(1_000).optional().nullable(),
        lines: z.array(invoiceLineSchema).min(1).max(100),
      }))
      .mutation(({ ctx, input }) => createInventoryInvoice({ ...input, userId: ctx.user.id })),
  }),
});
