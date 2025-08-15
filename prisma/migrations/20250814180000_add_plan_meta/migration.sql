-- Add planMeta JSON column to ProjectSnapshot
ALTER TABLE
    ProjectSnapshot
ADD
    COLUMN planMeta JSON NULL;