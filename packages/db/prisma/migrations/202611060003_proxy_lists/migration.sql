-- Proxy-Seller residential lists prepared per market and ISP.
CREATE TABLE "ProxyList" (
    "id" TEXT NOT NULL,
    "psListId" INTEGER NOT NULL,
    "region" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "isp" TEXT NOT NULL,
    "rotation" INTEGER NOT NULL,
    "host" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "ports" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProxyList_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProxyList_psListId_key" ON "ProxyList"("psListId");
CREATE UNIQUE INDEX "ProxyList_region_city_isp_rotation_key" ON "ProxyList"("region", "city", "isp", "rotation");

CREATE TABLE "ProxyMarket" (
    "key" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "isps" JSONB NOT NULL,
    "refreshedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProxyMarket_pkey" PRIMARY KEY ("key")
);

ALTER TABLE "DevicePool" ADD COLUMN "proxyListId" TEXT;
ALTER TABLE "GridScan" ADD COLUMN "ispMode" TEXT NOT NULL DEFAULT 'any';
ALTER TABLE "GridScan" ADD COLUMN "isps" JSONB;
ALTER TABLE "GridScan" ADD COLUMN "proxyRegion" TEXT;
ALTER TABLE "GridScan" ADD COLUMN "proxyCity" TEXT;
ALTER TABLE "GridPin" ADD COLUMN "isp" TEXT;
