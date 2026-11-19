-- The AI citations checklist: what an account did about each job (so it carries from scan to
-- scan), and what a look at each cited page found. Two new tables: nothing existing changes.
CREATE TABLE "AioTaskState" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "business" TEXT NOT NULL,
  "target" TEXT NOT NULL,
  "playbook" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "originScanId" TEXT,
  "verifiedScanId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AioTaskState_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AioTaskState_userId_business_target_playbook_key" ON "AioTaskState"("userId", "business", "target", "playbook");

CREATE TABLE "AioPageCheck" (
  "id" TEXT NOT NULL,
  "scanId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "present" BOOLEAN,
  "competitors" INTEGER NOT NULL DEFAULT 0,
  "note" TEXT NOT NULL,
  "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AioPageCheck_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AioPageCheck_scanId_url_key" ON "AioPageCheck"("scanId", "url");
