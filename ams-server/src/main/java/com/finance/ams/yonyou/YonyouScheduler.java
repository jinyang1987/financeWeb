package com.finance.ams.yonyou;

import java.time.LocalDateTime;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.scheduling.support.CronExpression;
import org.springframework.stereotype.Component;

/**
 * 用友月度自动归档调度器
 *
 * 设计：每分钟检查一次内存态"下次触发时间"（由 ams_config 的 yonyou.schedule.cron
 * 经 Spring CronExpression 计算），到点即同步上一会计期间。配置改动下一 tick 即生效，
 * 无需重启。默认 cron：0 30 2 1 * *（每月 1 日 02:30 同步上月）。
 *
 * 幂等保障在 YonyouSyncService（success 唯一索引 + 重跑 skipped），调度器自身无状态。
 */
@Component
public class YonyouScheduler {

  private static final Logger log = LoggerFactory.getLogger(YonyouScheduler.class);

  private final YonyouSyncService sync;

  /** 下次触发时间（null=未启用或未计算） */
  private volatile LocalDateTime nextRun;

  public YonyouScheduler(YonyouSyncService sync) {
    this.sync = sync;
  }

  @Scheduled(fixedDelay = 60_000, initialDelay = 90_000)
  public void tick() {
    YonyouSyncService.ScheduleConfig cfg;
    try {
      cfg = sync.scheduleConfig();
    } catch (Exception e) {
      log.debug("调度配置读取失败: {}", e.getMessage());
      return;
    }
    if (!cfg.enabled()) {
      nextRun = null;
      return;
    }
    if (!CronExpression.isValidExpression(cfg.cron())) {
      log.warn("用友自动归档 cron 非法: {}", cfg.cron());
      nextRun = null;
      return;
    }
    LocalDateTime now = LocalDateTime.now();
    if (nextRun == null || nextRun.isBefore(now.minusMinutes(2))) {
      // 首次或配置/时钟漂移后重算
      nextRun = CronExpression.parse(cfg.cron()).next(now);
      log.info("用友自动归档下次执行: {}", nextRun);
      return;
    }
    if (!now.isBefore(nextRun)) {
      String period = YonyouSyncService.previousPeriod();
      log.info("用友自动归档触发: 期间 {}", period);
      try {
        sync.syncNow(period, "auto", "scheduler", null, null);
      } catch (Exception e) {
        log.error("用友自动归档失败: {}", e.getMessage());
      } finally {
        nextRun = CronExpression.parse(cfg.cron()).next(LocalDateTime.now());
      }
    }
  }

  /** 下次执行时间（页面展示） */
  public LocalDateTime nextRunAt() {
    return nextRun;
  }
}
