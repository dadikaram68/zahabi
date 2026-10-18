ALTER TABLE `inventory_movements` ADD `supplierPartnerId` int;--> statement-breakpoint
ALTER TABLE `inventory_movements` ADD `costCenterId` int;--> statement-breakpoint
ALTER TABLE `inventory_movements` ADD `unitCostUsdMinor` bigint;--> statement-breakpoint
ALTER TABLE `inventory_movements` ADD `totalValueUsdMinor` bigint;