-- CreateTable
CREATE TABLE `cron_locks` (
    `name` VARCHAR(64) NOT NULL,
    `lockedAt` DATETIME(3) NULL,
    `lockedBy` VARCHAR(128) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cron_execution_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `jobName` VARCHAR(64) NOT NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finishedAt` DATETIME(3) NULL,
    `status` VARCHAR(16) NOT NULL,
    `checked` INTEGER NOT NULL DEFAULT 0,
    `sent` INTEGER NOT NULL DEFAULT 0,
    `failed` INTEGER NOT NULL DEFAULT 0,
    `error` TEXT NULL,

    INDEX `cron_execution_logs_jobName_startedAt_idx`(`jobName`, `startedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

