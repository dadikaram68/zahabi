CREATE TABLE `inventory_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	`imageUrl` text,
	`lowStockThreshold` int,
	`status` enum('active','archived') NOT NULL DEFAULT 'active',
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `inventory_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `inventory_movements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`variantId` int NOT NULL,
	`type` enum('in','out') NOT NULL,
	`quantity` int NOT NULL,
	`reason` varchar(255) NOT NULL,
	`note` text,
	`performedBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `inventory_movements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `inventory_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`defaultLowStockThreshold` int NOT NULL DEFAULT 5,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `inventory_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `inventory_variants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`itemId` int NOT NULL,
	`color` varchar(80),
	`size` varchar(80),
	`barcode` varchar(120),
	`stockQuantity` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `inventory_variants_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `inventory_items` ADD CONSTRAINT `inventory_items_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inventory_movements` ADD CONSTRAINT `inventory_movements_variantId_inventory_variants_id_fk` FOREIGN KEY (`variantId`) REFERENCES `inventory_variants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inventory_movements` ADD CONSTRAINT `inventory_movements_performedBy_users_id_fk` FOREIGN KEY (`performedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inventory_variants` ADD CONSTRAINT `inventory_variants_itemId_inventory_items_id_fk` FOREIGN KEY (`itemId`) REFERENCES `inventory_items`(`id`) ON DELETE cascade ON UPDATE no action;