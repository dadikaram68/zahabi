CREATE TABLE `inventory_backup_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`retentionDays` int NOT NULL DEFAULT 30,
	`dailyBackupHourUtc` int NOT NULL DEFAULT 2,
	`scheduleCronTaskUid` varchar(65),
	`lastBackupAt` timestamp,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `inventory_backup_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `inventory_backups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`label` varchar(100) NOT NULL,
	`source` enum('scheduled','manual','pre_restore') NOT NULL,
	`storageKey` text NOT NULL,
	`storageUrl` text NOT NULL,
	`recordCounts` text NOT NULL,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `inventory_backups_id` PRIMARY KEY(`id`)
);
