ALTER TABLE `accounting_companies` ADD `companyKey` varchar(30) DEFAULT 'PRIMARY' NOT NULL;--> statement-breakpoint
UPDATE `accounting_companies` SET `companyKey` = CONCAT('LEGACY-', `id`) WHERE `id` <> 1 AND `companyKey` = 'PRIMARY';--> statement-breakpoint
ALTER TABLE `accounting_companies` ADD CONSTRAINT `accounting_companies_companyKey_unique` UNIQUE(`companyKey`);
