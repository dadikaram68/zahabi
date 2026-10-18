import { z } from "zod";
import { parse as parseCookie } from "cookie";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { hasDelegatedAppPermission } from "../appPermissions";
import { COOKIE_NAME } from "../../shared/const";
import { createHeartbeatJob, updateHeartbeatJob } from "../_core/heartbeat";
import { createInventoryBackup, getBackupOverview, persistBackupScheduleTaskUid, restoreInventoryBackup, updateBackupSettings, verifyInventoryBackup } from "../backupDb";

const backupManageProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const allowed =
    (await hasDelegatedAppPermission({ userId: ctx.user.id, globalRole: ctx.user.role, permission: "backups.manage", allowUnassignedLegacy: false })) ||
    (await hasDelegatedAppPermission({ userId: ctx.user.id, globalRole: ctx.user.role, permission: "menu.backups", allowUnassignedLegacy: false }));
  if (!allowed) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية النسخ الاحتياطي" });
  return next();
});

export const backupsRouter = router({
  overview: backupManageProcedure.query(() => getBackupOverview()),
  createNow: backupManageProcedure.mutation(({ ctx }) => createInventoryBackup({ source: "manual", userId: ctx.user.id })),
  updateSettings: backupManageProcedure
    .input(z.object({ retentionDays: z.coerce.number().int().min(1).max(365), dailyBackupHourUtc: z.coerce.number().int().min(0).max(23) }))
    .mutation(async ({ ctx, input }) => {
      const settings = await updateBackupSettings(input);
      const overview = await getBackupOverview();
      if (overview.settings.scheduleCronTaskUid) {
        const sessionToken = parseCookie(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
        await updateHeartbeatJob(overview.settings.scheduleCronTaskUid, { cron: `0 0 ${input.dailyBackupHourUtc} * * *`, path: "/api/scheduled/inventory-backup", enable: true, description: "Daily inventory data backup" }, sessionToken);
      }
      return settings;
    }),
  enableDailySchedule: backupManageProcedure.mutation(async ({ ctx }) => {
    const overview = await getBackupOverview();
    const cron = `0 0 ${overview.settings.dailyBackupHourUtc} * * *`;
    const sessionToken = parseCookie(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
    if (overview.settings.scheduleCronTaskUid) {
      const result = await updateHeartbeatJob(overview.settings.scheduleCronTaskUid, { cron, path: "/api/scheduled/inventory-backup", enable: true, description: "Daily inventory data backup" }, sessionToken);
      return { taskUid: overview.settings.scheduleCronTaskUid, ...result };
    }
    const job = await createHeartbeatJob({ name: "daily-inventory-backup", cron, path: "/api/scheduled/inventory-backup", description: "Daily inventory data backup" }, sessionToken);
    await persistBackupScheduleTaskUid(job.taskUid);
    return job;
  }),
  restore: backupManageProcedure
    .input(z.object({ backupId: z.coerce.number().int().positive(), confirmed: z.literal(true) }))
    .mutation(({ ctx, input }) => restoreInventoryBackup(input.backupId, ctx.user.id)),
  verify: backupManageProcedure
    .input(z.object({ backupId: z.coerce.number().int().positive() }))
    .mutation(({ input }) => verifyInventoryBackup(input.backupId)),
});
