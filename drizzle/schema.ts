import { bigint, boolean, decimal, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar, type AnyMySqlColumn } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  username: varchar("username", { length: 64 }).unique(),
  passwordHash: varchar("passwordHash", { length: 255 }),
  isInternalUser: boolean("isInternalUser").notNull().default(false),
  isActive: boolean("isActive").notNull().default(true),
  lastInternalSignedIn: timestamp("lastInternalSignedIn"),
  mfaEnabled: boolean("mfaEnabled").notNull().default(false),
  mfaMode: mysqlEnum("mfaMode", ["totp", "email"]).default("totp"),
  mfaSecretEncrypted: text("mfaSecretEncrypted"),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const inventorySettings = mysqlTable("inventory_settings", {
  id: int("id").autoincrement().primaryKey(),
  defaultLowStockThreshold: int("defaultLowStockThreshold").notNull().default(5),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const inventoryItems = mysqlTable("inventory_items", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  imageUrl: text("imageUrl"),
  imageKey: text("imageKey"),
  lowStockThreshold: int("lowStockThreshold"),
  status: mysqlEnum("status", ["active", "archived"]).notNull().default("active"),
  createdBy: int("createdBy").notNull().references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const inventoryVariants = mysqlTable("inventory_variants", {
  id: int("id").autoincrement().primaryKey(),
  itemId: int("itemId").notNull().references(() => inventoryItems.id, { onDelete: "cascade" }),
  color: varchar("color", { length: 80 }),
  size: varchar("size", { length: 80 }),
  barcode: varchar("barcode", { length: 120 }),
  stockQuantity: int("stockQuantity").notNull().default(0),
  averageCostUsdMinor: bigint("averageCostUsdMinor", { mode: "number" }).notNull().default(0),
  inventoryValueUsdMinor: bigint("inventoryValueUsdMinor", { mode: "number" }).notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const inventoryMovements = mysqlTable("inventory_movements", {
  id: int("id").autoincrement().primaryKey(),
  variantId: int("variantId").notNull().references(() => inventoryVariants.id, { onDelete: "cascade" }),
  type: mysqlEnum("type", ["in", "out"]).notNull(),
  quantity: int("quantity").notNull(),
  reason: varchar("reason", { length: 255 }).notNull(),
  note: text("note"),
  supplierPartnerId: int("supplierPartnerId"),
  costCenterId: int("costCenterId"),
  unitCostUsdMinor: bigint("unitCostUsdMinor", { mode: "number" }),
  totalValueUsdMinor: bigint("totalValueUsdMinor", { mode: "number" }),
  performedBy: int("performedBy").notNull().references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const inventoryImportBatches = mysqlTable("inventory_import_batches", {
  id: int("id").autoincrement().primaryKey(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  mode: mysqlEnum("mode", ["create", "update"]).notNull(),
  status: mysqlEnum("status", ["running", "completed", "rolled_back", "failed"]).notNull().default("running"),
  totalRows: int("totalRows").notNull().default(0),
  createdRows: int("createdRows").notNull().default(0),
  updatedRows: int("updatedRows").notNull().default(0),
  failedRows: int("failedRows").notNull().default(0),
  createdBy: int("createdBy").notNull().references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  rolledBackAt: timestamp("rolledBackAt"),
});

export const inventoryImportBatchItems = mysqlTable("inventory_import_batch_items", {
  id: int("id").autoincrement().primaryKey(),
  batchId: int("batchId").notNull().references(() => inventoryImportBatches.id, { onDelete: "cascade" }),
  itemId: int("itemId").notNull(),
  action: mysqlEnum("action", ["created", "updated"]).notNull(),
  snapshot: text("snapshot"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const businessPartners = mysqlTable("business_partners", {
  id: int("id").autoincrement().primaryKey(),
  type: mysqlEnum("type", ["supplier", "customer", "both"]).notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  phone: varchar("phone", { length: 50 }),
  email: varchar("email", { length: 320 }),
  address: text("address"),
  createdBy: int("createdBy").notNull().references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const inventoryInvoices = mysqlTable("inventory_invoices", {
  id: int("id").autoincrement().primaryKey(),
  invoiceNumber: varchar("invoiceNumber", { length: 32 }).notNull().unique(),
  type: mysqlEnum("type", ["purchase", "issue"]).notNull(),
  partnerId: int("partnerId").notNull().references(() => businessPartners.id),
  totalAmount: int("totalAmount").notNull().default(0),
  note: text("note"),
  createdBy: int("createdBy").notNull().references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const inventoryInvoiceLines = mysqlTable("inventory_invoice_lines", {
  id: int("id").autoincrement().primaryKey(),
  invoiceId: int("invoiceId").notNull().references(() => inventoryInvoices.id, { onDelete: "cascade" }),
  variantId: int("variantId").notNull().references(() => inventoryVariants.id),
  quantity: int("quantity").notNull(),
  unitPrice: int("unitPrice").notNull().default(0),
  lineTotal: int("lineTotal").notNull().default(0),
});

export const inventoryBackupSettings = mysqlTable("inventory_backup_settings", {
  id: int("id").autoincrement().primaryKey(),
  retentionDays: int("retentionDays").notNull().default(30),
  dailyBackupHourUtc: int("dailyBackupHourUtc").notNull().default(2),
  scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
  lastBackupAt: timestamp("lastBackupAt"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const inventoryBackups = mysqlTable("inventory_backups", {
  id: int("id").autoincrement().primaryKey(),
  label: varchar("label", { length: 100 }).notNull(),
  source: mysqlEnum("source", ["scheduled", "manual", "pre_restore"]).notNull(),
  storageKey: text("storageKey").notNull(),
  storageUrl: text("storageUrl").notNull(),
  recordCounts: text("recordCounts").notNull(),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type InventoryItem = typeof inventoryItems.$inferSelect;
export type InventoryVariant = typeof inventoryVariants.$inferSelect;
export type InventoryMovement = typeof inventoryMovements.$inferSelect;
export type BusinessPartner = typeof businessPartners.$inferSelect;
export type InventoryInvoice = typeof inventoryInvoices.$inferSelect;
export type InventoryBackup = typeof inventoryBackups.$inferSelect;

/** Professional accounting domain — all monetary fields use integer minor units. */
export const accountingCompanies = mysqlTable("accounting_companies", {
  id: int("id").autoincrement().primaryKey(),
  companyKey: varchar("companyKey", { length: 30 }).notNull().default("PRIMARY").unique(),
  name: varchar("name", { length: 200 }).notNull(),
  legalName: varchar("legalName", { length: 240 }),
  brandName: varchar("brandName", { length: 200 }),
  brandLogoUrl: text("brandLogoUrl"),
  brandLogoKey: text("brandLogoKey"),
  showProductName: boolean("showProductName").notNull().default(true),
  baseCurrencyCode: varchar("baseCurrencyCode", { length: 3 }).notNull().default("USD"),
  fiscalYearStartMonth: int("fiscalYearStartMonth").notNull().default(1),
  fiscalYearStartDay: int("fiscalYearStartDay").notNull().default(1),
  countryCode: varchar("countryCode", { length: 2 }).notNull().default("IQ"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const accountingBranches = mysqlTable("accounting_branches", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull().references(() => accountingCompanies.id),
  code: varchar("code", { length: 20 }).notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  address: text("address"),
  phone: varchar("phone", { length: 50 }),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const accountingWarehouses = mysqlTable("accounting_warehouses", {
  id: int("id").autoincrement().primaryKey(),
  branchId: int("branchId").notNull().references(() => accountingBranches.id),
  code: varchar("code", { length: 20 }).notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const accountingCurrencies = mysqlTable("accounting_currencies", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 3 }).notNull(),
  name: varchar("name", { length: 80 }).notNull(),
  symbol: varchar("symbol", { length: 12 }),
  decimalPlaces: int("decimalPlaces").notNull().default(0),
  isBase: boolean("isBase").notNull().default(false),
  isActive: boolean("isActive").notNull().default(true),
});

/** One market rate per company, currency and calendar day. */
export const accountingDailyExchangeRates = mysqlTable("accounting_daily_exchange_rates", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull().references(() => accountingCompanies.id),
  currencyCode: varchar("currencyCode", { length: 3 }).notNull(),
  rateDate: varchar("rateDate", { length: 10 }).notNull(),
  marketExchangeRate: decimal("marketExchangeRate", { precision: 20, scale: 8 }).notNull(),
  exchangeRatePpm: bigint("exchangeRatePpm", { mode: "number" }).notNull(),
  setBy: int("setBy").notNull().references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("uq_daily_fx_company_currency_date").on(table.companyId, table.currencyCode, table.rateDate)]);

export const accountingFiscalPeriods = mysqlTable("accounting_fiscal_periods", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull().references(() => accountingCompanies.id),
  name: varchar("name", { length: 80 }).notNull(),
  startsOn: timestamp("startsOn").notNull(),
  endsOn: timestamp("endsOn").notNull(),
  status: mysqlEnum("status", ["open", "closing", "closed"]).notNull().default("open"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const accountingCostCenters = mysqlTable("accounting_cost_centers", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull().references(() => accountingCompanies.id),
  code: varchar("code", { length: 30 }).notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  isActive: boolean("isActive").notNull().default(true),
});

export const accountingAccounts = mysqlTable("accounting_accounts", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull().references(() => accountingCompanies.id),
  parentId: int("parentId"),
  code: varchar("code", { length: 30 }).notNull(),
  name: varchar("name", { length: 180 }).notNull(),
  type: mysqlEnum("type", ["asset", "liability", "equity", "revenue", "expense"]).notNull(),
  normalBalance: mysqlEnum("normalBalance", ["debit", "credit"]).notNull(),
  acceptsPosting: boolean("acceptsPosting").notNull().default(true),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("uq_accounts_company_code").on(table.companyId, table.code)]);

export const accountingFixedAssets = mysqlTable("accounting_fixed_assets", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull().references(() => accountingCompanies.id),
  branchId: int("branchId").references(() => accountingBranches.id),
  assetNumber: varchar("assetNumber", { length: 40 }).notNull(),
  name: varchar("name", { length: 180 }).notNull(),
  acquiredAt: timestamp("acquiredAt").notNull(),
  acquisitionMinor: bigint("acquisitionMinor", { mode: "number" }).notNull(),
  salvageMinor: bigint("salvageMinor", { mode: "number" }).notNull().default(0),
  usefulLifeMonths: int("usefulLifeMonths").notNull(),
  accumulatedDepreciationMinor: bigint("accumulatedDepreciationMinor", { mode: "number" }).notNull().default(0),
  status: mysqlEnum("status", ["active", "fullyDepreciated", "disposed"]).notNull().default("active"),
  assetAccountId: int("assetAccountId").notNull().references(() => accountingAccounts.id),
  accumulatedDepreciationAccountId: int("accumulatedDepreciationAccountId").notNull().references(() => accountingAccounts.id),
  depreciationExpenseAccountId: int("depreciationExpenseAccountId").notNull().references(() => accountingAccounts.id),
  createdBy: int("createdBy").notNull().references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("uq_fixed_asset_company_number").on(table.companyId, table.assetNumber)]);

export const accountingAssetDepreciation = mysqlTable("accounting_asset_depreciation", {
  id: int("id").autoincrement().primaryKey(),
  assetId: int("assetId").notNull().references(() => accountingFixedAssets.id, { onDelete: "cascade" }),
  fiscalPeriodId: int("fiscalPeriodId").notNull().references(() => accountingFiscalPeriods.id),
  periodKey: varchar("periodKey", { length: 7 }).notNull(),
  depreciationMinor: bigint("depreciationMinor", { mode: "number" }).notNull(),
  journalEntryId: int("journalEntryId").notNull().references(() => accountingJournalEntries.id),
  postedBy: int("postedBy").notNull().references(() => users.id),
  postedAt: timestamp("postedAt").defaultNow().notNull(),
}, table => [uniqueIndex("uq_asset_depreciation_period").on(table.assetId, table.periodKey)]);

export const accountingJournalEntries = mysqlTable("accounting_journal_entries", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull().references(() => accountingCompanies.id),
  branchId: int("branchId").notNull().references(() => accountingBranches.id),
  fiscalPeriodId: int("fiscalPeriodId").notNull().references(() => accountingFiscalPeriods.id),
  entryNumber: varchar("entryNumber", { length: 50 }).notNull(),
  entryDate: timestamp("entryDate").notNull(),
  sourceType: varchar("sourceType", { length: 40 }).notNull(),
  sourceId: int("sourceId"),
  status: mysqlEnum("status", ["draft", "pendingApproval", "posted", "reversed"]).notNull().default("draft"),
  memo: text("memo"),
  postedBy: int("postedBy").references(() => users.id),
  postedAt: timestamp("postedAt"),
  createdBy: int("createdBy").notNull().references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const accountingJournalLines = mysqlTable("accounting_journal_lines", {
  id: int("id").autoincrement().primaryKey(),
  journalEntryId: int("journalEntryId").notNull().references(() => accountingJournalEntries.id, { onDelete: "cascade" }),
  accountId: int("accountId").notNull().references(() => accountingAccounts.id),
  costCenterId: int("costCenterId").references(() => accountingCostCenters.id),
  currencyCode: varchar("currencyCode", { length: 3 }).notNull().default("IQD"),
  exchangeRatePpm: bigint("exchangeRatePpm", { mode: "number" }).notNull().default(1000000),
  debitMinor: bigint("debitMinor", { mode: "number" }).notNull().default(0),
  creditMinor: bigint("creditMinor", { mode: "number" }).notNull().default(0),
  baseDebitMinor: bigint("baseDebitMinor", { mode: "number" }).notNull().default(0),
  baseCreditMinor: bigint("baseCreditMinor", { mode: "number" }).notNull().default(0),
  memo: varchar("memo", { length: 255 }),
});

/** TOTAL9-style daily accounting vouchers. They remain drafts until posted into the journal. */
export const accountingDailyEntries = mysqlTable("accounting_daily_entries", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull().references(() => accountingCompanies.id),
  branchId: int("branchId").notNull().references(() => accountingBranches.id),
  fiscalPeriodId: int("fiscalPeriodId").notNull().references(() => accountingFiscalPeriods.id),
  entryNumber: varchar("entryNumber", { length: 50 }).notNull(),
  entryDate: timestamp("entryDate").notNull(),
  entryType: mysqlEnum("entryType", ["expense", "receipt", "payment", "transfer", "adjustment"]).notNull(),
  voucherNumber: varchar("voucherNumber", { length: 80 }),
  description: varchar("description", { length: 255 }).notNull(),
  category: varchar("category", { length: 120 }),
  note: text("note"),
  currencyCode: varchar("currencyCode", { length: 3 }).notNull().default("USD"),
  exchangeRatePpm: bigint("exchangeRatePpm", { mode: "number" }).notNull().default(1000000),
  marketExchangeRate: decimal("marketExchangeRate", { precision: 20, scale: 8 }),
  amountMinor: bigint("amountMinor", { mode: "number" }).notNull(),
  baseAmountMinor: bigint("baseAmountMinor", { mode: "number" }).notNull(),
  debitAccountId: int("debitAccountId").notNull().references(() => accountingAccounts.id),
  creditAccountId: int("creditAccountId").notNull().references(() => accountingAccounts.id),
  paymentAccountId: int("paymentAccountId").references(() => accountingPaymentAccounts.id),
  costCenterId: int("costCenterId").references(() => accountingCostCenters.id),
  customerPartnerId: int("customerPartnerId").references(() => businessPartners.id),
  supplierPartnerId: int("supplierPartnerId").references(() => businessPartners.id),
  attachmentUrl: text("attachmentUrl"),
  attachmentKey: text("attachmentKey"),
  status: mysqlEnum("status", ["draft", "pendingApproval", "posted", "cancelled"]).notNull().default("draft"),
  journalEntryId: int("journalEntryId").references(() => accountingJournalEntries.id),
  createdBy: int("createdBy").notNull().references(() => users.id),
  postedBy: int("postedBy").references(() => users.id),
  postedAt: timestamp("postedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("uq_daily_entry_company_number").on(table.companyId, table.entryNumber)]);

export type AccountingDailyEntry = typeof accountingDailyEntries.$inferSelect;

/** Approved opening balances carried from one cash/bank day to the next. */
export const accountingDailyCashOpenings = mysqlTable("accounting_daily_cash_openings", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull().references(() => accountingCompanies.id),
  branchId: int("branchId").notNull().references(() => accountingBranches.id),
  fiscalPeriodId: int("fiscalPeriodId").notNull().references(() => accountingFiscalPeriods.id),
  openingDate: varchar("openingDate", { length: 10 }).notNull(),
  paymentAccountId: int("paymentAccountId").notNull().references(() => accountingPaymentAccounts.id),
  currencyCode: varchar("currencyCode", { length: 3 }).notNull(),
  exchangeRatePpm: bigint("exchangeRatePpm", { mode: "number" }).notNull().default(1000000),
  marketExchangeRate: decimal("marketExchangeRate", { precision: 20, scale: 8 }),
  amountMinor: bigint("amountMinor", { mode: "number" }).notNull(),
  baseAmountMinor: bigint("baseAmountMinor", { mode: "number" }).notNull(),
  note: varchar("note", { length: 255 }),
  status: mysqlEnum("status", ["pending", "approved", "cancelled"]).notNull().default("pending"),
  createdBy: int("createdBy").notNull().references(() => users.id),
  approvedBy: int("approvedBy").references(() => users.id),
  approvedAt: timestamp("approvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("uq_cash_opening_company_day_account_currency").on(table.companyId, table.openingDate, table.paymentAccountId, table.currencyCode)]);

export type AccountingDailyCashOpening = typeof accountingDailyCashOpenings.$inferSelect;
export const accountingDailyCashReconciliations = mysqlTable("accounting_daily_cash_reconciliations", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull().references(() => accountingCompanies.id),
  branchId: int("branchId").notNull().references(() => accountingBranches.id),
  fiscalPeriodId: int("fiscalPeriodId").notNull().references(() => accountingFiscalPeriods.id),
  reconciliationDate: varchar("reconciliationDate", { length: 10 }).notNull(),
  paymentAccountId: int("paymentAccountId").notNull().references(() => accountingPaymentAccounts.id),
  currencyCode: varchar("currencyCode", { length: 3 }).notNull(),
  recordedClosingMinor: bigint("recordedClosingMinor", { mode: "number" }).notNull(),
  actualClosingMinor: bigint("actualClosingMinor", { mode: "number" }).notNull(),
  differenceMinor: bigint("differenceMinor", { mode: "number" }).notNull(),
  note: varchar("note", { length: 255 }),
  createdBy: int("createdBy").notNull().references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, table => [uniqueIndex("uq_cash_reconcile_company_day_account_currency").on(table.companyId, table.reconciliationDate, table.paymentAccountId, table.currencyCode)]);
export type AccountingDailyCashReconciliation = typeof accountingDailyCashReconciliations.$inferSelect;
export const accountingDocumentSequences = mysqlTable("accounting_document_sequences", {
  id: int("id").autoincrement().primaryKey(),
  branchId: int("branchId").notNull().references(() => accountingBranches.id),
  documentType: varchar("documentType", { length: 40 }).notNull(),
  prefix: varchar("prefix", { length: 20 }).notNull(),
  nextNumber: int("nextNumber").notNull().default(1),
}, table => [uniqueIndex("uq_docseq_branch_type").on(table.branchId, table.documentType)]);

export const accountingPriceLists = mysqlTable("accounting_price_lists", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull().references(() => accountingCompanies.id),
  code: varchar("code", { length: 30 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  currencyCode: varchar("currencyCode", { length: 3 }).notNull().default("USD"),
  maxDiscountBps: int("maxDiscountBps").notNull().default(0),
  isActive: boolean("isActive").notNull().default(true),
});

export const accountingPriceListItems = mysqlTable("accounting_price_list_items", {
  id: int("id").autoincrement().primaryKey(),
  priceListId: int("priceListId").notNull().references(() => accountingPriceLists.id, { onDelete: "cascade" }),
  variantId: int("variantId").notNull().references(() => inventoryVariants.id),
  unitPriceMinor: bigint("unitPriceMinor", { mode: "number" }).notNull(),
}, table => [uniqueIndex("uq_price_list_variant").on(table.priceListId, table.variantId)]);

export const accountingPriceListItemTiers = mysqlTable("accounting_price_list_item_tiers", {
  id: int("id").autoincrement().primaryKey(),
  priceListItemId: int("priceListItemId").notNull().references(() => accountingPriceListItems.id, { onDelete: "cascade" }),
  minimumQuantity: int("minimumQuantity").notNull(),
  unitPriceMinor: bigint("unitPriceMinor", { mode: "number" }).notNull(),
}, table => [uniqueIndex("uq_price_list_item_tier_min").on(table.priceListItemId, table.minimumQuantity)]);

export const accountingTaxSettings = mysqlTable("accounting_tax_settings", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull().references(() => accountingCompanies.id),
  rateBps: int("rateBps").notNull().default(0),
  outputTaxAccountId: int("outputTaxAccountId").notNull().references(() => accountingAccounts.id),
  inputTaxAccountId: int("inputTaxAccountId").notNull().references(() => accountingAccounts.id),
  isActive: boolean("isActive").notNull().default(false),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("uq_tax_settings_company").on(table.companyId)]);

export const accountingDocuments = mysqlTable("accounting_documents", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull().references(() => accountingCompanies.id),
  branchId: int("branchId").notNull().references(() => accountingBranches.id),
  warehouseId: int("warehouseId").references(() => accountingWarehouses.id),
  fiscalPeriodId: int("fiscalPeriodId").notNull().references(() => accountingFiscalPeriods.id),
  documentNumber: varchar("documentNumber", { length: 60 }).notNull(),
  type: mysqlEnum("type", ["saleInvoice", "purchaseInvoice", "salesReturn", "purchaseReturn", "receipt", "payment", "stockTransfer"]).notNull(),
  status: mysqlEnum("status", ["draft", "pendingApproval", "approved", "posted", "cancelled"]).notNull().default("draft"),
  partnerId: int("partnerId").references(() => businessPartners.id),
  paymentAccountId: int("paymentAccountId").references(() => accountingPaymentAccounts.id),
  priceListId: int("priceListId").references(() => accountingPriceLists.id),
  costCenterId: int("costCenterId").references(() => accountingCostCenters.id),
  destinationWarehouseId: int("destinationWarehouseId").references(() => accountingWarehouses.id),
  currencyCode: varchar("currencyCode", { length: 3 }).notNull().default("IQD"),
  exchangeRatePpm: bigint("exchangeRatePpm", { mode: "number" }).notNull().default(1000000),
  marketExchangeRate: decimal("marketExchangeRate", { precision: 20, scale: 8 }),
  subtotalMinor: bigint("subtotalMinor", { mode: "number" }).notNull().default(0),
  discountMinor: bigint("discountMinor", { mode: "number" }).notNull().default(0),
  taxRateBps: int("taxRateBps").notNull().default(0),
  outputTaxAccountId: int("outputTaxAccountId").references(() => accountingAccounts.id),
  inputTaxAccountId: int("inputTaxAccountId").references(() => accountingAccounts.id),
  taxMinor: bigint("taxMinor", { mode: "number" }).notNull().default(0),
  totalMinor: bigint("totalMinor", { mode: "number" }).notNull().default(0),
  dueAt: timestamp("dueAt"),
  chequeNumber: varchar("chequeNumber", { length: 80 }),
  note: text("note"),
  createdBy: int("createdBy").notNull().references(() => users.id),
  approvedBy: int("approvedBy").references(() => users.id),
  approvedAt: timestamp("approvedAt"),
  postedAt: timestamp("postedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const accountingDocumentLines = mysqlTable("accounting_document_lines", {
  id: int("id").autoincrement().primaryKey(),
  documentId: int("documentId").notNull().references(() => accountingDocuments.id, { onDelete: "cascade" }),
  variantId: int("variantId").references(() => inventoryVariants.id),
  sourceDocumentLineId: int("sourceDocumentLineId").references((): AnyMySqlColumn => accountingDocumentLines.id),
  description: varchar("description", { length: 255 }).notNull(),
  quantity: int("quantity").notNull().default(1),
  unitPriceMinor: bigint("unitPriceMinor", { mode: "number" }).notNull().default(0),
  discountMinor: bigint("discountMinor", { mode: "number" }).notNull().default(0),
  unitCostUsdMinor: bigint("unitCostUsdMinor", { mode: "number" }),
  lineTotalMinor: bigint("lineTotalMinor", { mode: "number" }).notNull().default(0),
});

export const accountingDocumentSettlements = mysqlTable("accounting_document_settlements", {
  id: int("id").autoincrement().primaryKey(),
  settlementDocumentId: int("settlementDocumentId").notNull().references(() => accountingDocuments.id),
  targetDocumentId: int("targetDocumentId").notNull().references(() => accountingDocuments.id),
  amountMinor: bigint("amountMinor", { mode: "number" }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("uq_settlement_document_target").on(table.settlementDocumentId, table.targetDocumentId)]);

export const accountingPaymentAccounts = mysqlTable("accounting_payment_accounts", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull().references(() => accountingCompanies.id),
  branchId: int("branchId").references(() => accountingBranches.id),
  accountId: int("accountId").notNull().references(() => accountingAccounts.id),
  type: mysqlEnum("type", ["cash", "bank", "cheque"]).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  currencyCode: varchar("currencyCode", { length: 3 }).notNull().default("IQD"),
  isMultiCurrency: boolean("isMultiCurrency").notNull().default(false),
  isActive: boolean("isActive").notNull().default(true),
});

export const accountingCheques = mysqlTable("accounting_cheques", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull().references(() => accountingCompanies.id),
  branchId: int("branchId").notNull().references(() => accountingBranches.id),
  sourceDocumentId: int("sourceDocumentId").notNull().references(() => accountingDocuments.id),
  paymentAccountId: int("paymentAccountId").notNull().references(() => accountingPaymentAccounts.id),
  chequeNumber: varchar("chequeNumber", { length: 80 }).notNull(),
  direction: mysqlEnum("direction", ["received", "issued"]).notNull(),
  amountMinor: bigint("amountMinor", { mode: "number" }).notNull(),
  currencyCode: varchar("currencyCode", { length: 3 }).notNull(),
  exchangeRatePpm: bigint("exchangeRatePpm", { mode: "number" }).notNull(),
  status: mysqlEnum("status", ["pending", "cleared", "bounced"]).notNull().default("pending"),
  clearedJournalEntryId: int("clearedJournalEntryId").references(() => accountingJournalEntries.id),
  bouncedJournalEntryId: int("bouncedJournalEntryId").references(() => accountingJournalEntries.id),
  clearedAt: timestamp("clearedAt"),
  bouncedAt: timestamp("bouncedAt"),
  createdBy: int("createdBy").notNull().references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("uq_cheque_source_document").on(table.sourceDocumentId), uniqueIndex("uq_cheque_company_number_direction").on(table.companyId, table.chequeNumber, table.direction)]);

export const accountingApprovals = mysqlTable("accounting_approvals", {
  id: int("id").autoincrement().primaryKey(),
  entityType: varchar("entityType", { length: 40 }).notNull(),
  entityId: int("entityId").notNull(),
  action: varchar("action", { length: 40 }).notNull(),
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).notNull().default("pending"),
  requestedBy: int("requestedBy").notNull().references(() => users.id),
  decidedBy: int("decidedBy").references(() => users.id),
  reason: text("reason"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  decidedAt: timestamp("decidedAt"),
});

export const accountingRoles = mysqlTable("accounting_roles", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull().references(() => accountingCompanies.id),
  code: varchar("code", { length: 40 }).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  isSystem: boolean("isSystem").notNull().default(false),
});

export const accountingRolePermissions = mysqlTable("accounting_role_permissions", {
  id: int("id").autoincrement().primaryKey(),
  roleId: int("roleId").notNull().references(() => accountingRoles.id, { onDelete: "cascade" }),
  permission: varchar("permission", { length: 100 }).notNull(),
  isAllowed: boolean("isAllowed").notNull().default(true),
});

export const accountingUserRoles = mysqlTable("accounting_user_roles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  roleId: int("roleId").notNull().references(() => accountingRoles.id, { onDelete: "cascade" }),
  branchId: int("branchId").references(() => accountingBranches.id),
  assignedBy: int("assignedBy").notNull().references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const accountingEmployees = mysqlTable("accounting_employees", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull().references(() => accountingCompanies.id),
  branchId: int("branchId").references(() => accountingBranches.id),
  userId: int("userId").references(() => users.id),
  employeeNumber: varchar("employeeNumber", { length: 40 }).notNull(),
  fullName: varchar("fullName", { length: 180 }).notNull(),
  jobTitle: varchar("jobTitle", { length: 120 }),
  monthlySalaryMinor: bigint("monthlySalaryMinor", { mode: "number" }).notNull().default(0),
  salaryCurrencyCode: varchar("salaryCurrencyCode", { length: 3 }).notNull().default("USD"),
  salaryInputMinor: bigint("salaryInputMinor", { mode: "number" }).notNull().default(0),
  salaryExchangeRatePpm: int("salaryExchangeRatePpm").notNull().default(1000000),
  isActive: boolean("isActive").notNull().default(true),
});

export const accountingEmployeeContracts = mysqlTable("accounting_employee_contracts", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull().references(() => accountingCompanies.id),
  employeeId: int("employeeId").notNull().references(() => accountingEmployees.id, { onDelete: "cascade" }),
  contractNumber: varchar("contractNumber", { length: 60 }).notNull(),
  contractType: mysqlEnum("contractType", ["permanent", "fixedTerm", "partTime", "consultant"]).notNull().default("permanent"),
  startsOn: timestamp("startsOn").notNull(),
  endsOn: timestamp("endsOn"),
  baseSalaryMinor: bigint("baseSalaryMinor", { mode: "number" }).notNull().default(0),
  currencyCode: varchar("currencyCode", { length: 3 }).notNull().default("USD"),
  allowancesJson: text("allowancesJson").notNull().default("[]"),
  insuranceRateBps: int("insuranceRateBps").notNull().default(0),
  taxRateBps: int("taxRateBps").notNull().default(0),
  status: mysqlEnum("status", ["draft", "active", "expired", "cancelled"]).notNull().default("active"),
  createdBy: int("createdBy").notNull().references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const accountingEmployeeLeaves = mysqlTable("accounting_employee_leaves", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull().references(() => accountingCompanies.id),
  employeeId: int("employeeId").notNull().references(() => accountingEmployees.id, { onDelete: "cascade" }),
  leaveType: mysqlEnum("leaveType", ["annual", "sick", "unpaid", "maternity", "other"]).notNull().default("annual"),
  startsOn: timestamp("startsOn").notNull(),
  endsOn: timestamp("endsOn").notNull(),
  days: int("days").notNull().default(1),
  status: mysqlEnum("status", ["draft", "pendingApproval", "approved", "rejected"]).notNull().default("draft"),
  note: text("note"),
  createdBy: int("createdBy").notNull().references(() => users.id),
  approvedBy: int("approvedBy").references(() => users.id),
  approvedAt: timestamp("approvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const accountingBudgets = mysqlTable("accounting_budgets", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull().references(() => accountingCompanies.id),
  fiscalPeriodId: int("fiscalPeriodId").notNull().references(() => accountingFiscalPeriods.id),
  accountId: int("accountId").notNull().references(() => accountingAccounts.id),
  budgetMinor: bigint("budgetMinor", { mode: "number" }).notNull().default(0),
  createdBy: int("createdBy").notNull().references(() => users.id),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("uq_budget_company_period_account").on(table.companyId, table.fiscalPeriodId, table.accountId)]);

export const accountingAttendance = mysqlTable("accounting_attendance", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employeeId").notNull().references(() => accountingEmployees.id, { onDelete: "cascade" }),
  workDate: timestamp("workDate").notNull(),
  status: mysqlEnum("status", ["present", "absent", "leave", "holiday"]).notNull().default("present"),
  overtimeMinutes: int("overtimeMinutes").notNull().default(0),
  note: text("note"),
  approvalStatus: mysqlEnum("approvalStatus", ["draft", "pendingApproval", "approved"]).notNull().default("draft"),
  createdBy: int("createdBy").references(() => users.id),
  submittedBy: int("submittedBy").references(() => users.id),
  submittedAt: timestamp("submittedAt"),
  approvedBy: int("approvedBy").references(() => users.id),
  approvedAt: timestamp("approvedAt"),
});

export const accountingPayrollRuns = mysqlTable("accounting_payroll_runs", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull().references(() => accountingCompanies.id),
  branchId: int("branchId").references(() => accountingBranches.id),
  fiscalPeriodId: int("fiscalPeriodId").notNull().references(() => accountingFiscalPeriods.id),
  name: varchar("name", { length: 120 }).notNull(),
  periodStart: timestamp("periodStart").notNull(),
  periodEnd: timestamp("periodEnd").notNull(),
  status: mysqlEnum("status", ["draft", "pendingApproval", "posted", "cancelled"]).notNull().default("draft"),
  createdBy: int("createdBy").notNull().references(() => users.id),
  approvedBy: int("approvedBy").references(() => users.id),
  journalEntryId: int("journalEntryId").references(() => accountingJournalEntries.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const accountingPayrollLines = mysqlTable("accounting_payroll_lines", {
  id: int("id").autoincrement().primaryKey(),
  payrollRunId: int("payrollRunId").notNull().references(() => accountingPayrollRuns.id, { onDelete: "cascade" }),
  employeeId: int("employeeId").notNull().references(() => accountingEmployees.id),
  workingDays: int("workingDays").notNull().default(0),
  overtimeMinutes: int("overtimeMinutes").notNull().default(0),
  overtimeMinor: bigint("overtimeMinor", { mode: "number" }).notNull().default(0),
  allowancesMinor: bigint("allowancesMinor", { mode: "number" }).notNull().default(0),
  grossMinor: bigint("grossMinor", { mode: "number" }).notNull().default(0),
  insuranceMinor: bigint("insuranceMinor", { mode: "number" }).notNull().default(0),
  taxMinor: bigint("taxMinor", { mode: "number" }).notNull().default(0),
  advanceMinor: bigint("advanceMinor", { mode: "number" }).notNull().default(0),
  deductionMinor: bigint("deductionMinor", { mode: "number" }).notNull().default(0),
  netMinor: bigint("netMinor", { mode: "number" }).notNull().default(0),
});

export const accountingInternalSecuritySettings = mysqlTable("accounting_internal_security_settings", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull().references(() => accountingCompanies.id),
  mfaMode: mysqlEnum("mfaMode", ["disabled", "totp", "email"]).notNull().default("disabled"),
  sessionDurationMinutes: int("sessionDurationMinutes").notNull().default(1440),
  maxFailedAttempts: int("maxFailedAttempts").notNull().default(5),
  updatedBy: int("updatedBy").notNull().references(() => users.id),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("uq_internal_security_company").on(table.companyId)]);

export const accountingInternalSessions = mysqlTable("accounting_internal_sessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: varchar("tokenHash", { length: 128 }).notNull(),
  ipAddress: varchar("ipAddress", { length: 64 }),
  userAgent: varchar("userAgent", { length: 512 }),
  expiresAt: timestamp("expiresAt").notNull(),
  revokedAt: timestamp("revokedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("uq_internal_session_token").on(table.tokenHash)]);

export const accountingMfaChallenges = mysqlTable("accounting_mfa_challenges", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  mode: mysqlEnum("mode", ["totp", "email"]).notNull(),
  challengeTokenHash: varchar("challengeTokenHash", { length: 128 }).notNull(),
  codeHash: varchar("codeHash", { length: 128 }),
  expiresAt: timestamp("expiresAt").notNull(),
  consumedAt: timestamp("consumedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("uq_mfa_challenge_token").on(table.challengeTokenHash)]);

/** Tracks failed login attempts per username for DB-backed brute-force protection. */
export const accountingInternalLoginAttempts = mysqlTable("accounting_internal_login_attempts", {
  id: int("id").autoincrement().primaryKey(),
  username: varchar("username", { length: 64 }).notNull(),
  ipAddress: varchar("ipAddress", { length: 64 }),
  attemptedAt: timestamp("attemptedAt").defaultNow().notNull(),
}, table => [
  // Index for fast lookup of recent failures per username.
  uniqueIndex("uq_login_attempts_username_ip").on(table.username, table.ipAddress),
]);

export const accountingAuditEvents = mysqlTable("accounting_audit_events", {
  id: int("id").autoincrement().primaryKey(),
  entityType: varchar("entityType", { length: 40 }).notNull(),
  entityId: int("entityId").notNull(),
  action: varchar("action", { length: 60 }).notNull(),
  beforeJson: text("beforeJson"),
  afterJson: text("afterJson"),
  reason: text("reason"),
  performedBy: int("performedBy").notNull().references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const accountingAuditEventArchive = mysqlTable("accounting_audit_event_archive", {
  id: int("id").autoincrement().primaryKey(),
  originalEventId: int("originalEventId").notNull(),
  entityType: varchar("entityType", { length: 40 }).notNull(),
  entityId: int("entityId").notNull(),
  action: varchar("action", { length: 60 }).notNull(),
  beforeJson: text("beforeJson"),
  afterJson: text("afterJson"),
  reason: text("reason"),
  performedBy: int("performedBy").notNull().references(() => users.id),
  createdAt: timestamp("createdAt").notNull(),
  archivedBy: int("archivedBy").notNull().references(() => users.id),
  archivedAt: timestamp("archivedAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
});

export const accountingWarehouseVariantBalances = mysqlTable("accounting_warehouse_variant_balances", {
  id: int("id").autoincrement().primaryKey(),
  warehouseId: int("warehouseId").notNull().references(() => accountingWarehouses.id, { onDelete: "cascade" }),
  variantId: int("variantId").notNull().references(() => inventoryVariants.id, { onDelete: "cascade" }),
  quantity: int("quantity").notNull().default(0),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("uq_wh_variant").on(table.warehouseId, table.variantId)]);

export type AccountingAccount = typeof accountingAccounts.$inferSelect;
export type AccountingJournalEntry = typeof accountingJournalEntries.$inferSelect;
export type AccountingDocument = typeof accountingDocuments.$inferSelect;
