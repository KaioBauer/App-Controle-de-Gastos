-- Cada usuário passa a ter os próprios dados. Tudo o que já existe pertence ao primeiro usuário
-- criado (o dono do app até aqui). Num banco sem usuário, as linhas avulsas (categorias e conta
-- "Dinheiro" criadas na subida) são descartadas: voltam a ser criadas para cada usuário.

CREATE TEMP TABLE "_owner" AS SELECT "id" FROM "User" ORDER BY "createdAt" ASC LIMIT 1;

-- DropIndex
DROP INDEX "Category_name_key";
DROP INDEX "CategoryRule_pattern_key";
DROP INDEX "NotificationOutbox_dedupeKey_key";

-- Coluna do dono, preenchida com o primeiro usuário
ALTER TABLE "PushSubscription" ADD COLUMN "userId" TEXT;
ALTER TABLE "Category" ADD COLUMN "userId" TEXT;
ALTER TABLE "CategoryRule" ADD COLUMN "userId" TEXT;
ALTER TABLE "PluggyItem" ADD COLUMN "userId" TEXT;
ALTER TABLE "Account" ADD COLUMN "userId" TEXT;
ALTER TABLE "CreditCardBill" ADD COLUMN "userId" TEXT;
ALTER TABLE "Investment" ADD COLUMN "userId" TEXT;
ALTER TABLE "Goal" ADD COLUMN "userId" TEXT;
ALTER TABLE "GoalContribution" ADD COLUMN "userId" TEXT;
ALTER TABLE "Bill" ADD COLUMN "userId" TEXT;
ALTER TABLE "BillPayment" ADD COLUMN "userId" TEXT;
ALTER TABLE "DismissedSuggestion" ADD COLUMN "userId" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "userId" TEXT;
ALTER TABLE "Budget" ADD COLUMN "userId" TEXT;
ALTER TABLE "NotificationSettings" ADD COLUMN "userId" TEXT;
ALTER TABLE "NotificationOutbox" ADD COLUMN "userId" TEXT;

UPDATE "PushSubscription" SET "userId" = (SELECT "id" FROM "_owner");
UPDATE "Category" SET "userId" = (SELECT "id" FROM "_owner");
UPDATE "CategoryRule" SET "userId" = (SELECT "id" FROM "_owner");
UPDATE "PluggyItem" SET "userId" = (SELECT "id" FROM "_owner");
UPDATE "Account" SET "userId" = (SELECT "id" FROM "_owner");
UPDATE "CreditCardBill" SET "userId" = (SELECT "id" FROM "_owner");
UPDATE "Investment" SET "userId" = (SELECT "id" FROM "_owner");
UPDATE "Goal" SET "userId" = (SELECT "id" FROM "_owner");
UPDATE "GoalContribution" SET "userId" = (SELECT "id" FROM "_owner");
UPDATE "Bill" SET "userId" = (SELECT "id" FROM "_owner");
UPDATE "BillPayment" SET "userId" = (SELECT "id" FROM "_owner");
UPDATE "DismissedSuggestion" SET "userId" = (SELECT "id" FROM "_owner");
UPDATE "Transaction" SET "userId" = (SELECT "id" FROM "_owner");
UPDATE "Budget" SET "userId" = (SELECT "id" FROM "_owner");
UPDATE "NotificationSettings" SET "userId" = (SELECT "id" FROM "_owner");
UPDATE "NotificationOutbox" SET "userId" = (SELECT "id" FROM "_owner");

