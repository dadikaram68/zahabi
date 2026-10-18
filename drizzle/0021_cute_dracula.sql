CREATE TABLE `accounting_budgets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`fiscalPeriodId` int NOT NULL,
	`accountId` int NOT NULL,
	`budgetMinor` bigint NOT NULL DEFAULT 0,
	`createdBy` int NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `accounting_budgets_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_budget_company_period_account` UNIQUE(`companyId`,`fiscalPeriodId`,`accountId`)
);
--> statement-breakpoint
ALTER TABLE `accounting_budgets` ADD CONSTRAINT `budgets_company_fk` FOREIGN KEY (`companyId`) REFERENCES `accounting_companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_budgets` ADD CONSTRAINT `budgets_period_fk` FOREIGN KEY (`fiscalPeriodId`) REFERENCES `accounting_fiscal_periods`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_budgets` ADD CONSTRAINT `budgets_account_fk` FOREIGN KEY (`accountId`) REFERENCES `accounting_accounts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_budgets` ADD CONSTRAINT `budgets_creator_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
