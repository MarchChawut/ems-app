-- AlterTable
ALTER TABLE `tasks` ADD COLUMN `folderId` INTEGER NULL;

-- CreateTable
CREATE TABLE `task_folders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `task_folders_order_idx`(`order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `tasks_folderId_idx` ON `tasks`(`folderId`);

-- AddForeignKey
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_folderId_fkey` FOREIGN KEY (`folderId`) REFERENCES `task_folders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
