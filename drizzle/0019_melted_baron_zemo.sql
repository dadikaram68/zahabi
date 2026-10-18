ALTER TABLE `accounting_employees` ADD `salaryCurrencyCode` varchar(3) DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE `accounting_employees` ADD `salaryInputMinor` bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `accounting_employees` ADD `salaryExchangeRatePpm` int DEFAULT 1000000 NOT NULL;