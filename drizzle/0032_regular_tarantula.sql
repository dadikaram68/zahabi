CREATE TABLE `accounting_audit_event_archive` (
	`id` int AUTO_INCREMENT NOT NULL,
	`originalEventId` int NOT NULL,
	`entityType` varchar(40) NOT NULL,
	`entityId` int NOT NULL,
	`action` varchar(60) NOT NULL,
	`beforeJson` text,
	`afterJson` text,
	`reason` text,
	`performedBy` int NOT NULL,
	`createdAt` timestamp NOT NULL,
	`archivedBy` int NOT NULL,
	`archivedAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp NOT NULL,
	CONSTRAINT `accounting_audit_event_archive_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `accounting_audit_event_archive` ADD CONSTRAINT `accounting_audit_event_archive_performedBy_users_id_fk` FOREIGN KEY (`performedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_audit_event_archive` ADD CONSTRAINT `accounting_audit_event_archive_archivedBy_users_id_fk` FOREIGN KEY (`archivedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;