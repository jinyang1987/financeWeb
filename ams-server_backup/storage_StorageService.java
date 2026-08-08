package com.finance.ams.storage;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import javax.sql.DataSource;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

import com.finance.ams.api.BizException;

/**
 * 实体库房服务（P4-2）：ams_storage_node 树（库房→柜→架→层）
 */
@Service
public class StorageService {

  private final JdbcClient jdbc;

  public StorageService(DataSource dataSource) {
    this.jdbc = JdbcClient.create(dataSource);
  }

  public List<Map<String, Object>> tree() {
    return jdbc.sql("SELECT * FROM ams_storage_node ORDER BY sort, code").query().listOfRows();
  }

  public Map<String, Object> createNode(String parentId, String kind, String code, String name) {
    String id = UUID.randomUUID().toString();
    jdbc.sql("INSERT INTO ams_storage_node (id, parent_id, kind, code, name, sort) VALUES (?,?,?,?,?,0)")
        .param(id).param(parentId).param(kind).param(code).param(name).update();
    return Map.of("id", id, "parentId", parentId != null ? parentId : "", "kind", kind, "code", code, "name", name);
  }

  public List<Map<String, Object>> occupancy() {
    return jdbc.sql("""
        SELECT s.id, s.code, s.name, s.kind,
          COUNT(DISTINCT f.volume_node_id) AS volume_count
        FROM ams_storage_node s
        LEFT JOIN ams_fulfillment f ON f.status IN ('lent','pending') AND f.volume_node_id IS NOT NULL
        GROUP BY s.id, s.code, s.name, s.kind
        ORDER BY s.code
        """).query().listOfRows();
  }
}
