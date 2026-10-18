ALTER TABLE `accounting_companies` ADD `brandName` varchar(200);--> statement-breakpoint
ALTER TABLE `accounting_companies` ADD `brandLogoUrl` text;--> statement-breakpoint
ALTER TABLE `accounting_companies` ADD `brandLogoKey` text;--> statement-breakpoint
ALTER TABLE `accounting_companies` ADD `showProductName` boolean DEFAULT true NOT NULL;