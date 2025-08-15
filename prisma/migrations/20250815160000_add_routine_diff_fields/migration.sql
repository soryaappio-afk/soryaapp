-- Add diff metadata columns to Routine
ALTER TABLE
    `Routine`
ADD
    COLUMN `createdFiles` JSON NULL;

ALTER TABLE
    `Routine`
ADD
    COLUMN `updatedFiles` JSON NULL;

ALTER TABLE
    `Routine`
ADD
    COLUMN `deletedFiles` JSON NULL;