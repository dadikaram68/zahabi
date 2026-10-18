CREATE TABLE `accounting_daily_exchange_rates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`currencyCode` varchar(3) NOT NULL,
	`rateDate` varchar(10) NOT NULL,
	`marketExchangeRate` decimal(20,8) NOT NULL,
	`exchangeRatePpm` bigint NOT NULL,
	`setBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `accounting_daily_exchange_rates_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_daily_fx_company_currency_date` UNIQUE(`companyId`,`currencyCode`,`rateDate`)
);
--> statement-breakpoint
ALTER TABLE `accounting_daily_exchange_rates` ADD CONSTRAINT `aer_companyId_accounting_companies_fk` FOREIGN KEY (`companyId`) REFERENCES `accounting_companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_daily_exchange_rates` ADD CONSTRAINT `accounting_daily_exchange_rates_setBy_users_id_fk` FOREIGN KEY (`setBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;