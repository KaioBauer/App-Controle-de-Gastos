-- AlterTable
ALTER TABLE "User" ADD COLUMN     "appLock" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "lockedAt" TIMESTAMP(3);

-- Quem já cadastrou Face ID passa a ter o bloqueio ligado
UPDATE "User" SET "appLock" = true WHERE "id" IN (SELECT "userId" FROM "Passkey");
