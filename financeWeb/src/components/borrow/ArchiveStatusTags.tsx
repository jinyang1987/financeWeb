/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * ArchiveStatusTags — 档案状态可视化标签（PRD 1.1）
 *
 * 【电子版可用】记录含电子文件
 * 【实体在库】所属案卷有实体载体且未被借出
 * 【实体借出】所属案卷实体被他人借出
 */

import React from 'react';
import { Cloud, HardDrive, LogOut } from 'lucide-react';
import { useVolumeStore } from '../../stores/volumeStore';
import { useBorrowStore, volumeStockStatus } from '../../stores/borrowStore';
import type { ArchiveRecord } from '../../types';

interface ArchiveStatusTagsProps {
  record: ArchiveRecord;
  size?: 'xs' | 'sm';
}

export const ArchiveStatusTags: React.FC<ArchiveStatusTagsProps> = ({ record, size = 'xs' }) => {
  const volumes = useVolumeStore((s) => s.volumes);
  const orders = useBorrowStore((s) => s.orders);

  const volume = volumes.find((v) => v.id === record.volumeId);
  const hasElectronic = record.components.length > 0 || record.source === 'digital-native';
  const hasPhysical = !!volume && (volume.carrierType === 'paper' || volume.carrierType === 'mixed');
  const stock = volume ? volumeStockStatus(orders, volume.id) : null;

  const cls = size === 'xs' ? 'text-[10px] px-1.5 py-0.5 gap-0.5' : 'text-xs px-2 py-1 gap-1';
  const iconCls = size === 'xs' ? 'w-3 h-3' : 'w-3.5 h-3.5';

  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      {hasElectronic && (
        <span className={`inline-flex items-center rounded-full border font-medium bg-sky-50 text-sky-700 border-sky-200 ${cls}`} title="电子版可在线调阅">
          <Cloud className={iconCls} />电子版可用
        </span>
      )}
      {hasPhysical && stock === 'in_stock' && (
        <span className={`inline-flex items-center rounded-full border font-medium bg-emerald-50 text-emerald-700 border-emerald-200 ${cls}`} title="实体档案在库，可申请外借">
          <HardDrive className={iconCls} />实体在库
        </span>
      )}
      {hasPhysical && stock === 'lent_out' && (
        <span className={`inline-flex items-center rounded-full border font-medium bg-amber-50 text-amber-700 border-amber-200 ${cls}`} title="实体已被借出，可预约排队">
          <LogOut className={iconCls} />实体借出
        </span>
      )}
    </span>
  );
};

export default ArchiveStatusTags;