-- Sem usuário não há dono: as linhas avulsas saem (filhas antes das mães)
DELETE FROM "BillPayment" WHERE "userId" IS NULL;
DELETE FROM "GoalContribution" WHERE "userId" IS NULL;
DELETE FROM "Transaction" WHERE "userId" IS NULL;
DELETE FROM "CreditCardBill" WHERE "userId" IS NULL;
DELETE FROM "Account" WHERE "userId" IS NULL;
DELETE FROM "Investment" WHERE "userId" IS NULL;
DELETE FROM "PluggyItem" WHERE "userId" IS NULL;
DELETE FROM "Budget" WHERE "userId" IS NULL;
DELETE FROM "CategoryRule" WHERE "userId" IS NULL;
DELETE FROM "Bill" WHERE "userId" IS NULL;
DELETE FROM "Category" WHERE "userId" IS NULL;
DELETE FROM "Goal" WHERE "userId" IS NULL;
DELETE FROM "DismissedSuggestion" WHERE "userId" IS NULL;
DELETE FROM "PushSubscription" WHERE "userId" IS NULL;
DELETE FROM "NotificationSettings" WHERE "userId" IS NULL;
DELETE FROM "NotificationOutbox" WHERE "userId" IS NULL;

ALTER TABLE "PushSubscription" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Category" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "CategoryRule" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "PluggyItem" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Account" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "CreditCardBill" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Investment" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Goal" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "GoalContribution" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Bill" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "BillPayment" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "DismissedSuggestion" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Transaction" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Budget" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "NotificationSettings" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "NotificationOutbox" ALTER COLUMN "userId" SET NOT NULL;

-- Sugestão dispensada: id próprio, chave única por usuário
ALTER TABLE "DismissedSuggestion" DROP CONSTRAINT "DismissedSuggestion_pkey";
ALTER TABLE "DismissedSuggestion" ADD COLUMN "id" TEXT;
UPDATE "DismissedSuggestion" SET "id" = gen_random_uuid()::text;
ALTER TABLE "DismissedSuggestion" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "DismissedSuggestion" ADD CONSTRAINT "DismissedSuggestion_pkey" PRIMARY KEY ("id");

-- Preferências de notificação: uma linha por usuário
ALTER TABLE "NotificationSettings" DROP CONSTRAINT "NotificationSettings_pkey";
ALTER TABLE "NotificationSettings" DROP COLUMN "id";
ALTER TABLE "NotificationSettings" ADD CONSTRAINT "NotificationSettings_pkey" PRIMARY KEY ("userId");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");
CREATE UNIQUE INDEX "Category_userId_name_key" ON "Category"("userId", "name");
CREATE UNIQUE INDEX "CategoryRule_userId_pattern_key" ON "CategoryRule"("userId", "pattern");
CREATE INDEX "PluggyItem_userId_idx" ON "PluggyItem"("userId");
CREATE INDEX "Account_userId_idx" ON "Account"("userId");
CREATE INDEX "CreditCardBill_userId_idx" ON "CreditCardBill"("userId");
CREATE INDEX "Investment_userId_idx" ON "Investment"("userId");
CREATE INDEX "Goal_userId_idx" ON "Goal"("userId");
CREATE INDEX "GoalContribution_userId_idx" ON "GoalContribution"("userId");
CREATE INDEX "Bill_userId_idx" ON "Bill"("userId");
CREATE INDEX "BillPayment_userId_idx" ON "BillPayment"("userId");
CREATE UNIQUE INDEX "DismissedSuggestion_userId_matchKey_key" ON "DismissedSuggestion"("userId", "matchKey");
CREATE INDEX "Transaction_userId_idx" ON "Transaction"("userId");
CREATE INDEX "Budget_userId_idx" ON "Budget"("userId");
CREATE UNIQUE INDEX "NotificationOutbox_userId_dedupeKey_key" ON "NotificationOutbox"("userId", "dedupeKey");

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Category" ADD CONSTRAINT "Category_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CategoryRule" ADD CONSTRAINT "CategoryRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PluggyItem" ADD CONSTRAINT "PluggyItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreditCardBill" ADD CONSTRAINT "CreditCardBill_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Investment" ADD CONSTRAINT "Investment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GoalContribution" ADD CONSTRAINT "GoalContribution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BillPayment" ADD CONSTRAINT "BillPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DismissedSuggestion" ADD CONSTRAINT "DismissedSuggestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationSettings" ADD CONSTRAINT "NotificationSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationOutbox" ADD CONSTRAINT "NotificationOutbox_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP TABLE "_owner";
