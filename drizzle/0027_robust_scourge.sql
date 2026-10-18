CREATE TABLE `accounting_tax_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`rateBps` int NOT NULL DEFAULT 0,
	`outputTaxAccountId` int NOT NULL,
	`inputTaxAccountId` int NOT NULL,
	`isActive` boolean NOT NULL DEFAULT false,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `accounting_tax_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_tax_settings_company` UNIQUE(`companyId`)
);
--> statement-breakpoint
ALTER TABLE `accounting_documents` ADD `taxRateBps` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `accounting_tax_settings` ADD CONSTRAINT `fk_tax_company` FOREIGN KEY (`companyId`) REFERENCES `accounting_companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_tax_settings` ADD CONSTRAINT `fk_tax_output_account` FOREIGN KEY (`outputTaxAccountId`) REFERENCES `accounting_accounts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_tax_settings` ADD CONSTRAINT `fk_tax_input_account` FOREIGN KEY (`inputTaxAccountId`) REFERENCES `accounting_accounts`(`id`) ON DELETE no action ON UPDATE no action;
