-- CreateTable
CREATE TABLE "SavedBusiness" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "centerLabel" TEXT NOT NULL DEFAULT '',
    "centerLat" DOUBLE PRECISION NOT NULL,
    "centerLng" DOUBLE PRECISION NOT NULL,
    "keywords" TEXT[],
    "targetType" TEXT NOT NULL DEFAULT 'mobile_chrome',
    "gridSize" INTEGER NOT NULL DEFAULT 7,
    "spacingKm" DOUBLE PRECISION NOT NULL DEFAULT 1.60934,
    "ispMode" TEXT NOT NULL DEFAULT 'any',
    "isps" TEXT[],
    "trackAiOverviews" BOOLEAN NOT NULL DEFAULT false,
    "scheduleType" TEXT NOT NULL DEFAULT 'once',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedBusiness_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedBusiness_userId_idx" ON "SavedBusiness"("userId");

-- AddForeignKey
ALTER TABLE "SavedBusiness" ADD CONSTRAINT "SavedBusiness_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
