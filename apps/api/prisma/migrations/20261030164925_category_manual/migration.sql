-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "categoryManual" BOOLEAN NOT NULL DEFAULT false;

-- Até aqui categoryLocked só era marcado por escolha manual na própria transação
UPDATE "Transaction" SET "categoryManual" = "categoryLocked";
