ALTER TABLE `accounting_attendance` ADD `approvalStatus` enum('draft','pendingApproval','approved') DEFAULT 'draft' NOT NULL;--> statement-breakpoint
UPDATE `accounting_attendance` SET `approvalStatus` = 'approved' WHERE `approvalStatus` IS NULL;--> statement-breakpoint
ALTER TABLE `accounting_attendance` MODIFY `approvalStatus` enum('draft','pendingApproval','approved') NOT NULL DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE `accounting_attendance` ADD `createdBy` int;--> statement-breakpoint
ALTER TABLE `accounting_attendance` ADD `submittedBy` int;--> statement-breakpoint
ALTER TABLE `accounting_attendance` ADD `submittedAt` timestamp;--> statement-breakpoint
ALTER TABLE `accounting_attendance` ADD `approvedBy` int;--> statement-breakpoint
ALTER TABLE `accounting_attendance` ADD `approvedAt` timestamp;--> statement-breakpoint
ALTER TABLE `accounting_attendance` ADD CONSTRAINT `accounting_attendance_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_attendance` ADD CONSTRAINT `accounting_attendance_submittedBy_users_id_fk` FOREIGN KEY (`submittedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_attendance` ADD CONSTRAINT `accounting_attendance_approvedBy_users_id_fk` FOREIGN KEY (`approvedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
