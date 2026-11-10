-- เปิด/ปิดฟีเจอร์ + ค่าเริ่มต้นต่อฟีเจอร์ (ไม่มีแถว = ค่าเริ่มต้นในโค้ด คือเปิดทั้งหมด จึงไม่เปลี่ยนพฤติกรรมเดิม)
CREATE TABLE `feature_settings` (
    `featureKey` VARCHAR(50) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `options` JSON NULL,
    `config` JSON NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `updatedById` INTEGER NULL,

    PRIMARY KEY (`featureKey`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
