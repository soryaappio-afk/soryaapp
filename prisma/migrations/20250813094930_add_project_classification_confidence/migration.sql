-- AlterTable
ALTER TABLE `Project` ADD COLUMN `typeConfidence` DOUBLE NULL,
    ADD COLUMN `typeManualOverride` BOOLEAN NOT NULL DEFAULT false;
