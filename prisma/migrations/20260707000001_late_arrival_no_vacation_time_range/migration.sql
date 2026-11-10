-- AlterEnum: เพิ่ม LATE_ARRIVAL (มาสาย), ลบ VACATION (ลาพักร้อน - ไม่มีข้อมูลเดิมใช้ค่านี้)
ALTER TABLE `leaves` MODIFY COLUMN `type` ENUM('SICK', 'PERSONAL', 'MATERNITY', 'ORDINATION', 'EARLY_LEAVE', 'LATE_ARRIVAL', 'RUN_AN_ERRAND', 'OTHER') NOT NULL;

-- AlterTable: เพิ่มฟิลด์เวลาออก/เวลากลับ สำหรับมาสาย/ออกก่อนเวลา/ออกนอกเขตฯ
ALTER TABLE `leaves`
    ADD COLUMN `outTime` VARCHAR(5) NULL,
    ADD COLUMN `backTime` VARCHAR(5) NULL;
