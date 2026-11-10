-- CreateTable
CREATE TABLE `document_registers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `date` DATE NOT NULL,
    `subject` VARCHAR(500) NOT NULL,
    `direction` ENUM('RECEIVE', 'SEND') NOT NULL,
    `documentNumber` VARCHAR(100) NULL,
    `recipientName` VARCHAR(200) NULL,
    `senderName` VARCHAR(200) NULL,
    `remarks` TEXT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `recordedById` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `document_registers_direction_date_idx`(`direction`, `date`),
    INDEX `document_registers_isActive_date_idx`(`isActive`, `date`),
    INDEX `document_registers_recordedById_idx`(`recordedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `document_registers` ADD CONSTRAINT `document_registers_recordedById_fkey` FOREIGN KEY (`recordedById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

