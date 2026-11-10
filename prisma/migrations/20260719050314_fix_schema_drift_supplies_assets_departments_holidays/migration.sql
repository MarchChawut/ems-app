-- ⚠️ คำเตือนสำคัญก่อนใช้กับฐานข้อมูล production ⚠️
-- Migration นี้แก้ schema drift ที่มีอยู่เดิม (ตารางและคอลัมน์ในไฟล์นี้มีอยู่จริงใน
-- production DB แล้ว แต่ไม่เคยถูกบันทึกใน migration history) โดยรันกับฐานข้อมูลทดสอบ
-- ที่สร้างใหม่จาก schema ว่างเปล่า SQL ด้านล่างจึงรันผ่านได้ปกติ
--
-- ห้ามรัน `prisma migrate deploy` ตรงๆ กับ production เพราะคำสั่งจะพยายาม
-- ALTER TABLE / CREATE TABLE ทับของที่มีอยู่แล้ว → จะ error (1060/"table already exists")
-- และทำให้ deploy หยุดกลางคัน
--
-- ขั้นตอนที่ถูกต้องสำหรับ production: mark migration นี้ว่า "applied" โดยไม่รัน SQL จริง
--   npx prisma migrate resolve --applied 20260719050314_fix_schema_drift_supplies_assets_departments_holidays
--
-- ก่อนทำแบบนั้น ให้เช็คก่อนว่า production ไม่มีค่า fiscalYear ซ้ำกันใน leave_rules
-- (unique index ด้านล่างจะ fail ถ้ามีค่าซ้ำ):
--   SELECT fiscalYear, COUNT(*) FROM leave_rules WHERE fiscalYear IS NOT NULL
--   GROUP BY fiscalYear HAVING COUNT(*) > 1;

-- AlterTable
ALTER TABLE `leave_rules` ADD COLUMN `fiscalYear` INTEGER NULL,
    ADD COLUMN `halfDayFraction` DOUBLE NOT NULL DEFAULT 0.5,
    ADD COLUMN `hourThreshold` DOUBLE NOT NULL DEFAULT 3;

