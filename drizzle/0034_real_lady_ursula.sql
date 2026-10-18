CREATE TABLE `accounting_daily_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`branchId` int NOT NULL,
	`fiscalPeriodId` int NOT NULL,
	`entryNumber` varchar(50) NOT NULL,
	`entryDate` timestamp NOT NULL,
	`entryType` enum('expense','receipt','payment','transfer','adjustment') NOT NULL,
	`description` varchar(255) NOT NULL,
	`note` text,
	`currencyCode` varchar(3) NOT NULL DEFAULT 'USD',
	`exchangeRatePpm` bigint NOT NULL DEFAULT 1000000,
	`marketExchangeRate` decimal(20,8),
	`amountMinor` bigint NOT NULL,
	`baseAmountMinor` bigint NOT NULL,
	`debitAccountId` int NOT NULL,
	`creditAccountId` int NOT NULL,
	`costCenterId` int,
	`attachmentUrl` text,
	`attachmentKey` text,
	`status` enum('draft','posted','cancelled') NOT NULL DEFAULT 'draft',
	`journalEntryId` int,
	`createdBy` int NOT NULL,
	`postedBy` int,
	`postedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pk_daily_entries` PRIMARY KEY(`id`),
	CONSTRAINT `uq_daily_entry_company_number` UNIQUE(`companyId`,`entryNumber`)
);
--> statement-breakpoint
ALTER TABLE `accounting_daily_entries` ADD CONSTRAINT `fk_daily_company` FOREIGN KEY (`companyId`) REFERENCES `accounting_companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_daily_entries` ADD CONSTRAINT `fk_daily_branch` FOREIGN KEY (`branchId`) REFERENCES `accounting_branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_daily_entries` ADD CONSTRAINT `fk_daily_period` FOREIGN KEY (`fiscalPeriodId`) REFERENCES `accounting_fiscal_periods`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_daily_entries` ADD CONSTRAINT `fk_daily_debit` FOREIGN KEY (`debitAccountId`) REFERENCES `accounting_accounts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_daily_entries` ADD CONSTRAINT `fk_daily_credit` FOREIGN KEY (`creditAccountId`) REFERENCES `accounting_accounts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_daily_entries` ADD CONSTRAINT `fk_daily_cost` FOREIGN KEY (`costCenterId`) REFERENCES `accounting_cost_centers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_daily_entries` ADD CONSTRAINT `fk_daily_journal` FOREIGN KEY (`journalEntryId`) REFERENCES `accounting_journal_entries`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_daily_entries` ADD CONSTRAINT `fk_daily_created` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_daily_entries` ADD CONSTRAINT `fk_daily_posted` FOREIGN KEY (`postedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
