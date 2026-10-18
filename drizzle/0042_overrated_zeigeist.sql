CREATE TABLE `accounting_daily_cash_reconciliations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`branchId` int NOT NULL,
	`fiscalPeriodId` int NOT NULL,
	`reconciliationDate` varchar(10) NOT NULL,
	`paymentAccountId` int NOT NULL,
	`currencyCode` varchar(3) NOT NULL,
	`recordedClosingMinor` bigint NOT NULL,
	`actualClosingMinor` bigint NOT NULL,
	`differenceMinor` bigint NOT NULL,
	`note` varchar(255),
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pk_cash_reconcile` PRIMARY KEY(`id`),
	CONSTRAINT `uq_cash_reconcile_day` UNIQUE(`companyId`,`reconciliationDate`,`paymentAccountId`,`currencyCode`)
);
--> statement-breakpoint
ALTER TABLE `accounting_daily_cash_reconciliations` ADD CONSTRAINT `fk_cash_rec_company` FOREIGN KEY (`companyId`) REFERENCES `accounting_companies`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `accounting_daily_cash_reconciliations` ADD CONSTRAINT `fk_cash_rec_branch` FOREIGN KEY (`branchId`) REFERENCES `accounting_branches`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `accounting_daily_cash_reconciliations` ADD CONSTRAINT `fk_cash_rec_period` FOREIGN KEY (`fiscalPeriodId`) REFERENCES `accounting_fiscal_periods`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `accounting_daily_cash_reconciliations` ADD CONSTRAINT `fk_cash_rec_account` FOREIGN KEY (`paymentAccountId`) REFERENCES `accounting_payment_accounts`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `accounting_daily_cash_reconciliations` ADD CONSTRAINT `fk_cash_rec_user` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
