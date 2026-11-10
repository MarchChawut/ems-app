-- CreateTable
CREATE TABLE `roster_assignments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `category` ENUM('DUTY', 'OFFICIAL_TRIP', 'MEETING', 'TRAINING', 'EVENT', 'OTHER') NOT NULL DEFAULT 'OTHER',
    `location` VARCHAR(255) NULL,
    `startDate` DATE NOT NULL,
    `endDate` DATE NOT NULL,
    `startTime` VARCHAR(5) NULL,
    `endTime` VARCHAR(5) NULL,
    `note` TEXT NULL,
    `createdById` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `roster_assignments_userId_startDate_idx`(`userId`, `startDate`),
    INDEX `roster_assignments_startDate_endDate_idx`(`startDate`, `endDate`),
    INDEX `roster_assignments_createdById_idx`(`createdById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `roster_assignments` ADD CONSTRAINT `roster_assignments_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `roster_assignments` ADD CONSTRAINT `roster_assignments_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
