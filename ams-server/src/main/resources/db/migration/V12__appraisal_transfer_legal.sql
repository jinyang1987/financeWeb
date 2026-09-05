-- V12（2026-09-05 批次四 T13/T14）：鉴定销毁法定化 + 移交清册真实生成
-- 依据：《会计档案管理办法》（财政部 国家档案局令第79号）第20/21条、DA/T 70-2022 移交清册、
--       《系统缺陷审计与修复计划-2026-08-29.md》缺陷 #18/#19。

-- ── 鉴定销毁法定要件（缺陷 #18） ─────────────────────────────
-- 三方签批链：申请单位（保管部门）→ 档案管理部门 → 监销人（审计/监察）；
-- 未结清债权债务校验（79号令第20条：保管期满但未结清的债权债务原始凭证不得销毁）；
-- 共同监销记录；不可恢复性验证（销毁后重取校验）；销毁清册（一式两份报备案，随档留存）。
ALTER TABLE ams.ams_appraisal
  ADD COLUMN IF NOT EXISTS sign_applicant    text,
  ADD COLUMN IF NOT EXISTS sign_applicant_at timestamptz,
  ADD COLUMN IF NOT EXISTS sign_archives     text,
  ADD COLUMN IF NOT EXISTS sign_archives_at  timestamptz,
  ADD COLUMN IF NOT EXISTS sign_supervisor   text,
  ADD COLUMN IF NOT EXISTS sign_supervisor_at timestamptz,
  ADD COLUMN IF NOT EXISTS supervisor_note   text,
  ADD COLUMN IF NOT EXISTS unrecoverable_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS unrecoverable_note text,
  ADD COLUMN IF NOT EXISTS unsettled_check   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS unsettled_note    text,
  ADD COLUMN IF NOT EXISTS register_no       text,
  ADD COLUMN IF NOT EXISTS register_file_node text;

-- ── 移交清册真实生成（缺陷 #19）：清册文件随档留存 ─────────────
ALTER TABLE ams.ams_transfer_batch
  ADD COLUMN IF NOT EXISTS register_no        text,
  ADD COLUMN IF NOT EXISTS register_file_node text;
