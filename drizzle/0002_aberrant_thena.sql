CREATE TABLE `business_partners` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` enum('supplier','customer','both') NOT NULL,
	`name` varchar(200) NOT NULL,
	`phone` varchar(50),
	`email` varchar(320),
	`address` text,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `business_partners_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `inventory_invoice_lines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`invoiceId` int NOT NULL,
	`variantId` int NOT NULL,
	`quantity` int NOT NULL,
	`unitPrice` int NOT NULL DEFAULT 0,
	`lineTotal` int NOT NULL DEFAULT 0,
	CONSTRAINT `inventory_invoice_lines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `inventory_invoices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`invoiceNumber` varchar(32) NOT NULL,
	`type` enum('purchase','issue') NOT NULL,
	`partnerId` int NOT NULL,
	`totalAmount` int NOT NULL DEFAULT 0,
	`note` text,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `inventory_invoices_id` PRIMARY KEY(`id`),
	CONSTRAINT `inventory_invoices_invoiceNumber_unique` UNIQUE(`invoiceNumber`)
);
--> statement-breakpoint
ALTER TABLE `inventory_items` ADD `imageKey` text;--> statement-breakpoint
ALTER TABLE `business_partners` ADD CONSTRAINT `business_partners_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inventory_invoice_lines` ADD CONSTRAINT `inventory_invoice_lines_invoiceId_inventory_invoices_id_fk` FOREIGN KEY (`invoiceId`) REFERENCES `inventory_invoices`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inventory_invoice_lines` ADD CONSTRAINT `inventory_invoice_lines_variantId_inventory_variants_id_fk` FOREIGN KEY (`variantId`) REFERENCES `inventory_variants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inventory_invoices` ADD CONSTRAINT `inventory_invoices_partnerId_business_partners_id_fk` FOREIGN KEY (`partnerId`) REFERENCES `business_partners`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inventory_invoices` ADD CONSTRAINT `inventory_invoices_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;