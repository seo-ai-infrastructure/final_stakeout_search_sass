-- A rival's Google posts, collected after its listing: the task that was asked for, and its answer.
-- Three new columns, all optional: nothing existing changes.
ALTER TABLE "RivalProfile" ADD COLUMN "postsTask" TEXT, ADD COLUMN "posts" JSONB, ADD COLUMN "postsAt" TIMESTAMP(3);
