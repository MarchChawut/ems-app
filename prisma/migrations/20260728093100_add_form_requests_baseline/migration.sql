-- Baseline migration: makes the `form_requests` table + `FormRequestType` enum
-- part of the tracked migration history.
--
-- This table was created directly against the database (e.g. via `prisma db push`
-- during earlier development) without ever going through `prisma migrate`, so no
-- migration file previously created it. Migration 20260728093216 (which alters
-- this table) would otherwise be un-replayable against an empty database.
--
-- On existing databases (dev/prod) this migration is marked as already-applied
-- via `prisma migrate resolve --applied` rather than executed, since the table
-- already exists there. It only actually runs on a fresh database.

-- CreateTable
CREATE TABLE `form_requests` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `type` ENUM('VEHICLE_REQUEST', 'REFRESHMENT_REQUEST', 'MEETING_ROOM_REQUEST', 'SPEAKER_REQUEST') NOT NULL,
    `requestDate` DATE NOT NULL,
    `documentNumber` VARCHAR(100) NULL,
    `data` JSON NOT NULL,
    `requestedById` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `form_requests_type_requestDate_idx`(`type`, `requestDate`),
    INDEX `form_requests_requestedById_idx`(`requestedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `form_requests` ADD CONSTRAINT `form_requests_requestedById_fkey` FOREIGN KEY (`requestedById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
