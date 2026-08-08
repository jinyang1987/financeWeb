package com.finance.ams;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * ams-server — 会计档案业务服务
 *
 * 职责（Alfresco 集成总体方案 D1）：
 *   业务状态机（借阅/审批/履约/组卷/移交/鉴定）、档号流水、
 *   配置中心、操作日志、四性检测、水印烧录、OCR 编排、每日巡检、统计聚合。
 *
 * 边界：内容与组织在 Alfresco，本服务通过 Alfresco REST v1 访问；
 *       业务数据落 PostgreSQL 独立 schema `ams`（与 Alfresco 同实例）。
 */
@EnableScheduling
@SpringBootApplication
public class AmsServerApplication {

  public static void main(String[] args) {
    SpringApplication.run(AmsServerApplication.class, args);
  }
}
