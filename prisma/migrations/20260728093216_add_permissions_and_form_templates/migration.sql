-- AlterTable
ALTER TABLE `form_requests` ADD COLUMN `approvedAt` DATETIME(3) NULL,
    ADD COLUMN `approvedBy` INTEGER NULL,
    ADD COLUMN `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NULL,
    ADD COLUMN `templateId` INTEGER NULL;

-- CreateTable
CREATE TABLE `form_templates` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `systemKey` VARCHAR(50) NULL,
    `menuTitle` VARCHAR(200) NOT NULL,
    `documentTitle` VARCHAR(300) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `order` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `form_templates_systemKey_key`(`systemKey`),
    INDEX `form_templates_isActive_order_idx`(`isActive`, `order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `form_template_fields` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `templateId` INTEGER NOT NULL,
    `key` VARCHAR(100) NOT NULL,
    `label` VARCHAR(200) NOT NULL,
    `inputType` VARCHAR(20) NOT NULL DEFAULT 'text',
    `required` BOOLEAN NOT NULL DEFAULT false,
    `order` INTEGER NOT NULL DEFAULT 0,
    `options` JSON NULL,

    INDEX `form_template_fields_templateId_order_idx`(`templateId`, `order`),
    UNIQUE INDEX `form_template_fields_templateId_key_key`(`templateId`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `role_permissions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `role` ENUM('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'DIRECTOR', 'EMPLOYEE', 'HR') NOT NULL,
    `permissionKey` VARCHAR(100) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `role_permissions_role_idx`(`role`),
    UNIQUE INDEX `role_permissions_role_permissionKey_key`(`role`, `permissionKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_permissions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `permissionKey` VARCHAR(100) NOT NULL,
    `granted` BOOLEAN NOT NULL DEFAULT true,
    `grantedById` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `user_permissions_userId_idx`(`userId`),
    UNIQUE INDEX `user_permissions_userId_permissionKey_key`(`userId`, `permissionKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `form_requests_templateId_idx` ON `form_requests`(`templateId`);

-- CreateIndex
CREATE INDEX `form_requests_status_idx` ON `form_requests`(`status`);

-- AddForeignKey
ALTER TABLE `form_requests` ADD CONSTRAINT `form_requests_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `form_templates`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `form_template_fields` ADD CONSTRAINT `form_template_fields_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `form_templates`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_permissions` ADD CONSTRAINT `user_permissions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_permissions` ADD CONSTRAINT `user_permissions_grantedById_fkey` FOREIGN KEY (`grantedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

