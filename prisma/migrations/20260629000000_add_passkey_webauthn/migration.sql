-- CreateTable
CREATE TABLE `authenticators` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `credentialId` VARCHAR(255) NOT NULL,
    `publicKey` TEXT NOT NULL,
    `counter` INTEGER NOT NULL DEFAULT 0,
    `transports` VARCHAR(255) NULL,
    `deviceType` VARCHAR(32) NULL,
    `backedUp` BOOLEAN NOT NULL DEFAULT false,
    `name` VARCHAR(100) NULL,
    `userId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastUsedAt` DATETIME(3) NULL,

    UNIQUE INDEX `authenticators_credentialId_key`(`credentialId`),
    INDEX `authenticators_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `webauthn_challenges` (
    `id` VARCHAR(191) NOT NULL,
    `challenge` VARCHAR(255) NOT NULL,
    `userId` INTEGER NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `webauthn_challenges_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `authenticators` ADD CONSTRAINT `authenticators_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
