ALTER TABLE `accounting_documents` ADD `outputTaxAccountId` int;--> statement-breakpoint
ALTER TABLE `accounting_documents` ADD `inputTaxAccountId` int;--> statement-breakpoint
ALTER TABLE `accounting_documents` ADD CONSTRAINT `fk_doc_tax_output` FOREIGN KEY (`outputTaxAccountId`) REFERENCES `accounting_accounts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_documents` ADD CONSTRAINT `fk_doc_tax_input` FOREIGN KEY (`inputTaxAccountId`) REFERENCES `accounting_accounts`(`id`) ON DELETE no action ON UPDATE no action;
