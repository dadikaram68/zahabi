ALTER TABLE `accounting_documents` ADD `paymentAccountId` int;--> statement-breakpoint
ALTER TABLE `accounting_documents` ADD `destinationWarehouseId` int;--> statement-breakpoint
ALTER TABLE `accounting_documents` ADD CONSTRAINT `fk_doc_payment_account` FOREIGN KEY (`paymentAccountId`) REFERENCES `accounting_payment_accounts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_documents` ADD CONSTRAINT `fk_doc_destination_wh` FOREIGN KEY (`destinationWarehouseId`) REFERENCES `accounting_warehouses`(`id`) ON DELETE no action ON UPDATE no action;
