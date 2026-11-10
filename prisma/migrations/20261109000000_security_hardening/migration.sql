-- AlterTable: การตั้งค่าความปลอดภัยครั้งแรก (บังคับเปลี่ยนรหัสผ่าน/ลงทะเบียน passkey)
ALTER TABLE `users` ADD COLUMN `mustChangePassword` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `forcePasskeySetup` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `initialPasswordExpiresAt` DATETIME(3) NULL;

-- AlterTable: บอร์ดงานส่วนตัว/ส่วนรวม (ownerId NULL = ส่วนรวม — งานเดิมทั้งหมดจึงเป็นงานส่วนรวมโดยอัตโนมัติ)
ALTER TABLE `tasks` ADD COLUMN `ownerId` INTEGER NULL;

-- CreateIndex
CREATE INDEX `tasks_ownerId_idx` ON `tasks`(`ownerId`);

-- AddForeignKey
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
