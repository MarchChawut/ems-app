-- AlterTable
ALTER TABLE `users` ADD COLUMN `signatureFileId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `leaves` ADD COLUMN `signaturePlacement` JSON NULL;
