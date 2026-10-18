ALTER TABLE `accounting_payroll_lines` ADD `workingDays` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `accounting_payroll_lines` ADD `overtimeMinutes` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `accounting_payroll_lines` ADD `overtimeMinor` bigint DEFAULT 0 NOT NULL;