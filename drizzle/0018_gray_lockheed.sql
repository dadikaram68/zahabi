ALTER TABLE `accounting_documents` ADD `costCenterId` int;--> statement-breakpoint
ALTER TABLE `accounting_documents` ADD `costCenterId` int;--> statement-breakpoint
ALTER TABLE `accounting_documents` ADD CONSTRAINT `accounting_documents_costCenterId_accounting_cost_centers_id_fk` FOREIGN KEY (`costCenterId`) REFERENCES `accounting_cost_centers`(`id`) ON DELETE no action ON UPDATE no action;
