CREATE TABLE `inventory_import_batch_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`batchId` int NOT NULL,
	`itemId` int NOT NULL,
	`action` enum('created','updated') NOT NULL,
	`snapshot` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `inventory_import_batch_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `inventory_import_batches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fileName` varchar(255) NOT NULL,
	`mode` enum('create','update') NOT NULL,
	`status` enum('running','completed','rolled_back','failed') NOT NULL DEFAULT 'running',
	`totalRows` int NOT NULL DEFAULT 0,
	`createdRows` int NOT NULL DEFAULT 0,
	`updatedRows` int NOT NULL DEFAULT 0,
	`failedRows` int NOT NULL DEFAULT 0,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	`rolledBackAt` timestamp,
	CONSTRAINT `inventory_import_batches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `inventory_import_batch_items` ADD CONSTRAINT `iibi_batchId_inventory_import_batches_fk` FOREIGN KEY (`batchId`) REFERENCES `inventory_import_batches`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inventory_import_batches` ADD CONSTRAINT `inventory_import_batches_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;