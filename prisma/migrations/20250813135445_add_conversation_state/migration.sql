-- CreateTable
CREATE TABLE `ProjectConversationState` (
    `projectId` VARCHAR(191) NOT NULL,
    `summary` TEXT NULL,
    `summaryTokens` INTEGER NOT NULL DEFAULT 0,
    `totalMessages` INTEGER NOT NULL DEFAULT 0,
    `lastSummarizedMessageId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`projectId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ProjectConversationState` ADD CONSTRAINT `ProjectConversationState_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
