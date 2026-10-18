CREATE TABLE `accounting_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`parentId` int,
	`code` varchar(30) NOT NULL,
	`name` varchar(180) NOT NULL,
	`type` enum('asset','liability','equity','revenue','expense') NOT NULL,
	`normalBalance` enum('debit','credit') NOT NULL,
	`acceptsPosting` boolean NOT NULL DEFAULT true,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `accounting_accounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `accounting_approvals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`entityType` varchar(40) NOT NULL,
	`entityId` int NOT NULL,
	`action` varchar(40) NOT NULL,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`requestedBy` int NOT NULL,
	`decidedBy` int,
	`reason` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`decidedAt` timestamp,
	CONSTRAINT `accounting_approvals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `accounting_attendance` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employeeId` int NOT NULL,
	`workDate` timestamp NOT NULL,
	`status` enum('present','absent','leave','holiday') NOT NULL DEFAULT 'present',
	`overtimeMinutes` int NOT NULL DEFAULT 0,
	`note` text,
	CONSTRAINT `accounting_attendance_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `accounting_audit_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`entityType` varchar(40) NOT NULL,
	`entityId` int NOT NULL,
	`action` varchar(60) NOT NULL,
	`beforeJson` text,
	`afterJson` text,
	`reason` text,
	`performedBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `accounting_audit_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `accounting_branches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`code` varchar(20) NOT NULL,
	`name` varchar(160) NOT NULL,
	`address` text,
	`phone` varchar(50),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `accounting_branches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `accounting_companies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	`legalName` varchar(240),
	`baseCurrencyCode` varchar(3) NOT NULL DEFAULT 'IQD',
	`fiscalYearStartMonth` int NOT NULL DEFAULT 1,
	`fiscalYearStartDay` int NOT NULL DEFAULT 1,
	`countryCode` varchar(2) NOT NULL DEFAULT 'IQ',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `accounting_companies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `accounting_cost_centers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`code` varchar(30) NOT NULL,
	`name` varchar(160) NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	CONSTRAINT `accounting_cost_centers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `accounting_currencies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(3) NOT NULL,
	`name` varchar(80) NOT NULL,
	`symbol` varchar(12),
	`decimalPlaces` int NOT NULL DEFAULT 0,
	`isBase` boolean NOT NULL DEFAULT false,
	`isActive` boolean NOT NULL DEFAULT true,
	CONSTRAINT `accounting_currencies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `accounting_document_lines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`documentId` int NOT NULL,
	`variantId` int,
	`description` varchar(255) NOT NULL,
	`quantity` int NOT NULL DEFAULT 1,
	`unitPriceMinor` bigint NOT NULL DEFAULT 0,
	`discountMinor` bigint NOT NULL DEFAULT 0,
	`lineTotalMinor` bigint NOT NULL DEFAULT 0,
	CONSTRAINT `accounting_document_lines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `accounting_document_sequences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`branchId` int NOT NULL,
	`documentType` varchar(40) NOT NULL,
	`prefix` varchar(20) NOT NULL,
	`nextNumber` int NOT NULL DEFAULT 1,
	CONSTRAINT `accounting_document_sequences_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `accounting_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`branchId` int NOT NULL,
	`warehouseId` int,
	`fiscalPeriodId` int NOT NULL,
	`documentNumber` varchar(60) NOT NULL,
	`type` enum('saleInvoice','purchaseInvoice','salesReturn','purchaseReturn','receipt','payment','stockTransfer') NOT NULL,
	`status` enum('draft','pendingApproval','approved','posted','cancelled') NOT NULL DEFAULT 'draft',
	`partnerId` int,
	`priceListId` int,
	`currencyCode` varchar(3) NOT NULL DEFAULT 'IQD',
	`exchangeRatePpm` bigint NOT NULL DEFAULT 1000000,
	`subtotalMinor` bigint NOT NULL DEFAULT 0,
	`discountMinor` bigint NOT NULL DEFAULT 0,
	`taxMinor` bigint NOT NULL DEFAULT 0,
	`totalMinor` bigint NOT NULL DEFAULT 0,
	`dueAt` timestamp,
	`note` text,
	`createdBy` int NOT NULL,
	`approvedBy` int,
	`approvedAt` timestamp,
	`postedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `accounting_documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `accounting_employees` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`branchId` int,
	`userId` int,
	`employeeNumber` varchar(40) NOT NULL,
	`fullName` varchar(180) NOT NULL,
	`jobTitle` varchar(120),
	`monthlySalaryMinor` bigint NOT NULL DEFAULT 0,
	`isActive` boolean NOT NULL DEFAULT true,
	CONSTRAINT `accounting_employees_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `accounting_fiscal_periods` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`name` varchar(80) NOT NULL,
	`startsOn` timestamp NOT NULL,
	`endsOn` timestamp NOT NULL,
	`status` enum('open','closing','closed') NOT NULL DEFAULT 'open',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `accounting_fiscal_periods_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `accounting_journal_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`branchId` int NOT NULL,
	`fiscalPeriodId` int NOT NULL,
	`entryNumber` varchar(50) NOT NULL,
	`entryDate` timestamp NOT NULL,
	`sourceType` varchar(40) NOT NULL,
	`sourceId` int,
	`status` enum('draft','pendingApproval','posted','reversed') NOT NULL DEFAULT 'draft',
	`memo` text,
	`postedBy` int,
	`postedAt` timestamp,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `accounting_journal_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `accounting_journal_lines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`journalEntryId` int NOT NULL,
	`accountId` int NOT NULL,
	`costCenterId` int,
	`currencyCode` varchar(3) NOT NULL DEFAULT 'IQD',
	`exchangeRatePpm` bigint NOT NULL DEFAULT 1000000,
	`debitMinor` bigint NOT NULL DEFAULT 0,
	`creditMinor` bigint NOT NULL DEFAULT 0,
	`baseDebitMinor` bigint NOT NULL DEFAULT 0,
	`baseCreditMinor` bigint NOT NULL DEFAULT 0,
	`memo` varchar(255),
	CONSTRAINT `accounting_journal_lines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `accounting_payment_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`branchId` int,
	`accountId` int NOT NULL,
	`type` enum('cash','bank','cheque') NOT NULL,
	`name` varchar(120) NOT NULL,
	`currencyCode` varchar(3) NOT NULL DEFAULT 'IQD',
	`isActive` boolean NOT NULL DEFAULT true,
	CONSTRAINT `accounting_payment_accounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `accounting_payroll_lines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`payrollRunId` int NOT NULL,
	`employeeId` int NOT NULL,
	`grossMinor` bigint NOT NULL DEFAULT 0,
	`advanceMinor` bigint NOT NULL DEFAULT 0,
	`deductionMinor` bigint NOT NULL DEFAULT 0,
	`netMinor` bigint NOT NULL DEFAULT 0,
	CONSTRAINT `accounting_payroll_lines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `accounting_payroll_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`branchId` int,
	`fiscalPeriodId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`status` enum('draft','pendingApproval','posted','cancelled') NOT NULL DEFAULT 'draft',
	`createdBy` int NOT NULL,
	`approvedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `accounting_payroll_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `accounting_price_list_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`priceListId` int NOT NULL,
	`variantId` int NOT NULL,
	`unitPriceMinor` bigint NOT NULL,
	CONSTRAINT `accounting_price_list_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `accounting_price_lists` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`code` varchar(30) NOT NULL,
	`name` varchar(120) NOT NULL,
	`currencyCode` varchar(3) NOT NULL DEFAULT 'IQD',
	`maxDiscountBps` int NOT NULL DEFAULT 0,
	`isActive` boolean NOT NULL DEFAULT true,
	CONSTRAINT `accounting_price_lists_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `accounting_role_permissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`roleId` int NOT NULL,
	`permission` varchar(100) NOT NULL,
	`isAllowed` boolean NOT NULL DEFAULT true,
	CONSTRAINT `accounting_role_permissions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `accounting_roles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`code` varchar(40) NOT NULL,
	`name` varchar(100) NOT NULL,
	`isSystem` boolean NOT NULL DEFAULT false,
	CONSTRAINT `accounting_roles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `accounting_user_roles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`roleId` int NOT NULL,
	`branchId` int,
	`assignedBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `accounting_user_roles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `accounting_warehouses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`branchId` int NOT NULL,
	`code` varchar(20) NOT NULL,
	`name` varchar(160) NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `accounting_warehouses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `accounting_accounts` ADD CONSTRAINT `accounting_accounts_companyId_accounting_companies_id_fk` FOREIGN KEY (`companyId`) REFERENCES `accounting_companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_approvals` ADD CONSTRAINT `accounting_approvals_requestedBy_users_id_fk` FOREIGN KEY (`requestedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_approvals` ADD CONSTRAINT `accounting_approvals_decidedBy_users_id_fk` FOREIGN KEY (`decidedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_attendance` ADD CONSTRAINT `accounting_attendance_employeeId_accounting_employees_id_fk` FOREIGN KEY (`employeeId`) REFERENCES `accounting_employees`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_audit_events` ADD CONSTRAINT `accounting_audit_events_performedBy_users_id_fk` FOREIGN KEY (`performedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_branches` ADD CONSTRAINT `accounting_branches_companyId_accounting_companies_id_fk` FOREIGN KEY (`companyId`) REFERENCES `accounting_companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_cost_centers` ADD CONSTRAINT `accounting_cost_centers_companyId_accounting_companies_id_fk` FOREIGN KEY (`companyId`) REFERENCES `accounting_companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_document_lines` ADD CONSTRAINT `accounting_document_lines_documentId_accounting_documents_id_fk` FOREIGN KEY (`documentId`) REFERENCES `accounting_documents`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_document_lines` ADD CONSTRAINT `accounting_document_lines_variantId_inventory_variants_id_fk` FOREIGN KEY (`variantId`) REFERENCES `inventory_variants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_document_sequences` ADD CONSTRAINT `accounting_document_sequences_branchId_accounting_branches_id_fk` FOREIGN KEY (`branchId`) REFERENCES `accounting_branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_documents` ADD CONSTRAINT `accounting_documents_companyId_accounting_companies_id_fk` FOREIGN KEY (`companyId`) REFERENCES `accounting_companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_documents` ADD CONSTRAINT `accounting_documents_branchId_accounting_branches_id_fk` FOREIGN KEY (`branchId`) REFERENCES `accounting_branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_documents` ADD CONSTRAINT `accounting_documents_warehouseId_accounting_warehouses_id_fk` FOREIGN KEY (`warehouseId`) REFERENCES `accounting_warehouses`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_documents` ADD CONSTRAINT `fk_doc_period` FOREIGN KEY (`fiscalPeriodId`) REFERENCES `accounting_fiscal_periods`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_documents` ADD CONSTRAINT `fk_doc_partner` FOREIGN KEY (`partnerId`) REFERENCES `business_partners`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_documents` ADD CONSTRAINT `fk_doc_prices` FOREIGN KEY (`priceListId`) REFERENCES `accounting_price_lists`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_documents` ADD CONSTRAINT `fk_doc_creator` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_documents` ADD CONSTRAINT `fk_doc_approver` FOREIGN KEY (`approvedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_employees` ADD CONSTRAINT `fk_emp_company` FOREIGN KEY (`companyId`) REFERENCES `accounting_companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_employees` ADD CONSTRAINT `fk_emp_branch` FOREIGN KEY (`branchId`) REFERENCES `accounting_branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_employees` ADD CONSTRAINT `fk_emp_user` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_fiscal_periods` ADD CONSTRAINT `fk_period_company` FOREIGN KEY (`companyId`) REFERENCES `accounting_companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_journal_entries` ADD CONSTRAINT `fk_journal_company` FOREIGN KEY (`companyId`) REFERENCES `accounting_companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_journal_entries` ADD CONSTRAINT `fk_journal_branch` FOREIGN KEY (`branchId`) REFERENCES `accounting_branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_journal_entries` ADD CONSTRAINT `fk_journal_period` FOREIGN KEY (`fiscalPeriodId`) REFERENCES `accounting_fiscal_periods`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_journal_entries` ADD CONSTRAINT `fk_journal_poster` FOREIGN KEY (`postedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_journal_entries` ADD CONSTRAINT `fk_journal_creator` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_journal_lines` ADD CONSTRAINT `fk_jline_entry` FOREIGN KEY (`journalEntryId`) REFERENCES `accounting_journal_entries`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_journal_lines` ADD CONSTRAINT `fk_jline_account` FOREIGN KEY (`accountId`) REFERENCES `accounting_accounts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_journal_lines` ADD CONSTRAINT `fk_jline_costcenter` FOREIGN KEY (`costCenterId`) REFERENCES `accounting_cost_centers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_payment_accounts` ADD CONSTRAINT `fk_payacct_company` FOREIGN KEY (`companyId`) REFERENCES `accounting_companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_payment_accounts` ADD CONSTRAINT `fk_payacct_branch` FOREIGN KEY (`branchId`) REFERENCES `accounting_branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_payment_accounts` ADD CONSTRAINT `fk_payacct_account` FOREIGN KEY (`accountId`) REFERENCES `accounting_accounts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_payroll_lines` ADD CONSTRAINT `fk_payline_run` FOREIGN KEY (`payrollRunId`) REFERENCES `accounting_payroll_runs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_payroll_lines` ADD CONSTRAINT `fk_payline_employee` FOREIGN KEY (`employeeId`) REFERENCES `accounting_employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_payroll_runs` ADD CONSTRAINT `fk_payrun_company` FOREIGN KEY (`companyId`) REFERENCES `accounting_companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_payroll_runs` ADD CONSTRAINT `fk_payrun_branch` FOREIGN KEY (`branchId`) REFERENCES `accounting_branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_payroll_runs` ADD CONSTRAINT `fk_payrun_period` FOREIGN KEY (`fiscalPeriodId`) REFERENCES `accounting_fiscal_periods`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_payroll_runs` ADD CONSTRAINT `fk_payrun_creator` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_payroll_runs` ADD CONSTRAINT `fk_payrun_approver` FOREIGN KEY (`approvedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_price_list_items` ADD CONSTRAINT `fk_priceitem_list` FOREIGN KEY (`priceListId`) REFERENCES `accounting_price_lists`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_price_list_items` ADD CONSTRAINT `fk_priceitem_variant` FOREIGN KEY (`variantId`) REFERENCES `inventory_variants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_price_lists` ADD CONSTRAINT `fk_pricelist_company` FOREIGN KEY (`companyId`) REFERENCES `accounting_companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_role_permissions` ADD CONSTRAINT `fk_roleperm_role` FOREIGN KEY (`roleId`) REFERENCES `accounting_roles`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_roles` ADD CONSTRAINT `fk_role_company` FOREIGN KEY (`companyId`) REFERENCES `accounting_companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_user_roles` ADD CONSTRAINT `fk_userrole_user` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_user_roles` ADD CONSTRAINT `fk_userrole_role` FOREIGN KEY (`roleId`) REFERENCES `accounting_roles`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_user_roles` ADD CONSTRAINT `fk_userrole_branch` FOREIGN KEY (`branchId`) REFERENCES `accounting_branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_user_roles` ADD CONSTRAINT `fk_userrole_assigner` FOREIGN KEY (`assignedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_warehouses` ADD CONSTRAINT `fk_warehouse_branch` FOREIGN KEY (`branchId`) REFERENCES `accounting_branches`(`id`) ON DELETE no action ON UPDATE no action;
