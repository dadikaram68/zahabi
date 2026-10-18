CREATE TABLE `accounting_daily_cash_openings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`branchId` int NOT NULL,
	`fiscalPeriodId` int NOT NULL,
	`openingDate` varchar(10) NOT NULL,
	`paymentAccountId` int NOT NULL,
	`currencyCode` varchar(3) NOT NULL,
	`exchangeRatePpm` bigint NOT NULL DEFAULT 1000000,
	`marketExchangeRate` decimal(20,8),
	`amountMinor` bigint NOT NULL,
	`baseAmountMinor` bigint NOT NULL,
	`note` varchar(255),
	`status` enum('pending','approved','cancelled') NOT NULL DEFAULT 'pending',
	`createdBy` int NOT NULL,
	`approvedBy` int,
	`approvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `accounting_daily_cash_openings_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_cash_opening_company_day_account_currency` UNIQUE(`companyId`,`openingDate`,`paymentAccountId`,`currencyCode`)
);
--> statement-breakpoint
ALTER TABLE `accounting_daily_entries` ADD `paymentAccountId` int;--> statement-breakpoint
ALTER TABLE `accounting_daily_cash_openings` ADD CONSTRAINT `cash_open_company_fk` FOREIGN KEY (`companyId`) REFERENCES `accounting_companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_daily_cash_openings` ADD CONSTRAINT `cash_open_branch_fk` FOREIGN KEY (`branchId`) REFERENCES `accounting_branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_daily_cash_openings` ADD CONSTRAINT `cash_open_period_fk` FOREIGN KEY (`fiscalPeriodId`) REFERENCES `accounting_fiscal_periods`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_daily_cash_openings` ADD CONSTRAINT `cash_open_account_fk` FOREIGN KEY (`paymentAccountId`) REFERENCES `accounting_payment_accounts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_daily_cash_openings` ADD CONSTRAINT `cash_open_created_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_daily_cash_openings` ADD CONSTRAINT `cash_open_approved_fk` FOREIGN KEY (`approvedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_daily_entries` ADD CONSTRAINT `daily_payment_account_fk` FOREIGN KEY (`paymentAccountId`) REFERENCES `accounting_payment_accounts`(`id`) ON DELETE no action ON UPDATE no action;
