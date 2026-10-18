ALTER TABLE `accounting_daily_entries` ADD `voucherNumber` varchar(80);--> statement-breakpoint
ALTER TABLE `accounting_daily_entries` ADD `customerPartnerId` int;--> statement-breakpoint
ALTER TABLE `accounting_daily_entries` ADD `supplierPartnerId` int;--> statement-breakpoint
ALTER TABLE `accounting_daily_entries` ADD CONSTRAINT `daily_customer_fk` FOREIGN KEY (`customerPartnerId`) REFERENCES `business_partners`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_daily_entries` ADD CONSTRAINT `daily_supplier_fk` FOREIGN KEY (`supplierPartnerId`) REFERENCES `business_partners`(`id`) ON DELETE no action ON UPDATE no action;
