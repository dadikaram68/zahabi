CREATE TABLE `accounting_employee_contracts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`employeeId` int NOT NULL,
	`contractNumber` varchar(60) NOT NULL,
	`contractType` enum('permanent','fixedTerm','partTime','consultant') NOT NULL DEFAULT 'permanent',
	`startsOn` timestamp NOT NULL,
	`endsOn` timestamp,
	`baseSalaryMinor` bigint NOT NULL DEFAULT 0,
	`currencyCode` varchar(3) NOT NULL DEFAULT 'USD',
	`allowancesJson` text NOT NULL DEFAULT ('[]'),
	`insuranceRateBps` int NOT NULL DEFAULT 0,
	`taxRateBps` int NOT NULL DEFAULT 0,
	`status` enum('draft','active','expired','cancelled') NOT NULL DEFAULT 'active',
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `accounting_employee_contracts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `accounting_employee_leaves` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`employeeId` int NOT NULL,
	`leaveType` enum('annual','sick','unpaid','maternity','other') NOT NULL DEFAULT 'annual',
	`startsOn` timestamp NOT NULL,
	`endsOn` timestamp NOT NULL,
	`days` int NOT NULL DEFAULT 1,
	`status` enum('draft','pendingApproval','approved','rejected') NOT NULL DEFAULT 'draft',
	`note` text,
	`createdBy` int NOT NULL,
	`approvedBy` int,
	`approvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `accounting_employee_leaves_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `accounting_internal_security_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`mfaMode` enum('disabled','totp','email') NOT NULL DEFAULT 'disabled',
	`sessionDurationMinutes` int NOT NULL DEFAULT 1440,
	`maxFailedAttempts` int NOT NULL DEFAULT 5,
	`updatedBy` int NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `accounting_internal_security_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_internal_security_company` UNIQUE(`companyId`)
);
--> statement-breakpoint
CREATE TABLE `accounting_internal_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`tokenHash` varchar(128) NOT NULL,
	`ipAddress` varchar(64),
	`userAgent` varchar(512),
	`expiresAt` timestamp NOT NULL,
	`revokedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `accounting_internal_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_internal_session_token` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
ALTER TABLE `accounting_payroll_lines` ADD `allowancesMinor` bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `accounting_payroll_lines` ADD `insuranceMinor` bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `accounting_payroll_lines` ADD `taxMinor` bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `accounting_employee_contracts` ADD CONSTRAINT `fk_emp_contract_company` FOREIGN KEY (`companyId`) REFERENCES `accounting_companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_employee_contracts` ADD CONSTRAINT `fk_emp_contract_employee` FOREIGN KEY (`employeeId`) REFERENCES `accounting_employees`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_employee_contracts` ADD CONSTRAINT `accounting_employee_contracts_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_employee_leaves` ADD CONSTRAINT `accounting_employee_leaves_companyId_accounting_companies_id_fk` FOREIGN KEY (`companyId`) REFERENCES `accounting_companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_employee_leaves` ADD CONSTRAINT `accounting_employee_leaves_employeeId_accounting_employees_id_fk` FOREIGN KEY (`employeeId`) REFERENCES `accounting_employees`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_employee_leaves` ADD CONSTRAINT `accounting_employee_leaves_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_employee_leaves` ADD CONSTRAINT `accounting_employee_leaves_approvedBy_users_id_fk` FOREIGN KEY (`approvedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_internal_security_settings` ADD CONSTRAINT `fk_intsec_company` FOREIGN KEY (`companyId`) REFERENCES `accounting_companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_internal_security_settings` ADD CONSTRAINT `accounting_internal_security_settings_updatedBy_users_id_fk` FOREIGN KEY (`updatedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_internal_sessions` ADD CONSTRAINT `accounting_internal_sessions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;