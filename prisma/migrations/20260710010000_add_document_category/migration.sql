-- AlterTable
ALTER TABLE `document_registers` ADD COLUMN `category` ENUM('MEMO', 'EXTERNAL_LETTER', 'PW_NEWS') NULL;

