ALTER TABLE `accounting_document_lines` ADD `sourceDocumentLineId` int;--> statement-breakpoint
ALTER TABLE `accounting_document_lines` ADD `unitCostUsdMinor` bigint;--> statement-breakpoint
ALTER TABLE `accounting_document_lines` ADD CONSTRAINT `fk_adl_source_line` FOREIGN KEY (`sourceDocumentLineId`) REFERENCES `accounting_document_lines`(`id`) ON DELETE no action ON UPDATE no action;
