-- แผนก (ส่วนงานย่อย) ของผู้ใช้ — ใช้เติมใบขอรถยนต์อัตโนมัติ (nullable ไม่กระทบข้อมูลเดิม)
ALTER TABLE `users` ADD COLUMN `section` VARCHAR(100) NULL;
