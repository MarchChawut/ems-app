-- AlterTable: เพิ่มเบอร์โทรและที่อยู่ในตาราง users
ALTER TABLE `users` ADD COLUMN `phone` VARCHAR(20) NULL;
ALTER TABLE `users` ADD COLUMN `address` TEXT NULL;

-- AlterEnum: เพิ่ม EARLY_LEAVE ในประเภทการลา
ALTER TABLE `leaves` MODIFY COLUMN `type` ENUM('SICK', 'PERSONAL', 'VACATION', 'MATERNITY', 'ORDINATION', 'EARLY_LEAVE', 'OTHER') NOT NULL;
