/*
  Warnings:

  - You are about to drop the column `status` on the `tasks` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX `tasks_status_idx` ON `tasks`;

-- AlterTable
ALTER TABLE `tasks` DROP COLUMN `status`,
    ADD COLUMN `columnId` INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE `kanban_columns` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(50) NOT NULL,
    `color` VARCHAR(20) NOT NULL DEFAULT 'slate',
    `order` INTEGER NOT NULL DEFAULT 0,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `kanban_columns_order_idx`(`order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `tasks_columnId_idx` ON `tasks`(`columnId`);

-- AddForeignKey
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_columnId_fkey` FOREIGN KEY (`columnId`) REFERENCES `kanban_columns`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
