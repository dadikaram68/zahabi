CREATE TABLE `accounting_asset_depreciation` (
	`id` int AUTO_INCREMENT NOT NULL,
	`assetId` int NOT NULL,
	`fiscalPeriodId` int NOT NULL,
	`periodKey` varchar(7) NOT NULL,
	`depreciationMinor` bigint NOT NULL,
	`journalEntryId` int NOT NULL,
	`postedBy` int NOT NULL,
	`postedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `accounting_asset_depreciation_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_asset_depreciation_period` UNIQUE(`assetId`,`periodKey`)
);
--> statement-breakpoint
CREATE TABLE `accounting_fixed_assets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`branchId` int,
	`assetNumber` varchar(40) NOT NULL,
	`name` varchar(180) NOT NULL,
	`acquiredAt` timestamp NOT NULL,
	`acquisitionMinor` bigint NOT NULL,
	`salvageMinor` bigint NOT NULL DEFAULT 0,
	`usefulLifeMonths` int NOT NULL,
	`accumulatedDepreciationMinor` bigint NOT NULL DEFAULT 0,
	`status` enum('active','fullyDepreciated','disposed') NOT NULL DEFAULT 'active',
	`assetAccountId` int NOT NULL,
	`accumulatedDepreciationAccountId` int NOT NULL,
	`depreciationExpenseAccountId` int NOT NULL,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `accounting_fixed_assets_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_fixed_asset_company_number` UNIQUE(`companyId`,`assetNumber`)
);
--> statement-breakpoint
ALTER TABLE `accounting_asset_depreciation` ADD CONSTRAINT `assetdep_asset_fk` FOREIGN KEY (`assetId`) REFERENCES `accounting_fixed_assets`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_asset_depreciation` ADD CONSTRAINT `assetdep_period_fk` FOREIGN KEY (`fiscalPeriodId`) REFERENCES `accounting_fiscal_periods`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_asset_depreciation` ADD CONSTRAINT `assetdep_entry_fk` FOREIGN KEY (`journalEntryId`) REFERENCES `accounting_journal_entries`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_asset_depreciation` ADD CONSTRAINT `assetdep_user_fk` FOREIGN KEY (`postedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_fixed_assets` ADD CONSTRAINT `assets_company_fk` FOREIGN KEY (`companyId`) REFERENCES `accounting_companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_fixed_assets` ADD CONSTRAINT `assets_branch_fk` FOREIGN KEY (`branchId`) REFERENCES `accounting_branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_fixed_assets` ADD CONSTRAINT `assets_assetacct_fk` FOREIGN KEY (`assetAccountId`) REFERENCES `accounting_accounts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_fixed_assets` ADD CONSTRAINT `assets_accdepacct_fk` FOREIGN KEY (`accumulatedDepreciationAccountId`) REFERENCES `accounting_accounts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_fixed_assets` ADD CONSTRAINT `assets_depexpacct_fk` FOREIGN KEY (`depreciationExpenseAccountId`) REFERENCES `accounting_accounts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_fixed_assets` ADD CONSTRAINT `assets_user_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
INSERT INTO `accounting_accounts` (`companyId`, `code`, `name`, `type`, `normalBalance`, `acceptsPosting`, `isActive`)
SELECT c.`id`, a.`code`, a.`name`, a.`type`, a.`normalBalance`, true, true
FROM `accounting_companies` c
CROSS JOIN (
  SELECT '1300' AS `code`, 'الأصول الثابتة' AS `name`, 'asset' AS `type`, 'debit' AS `normalBalance`
  UNION ALL SELECT '1310', 'مجمع إهلاك الأصول', 'asset', 'credit'
  UNION ALL SELECT '6300', 'مصروف إهلاك', 'expense', 'debit'
) a
LEFT JOIN `accounting_accounts` existing ON existing.`companyId` = c.`id` AND CAST(existing.`code` AS BINARY) = CAST(a.`code` AS BINARY)
WHERE existing.`id` IS NULL;
