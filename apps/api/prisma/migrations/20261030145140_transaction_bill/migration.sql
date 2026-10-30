-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "billId" TEXT;

-- CreateIndex
CREATE INDEX "Transaction_billId_idx" ON "Transaction"("billId");
