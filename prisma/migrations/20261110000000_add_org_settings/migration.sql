-- ข้อมูลหน่วยงานหลัก (แถวเดียว) — ชื่อสังกัด/ชื่อกองที่ใช้ทั้งระบบ แอดมินแก้ได้จากหน้าตั้งค่า
CREATE TABLE `org_settings` (
    `id` INTEGER NOT NULL,
    `divisionName` VARCHAR(200) NOT NULL,
    `departmentName` VARCHAR(100) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `updatedById` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `org_settings` (`id`, `divisionName`, `departmentName`, `updatedAt`)
VALUES (1, 'ศูนย์เทคโนโลยีดิจิทัล หน่วยราชการในพระองค์', 'กองการศึกษา วิจัย และพัฒนา', CURRENT_TIMESTAMP(3));

-- เปลี่ยนชื่อสังกัดเดิม -> ชื่อใหม่ กับผู้ใช้ที่มีอยู่แล้ว
UPDATE `users`
SET `division` = 'ศูนย์เทคโนโลยีดิจิทัล หน่วยราชการในพระองค์'
WHERE `division` = 'ศูนย์เทคโนโลยีดิจิทัล สำนักพระราชวัง';
