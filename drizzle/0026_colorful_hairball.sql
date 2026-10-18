CREATE TABLE `accounting_price_list_item_tiers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`priceListItemId` int NOT NULL,
	`minimumQuantity` int NOT NULL,
	`unitPriceMinor` bigint NOT NULL,
	CONSTRAINT `accounting_price_list_item_tiers_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_price_list_item_tier_min` UNIQUE(`priceListItemId`,`minimumQuantity`)
);
--> statement-breakpoint
ALTER TABLE `accounting_price_list_item_tiers` ADD CONSTRAINT `fk_price_tier_item` FOREIGN KEY (`priceListItemId`) REFERENCES `accounting_price_list_items`(`id`) ON DELETE cascade ON UPDATE no action;
