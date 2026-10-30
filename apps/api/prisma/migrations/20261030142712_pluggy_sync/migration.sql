-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "availableCreditCents" BIGINT,
ADD COLUMN     "closeDate" TIMESTAMP(3),
ADD COLUMN     "creditLimitCents" BIGINT,
ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "itemId" TEXT,
ADD COLUMN     "number" TEXT,
ADD COLUMN     "subtype" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "categoryLocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "installmentNumber" INTEGER,
ADD COLUMN     "merchant" TEXT,
ADD COLUMN     "pluggyCategory" TEXT,
ADD COLUMN     "status" TEXT,
ADD COLUMN     "totalInstallments" INTEGER;

-- CreateTable
CREATE TABLE "PluggyItem" (
    "id" TEXT NOT NULL,
    "connectorName" TEXT NOT NULL DEFAULT '',
    "connectorImage" TEXT,
    "status" TEXT NOT NULL DEFAULT '',
    "executionStatus" TEXT NOT NULL DEFAULT '',
    "errorMessage" TEXT,
    "consentExpiresAt" TIMESTAMP(3),
    "lastUpdatedAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PluggyItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditCardBill" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "totalAmountCents" BIGINT NOT NULL,
    "minimumPaymentCents" BIGINT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditCardBill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Investment" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subtype" TEXT,
    "balanceCents" BIGINT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Investment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "eventId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "itemId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("eventId")
);

-- CreateIndex
CREATE INDEX "CreditCardBill_accountId_dueDate_idx" ON "CreditCardBill"("accountId", "dueDate");

-- CreateIndex
CREATE INDEX "Transaction_accountId_localDate_idx" ON "Transaction"("accountId", "localDate");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "PluggyItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCardBill" ADD CONSTRAINT "CreditCardBill_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Investment" ADD CONSTRAINT "Investment_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "PluggyItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
