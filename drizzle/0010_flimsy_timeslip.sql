CREATE TABLE `accounting_warehouse_variant_balances` (
	`id` int AUTO_INCREMENT NOT NULL,
	`warehouseId` int NOT NULL,
	`variantId` int NOT NULL,
	`quantity` int NOT NULL DEFAULT 0,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `accounting_warehouse_variant_balances_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_wh_variant` UNIQUE(`warehouseId`,`variantId`)
);
--> statement-breakpoint
ALTER TABLE `accounting_warehouse_variant_balances` ADD CONSTRAINT `fk_whbal_warehouse` FOREIGN KEY (`warehouseId`) REFERENCES `accounting_warehouses`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_warehouse_variant_balances` ADD CONSTRAINT `fk_whbal_variant` FOREIGN KEY (`variantId`) REFERENCES `inventory_variants`(`id`) ON DELETE cascade ON UPDATE no action;
