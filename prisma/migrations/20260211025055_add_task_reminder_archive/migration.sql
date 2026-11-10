-- AlterTable
ALTER TABLE `tasks` ADD COLUMN `archivedAt` DATETIME(3) NULL,
    ADD COLUMN `reminderAt` DATETIME(3) NULL;
