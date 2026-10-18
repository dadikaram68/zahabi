ALTER TABLE `accounting_payroll_runs` ADD `periodStart` timestamp NULL;--> statement-breakpoint
ALTER TABLE `accounting_payroll_runs` ADD `periodEnd` timestamp NULL;--> statement-breakpoint
UPDATE `accounting_payroll_runs` SET `periodStart` = DATE_FORMAT(`createdAt`, '%Y-%m-01'), `periodEnd` = LAST_DAY(`createdAt`) WHERE `periodStart` IS NULL OR `periodEnd` IS NULL;--> statement-breakpoint
ALTER TABLE `accounting_payroll_runs` MODIFY `periodStart` timestamp NOT NULL;--> statement-breakpoint
ALTER TABLE `accounting_payroll_runs` MODIFY `periodEnd` timestamp NOT NULL;
