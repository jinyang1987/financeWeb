/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * 档案盒（ArchiveBox）— 仅组卷模式使用，存储盒级元数据
 *
 * 纸质档案走 盒→卷→件 三级架构，盒为最外层容器。
 * 纯电子档案不产生此表数据。
 */

export type BoxStatus =
  | 'active'     // 使用中（正在装盒）
  | 'sealed'     // 已封盒
  | 'stored'     // 已上架归档
  | 'destroyed'; // 已销毁

export interface ArchiveBox {
  /** 主键 */
  id: string;
  /** 盒唯一标识（系统生成） */
  boxId: string;
  /** 人为可读的盒号（如 "BOX-2026-KP-001"） */
  boxNo: string;
  /** 盒名称/题名 */
  boxName: string;
  /** 档案类别代码（KP=会计凭证/KB=会计账簿/FB=财务报表/QT=其他） */
  archiveTypeCode: string;
  /** 存放位置（柜号-架号-层号） */
  location: string;
  /** 保管期限 */
  retention: string;
  /** 形成年度 */
  year: number;
  /** 载体类型 — 盒仅属于纸质载体 */
  carrierType: 'paper';
  /** 盒状态 */
  status: BoxStatus;
  /** 盒内容纳卷数 */
  volumeCount: number;
  /** 卷级档号起止范围 */
  volumeCodeRange?: string;
  /** 盒内件数（所有卷内件合计） */
  totalItems?: number;
  /** 密级 */
  securityLevel?: string;
  /** 创建日期 */
  createdDate: string;
  /** 创建人 */
  createdBy: string;
  /** 备注 */
  remarks?: string;
}

/** 盒状态中文标签 */
export const BOX_STATUS_LABELS: Record<BoxStatus, string> = {
  active: '使用中',
  sealed: '已封盒',
  stored: '已上架',
  destroyed: '已销毁',
};
