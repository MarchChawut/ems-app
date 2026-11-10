-- AlterTable
ALTER TABLE `leaves` ADD COLUMN `supervisorApprovedAt` DATETIME(3) NULL,
    ADD COLUMN `supervisorApprovedBy` INTEGER NULL,
    MODIFY `status` ENUM('PENDING', 'SUPERVISOR_APPROVED', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE `users` ADD COLUMN `supervisorId` INTEGER NULL;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_supervisorId_fkey` FOREIGN KEY (`supervisorId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
