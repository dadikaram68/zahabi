CREATE TABLE `accounting_cheques` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`branchId` int NOT NULL,
	`sourceDocumentId` int NOT NULL,
	`paymentAccountId` int NOT NULL,
	`chequeNumber` varchar(80) NOT NULL,
	`direction` enum('received','issued') NOT NULL,
	`amountMinor` bigint NOT NULL,
	`currencyCode` varchar(3) NOT NULL,
	`exchangeRatePpm` bigint NOT NULL,
	`status` enum('pending','cleared','bounced') NOT NULL DEFAULT 'pending',
	`clearedJournalEntryId` int,
	`bouncedJournalEntryId` int,
	`clearedAt` timestamp,
	`bouncedAt` timestamp,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `accounting_cheques_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_cheque_source_document` UNIQUE(`sourceDocumentId`),
	CONSTRAINT `uq_cheque_company_number_direction` UNIQUE(`companyId`,`chequeNumber`,`direction`)
);
--> statement-breakpoint
ALTER TABLE `accounting_cheques` ADD CONSTRAINT `fk_chq_company` FOREIGN KEY (`companyId`) REFERENCES `accounting_companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_cheques` ADD CONSTRAINT `fk_chq_branch` FOREIGN KEY (`branchId`) REFERENCES `accounting_branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_cheques` ADD CONSTRAINT `fk_chq_document` FOREIGN KEY (`sourceDocumentId`) REFERENCES `accounting_documents`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_cheques` ADD CONSTRAINT `fk_chq_payment` FOREIGN KEY (`paymentAccountId`) REFERENCES `accounting_payment_accounts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_cheques` ADD CONSTRAINT `fk_chq_cleared_je` FOREIGN KEY (`clearedJournalEntryId`) REFERENCES `accounting_journal_entries`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_cheques` ADD CONSTRAINT `fk_chq_bounced_je` FOREIGN KEY (`bouncedJournalEntryId`) REFERENCES `accounting_journal_entries`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_cheques` ADD CONSTRAINT `fk_chq_user` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
