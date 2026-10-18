CREATE TABLE `accounting_document_settlements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`settlementDocumentId` int NOT NULL,
	`targetDocumentId` int NOT NULL,
	`amountMinor` bigint NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `accounting_document_settlements_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_settlement_document_target` UNIQUE(`settlementDocumentId`,`targetDocumentId`)
);
--> statement-breakpoint
ALTER TABLE `accounting_document_settlements` ADD CONSTRAINT `fk_ads_settle_doc` FOREIGN KEY (`settlementDocumentId`) REFERENCES `accounting_documents`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_document_settlements` ADD CONSTRAINT `fk_ads_target_doc` FOREIGN KEY (`targetDocumentId`) REFERENCES `accounting_documents`(`id`) ON DELETE no action ON UPDATE no action;
