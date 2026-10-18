ALTER TABLE `accounting_payroll_runs` ADD `journalEntryId` int;--> statement-breakpoint
ALTER TABLE `accounting_payroll_runs` ADD COLUMN `journalEntryId` int;
ALTER TABLE `accounting_payroll_runs` ADD CONSTRAINT `fk_pr_je` FOREIGN KEY (`journalEntryId`) REFERENCES `accounting_journal_entries`(`id`) ON DELETE no action ON UPDATE no action;
