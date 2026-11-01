-- CreateTable
CREATE TABLE "PluggyCredential" (
    "userId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "secretEnc" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PluggyCredential_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "PluggyCredential" ADD CONSTRAINT "PluggyCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
