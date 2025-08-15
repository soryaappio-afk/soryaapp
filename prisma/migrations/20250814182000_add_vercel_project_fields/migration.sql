-- Add Vercel project identification fields to Project
ALTER TABLE
    `Project`
ADD
    COLUMN `vercelProjectId` VARCHAR(191) NULL,
ADD
    COLUMN `vercelProjectSlug` VARCHAR(191) NULL;