-- AlterTable
ALTER TABLE `tasks` ADD COLUMN `reminderDayBeforeAt` DATETIME(3) NULL,
    ADD COLUMN `reminderDayBeforeSentAt` DATETIME(3) NULL,
    ADD COLUMN `reminderOnDayAt` DATETIME(3) NULL,
    ADD COLUMN `reminderOnDaySentAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `users` ADD COLUMN `prefix` VARCHAR(50) NULL,
    ADD COLUMN `profileImage` VARCHAR(500) NULL,
    MODIFY `role` ENUM('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'DIRECTOR', 'EMPLOYEE', 'HR') NOT NULL DEFAULT 'EMPLOYEE';

-- CreateTable
CREATE TABLE `departments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `description` VARCHAR(255) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `order` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `departments_name_key`(`name`),
    INDEX `departments_isActive_order_idx`(`isActive`, `order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `holidays` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `date` DATE NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `description` VARCHAR(500) NULL,
    `year` INTEGER NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `holidays_year_isActive_idx`(`year`, `isActive`),
    UNIQUE INDEX `holidays_date_key`(`date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `supply_categories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `description` VARCHAR(255) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `order` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `supply_categories_name_key`(`name`),
    INDEX `supply_categories_isActive_order_idx`(`isActive`, `order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `supplies` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(200) NOT NULL,
    `type` ENUM('STOCK', 'NON_STOCK') NOT NULL,
    `categoryId` INTEGER NULL,
    `supplyCode` VARCHAR(100) NULL,
    `unit` VARCHAR(50) NULL,
    `currentQuantity` INTEGER NOT NULL DEFAULT 0,
    `minimumQuantity` INTEGER NOT NULL DEFAULT 0,
    `maximumQuantity` INTEGER NOT NULL DEFAULT 0,
    `thresholdRed` INTEGER NOT NULL DEFAULT 20,
    `thresholdYellow` INTEGER NOT NULL DEFAULT 50,
    `supplier` VARCHAR(200) NULL,
    `unitPrice` DECIMAL(12, 2) NULL,
    `documentNumber` VARCHAR(100) NULL,
    `documentUrl` VARCHAR(500) NULL,
    `imageUrl` VARCHAR(500) NULL,
    `issueDate` DATE NULL,
    `recorderName` VARCHAR(200) NULL,
    `notes` TEXT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `supplies_type_isActive_idx`(`type`, `isActive`),
    INDEX `supplies_categoryId_idx`(`categoryId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `supply_transactions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `supplyId` INTEGER NOT NULL,
    `type` ENUM('RECEIVE', 'ISSUE', 'RETURN', 'ADJUST') NOT NULL,
    `quantity` INTEGER NOT NULL,
    `quantityBefore` INTEGER NOT NULL,
    `quantityAfter` INTEGER NOT NULL,
    `documentNumber` VARCHAR(100) NULL,
    `documentUrl` VARCHAR(500) NULL,
    `recipientName` VARCHAR(200) NULL,
    `returnerName` VARCHAR(200) NULL,
    `returnReceiverName` VARCHAR(200) NULL,
    `adjusterName` VARCHAR(200) NULL,
    `notes` TEXT NULL,
    `performedById` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `supply_transactions_supplyId_createdAt_idx`(`supplyId`, `createdAt`),
    INDEX `supply_transactions_performedById_idx`(`performedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `asset_categories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `description` VARCHAR(255) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `order` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `asset_categories_name_key`(`name`),
    INDEX `asset_categories_isActive_order_idx`(`isActive`, `order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `assets` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(200) NOT NULL,
    `assetTag` VARCHAR(50) NULL,
    `serialNumber` VARCHAR(100) NULL,
    `model` VARCHAR(100) NULL,
    `brand` VARCHAR(100) NULL,
    `categoryId` INTEGER NULL,
    `status` ENUM('AVAILABLE', 'IN_USE', 'IN_REPAIR', 'RETURNED', 'DISPOSED') NOT NULL DEFAULT 'AVAILABLE',
    `condition` ENUM('EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'DAMAGED') NOT NULL DEFAULT 'GOOD',
    `currentHolderId` INTEGER NULL,
    `acquisitionDate` DATE NULL,
    `acquisitionCost` DECIMAL(12, 2) NULL,
    `documentNumber` VARCHAR(100) NULL,
    `documentUrl` VARCHAR(500) NULL,
    `location` VARCHAR(200) NULL,
    `department` VARCHAR(100) NULL,
    `imageUrl` VARCHAR(500) NULL,
    `notes` TEXT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `receiverName` VARCHAR(200) NULL,
    `lastInspectionDate` DATE NULL,
    `lastInspectionCondition` ENUM('EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'DAMAGED') NULL,
    `lastInspectedBy` VARCHAR(200) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `assets_assetTag_key`(`assetTag`),
    INDEX `assets_status_isActive_idx`(`status`, `isActive`),
    INDEX `assets_categoryId_idx`(`categoryId`),
    INDEX `assets_currentHolderId_idx`(`currentHolderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `asset_checkouts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `assetId` INTEGER NOT NULL,
    `holderId` INTEGER NOT NULL,
    `issuedById` INTEGER NOT NULL,
    `checkedOutAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `returnedAt` DATETIME(3) NULL,
    `expectedReturnAt` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `asset_checkouts_assetId_returnedAt_idx`(`assetId`, `returnedAt`),
    INDEX `asset_checkouts_holderId_idx`(`holderId`),
    INDEX `asset_checkouts_issuedById_idx`(`issuedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `leave_rules_fiscalYear_key` ON `leave_rules`(`fiscalYear`);

-- AddForeignKey
ALTER TABLE `supplies` ADD CONSTRAINT `supplies_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `supply_categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `supply_transactions` ADD CONSTRAINT `supply_transactions_supplyId_fkey` FOREIGN KEY (`supplyId`) REFERENCES `supplies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `supply_transactions` ADD CONSTRAINT `supply_transactions_performedById_fkey` FOREIGN KEY (`performedById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assets` ADD CONSTRAINT `assets_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `asset_categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assets` ADD CONSTRAINT `assets_currentHolderId_fkey` FOREIGN KEY (`currentHolderId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `asset_checkouts` ADD CONSTRAINT `asset_checkouts_assetId_fkey` FOREIGN KEY (`assetId`) REFERENCES `assets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `asset_checkouts` ADD CONSTRAINT `asset_checkouts_holderId_fkey` FOREIGN KEY (`holderId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `asset_checkouts` ADD CONSTRAINT `asset_checkouts_issuedById_fkey` FOREIGN KEY (`issuedById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

