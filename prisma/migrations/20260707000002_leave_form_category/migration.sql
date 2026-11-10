-- AlterTable: เพิ่มฟิลด์ประเภทแบบฟอร์ม (แบบส่ง กบก. / แบบเก็บสถิติ) เลือกได้อย่างเดียว
ALTER TABLE `leaves`
    ADD COLUMN `formCategory` ENUM('KBK', 'STATS') NULL;
