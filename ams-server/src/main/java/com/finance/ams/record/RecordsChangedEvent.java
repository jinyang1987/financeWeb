package com.finance.ams.record;

import java.util.List;

/**
 * 件域变更事件（V10 全文检索读模型同步，2026-08-18）。
 *
 * 发布方为 record 域单一写入口（RecordService 建件/删除、VolumeService 加件/拆件/
 * 确认/拆卷/拆分/合并/转卷/移交归盒/退回、RecordController OCR 回写），
 * 仅依赖框架 ApplicationEventPublisher，避免与 RecordIndexService 循环依赖。
 *
 * 监听方 RecordIndexService 失败容忍（记日志 + rebuild 对账兜底），
 * 索引同步绝不反噬主写路径。
 */
public record RecordsChangedEvent(List<String> refreshNodeIds, List<String> removedNodeIds,
                                  List<String> refreshVolumeIds) {

  public static RecordsChangedEvent refreshOne(String nodeId) {
    return new RecordsChangedEvent(List.of(nodeId), List.of(), List.of());
  }

  public static RecordsChangedEvent refresh(List<String> nodeIds) {
    return new RecordsChangedEvent(nodeIds, List.of(), List.of());
  }

  public static RecordsChangedEvent removed(String nodeId) {
    return new RecordsChangedEvent(List.of(), List.of(nodeId), List.of());
  }

  /** 整卷件刷新（确认/撤销/移交归盒/退回等卷级属性或归属变化） */
  public static RecordsChangedEvent refreshVolume(String volumeId) {
    return new RecordsChangedEvent(List.of(), List.of(), List.of(volumeId));
  }
}
