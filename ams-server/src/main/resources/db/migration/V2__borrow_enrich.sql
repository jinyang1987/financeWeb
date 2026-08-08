-- V2: 借阅模块数据形状补全（前后端贯通迁移 步骤1）
-- 明细补凭证号/档案类型；履约补卷题名；便于前端 BorrowOrder 完整还原。

ALTER TABLE ams.ams_borrow_item ADD COLUMN IF NOT EXISTS voucher_no   text;
ALTER TABLE ams.ams_borrow_item ADD COLUMN IF NOT EXISTS archive_type text;

ALTER TABLE ams.ams_fulfillment ADD COLUMN IF NOT EXISTS volume_title text;

-- 申请人冗余字段（避免每次 join ams_user_ext；submit 时写入）
ALTER TABLE ams.ams_borrow_order ADD COLUMN IF NOT EXISTS applicant_name   text;
ALTER TABLE ams.ams_borrow_order ADD COLUMN IF NOT EXISTS applicant_emp_no text;
ALTER TABLE ams.ams_borrow_order ADD COLUMN IF NOT EXISTS applicant_dept   text;
