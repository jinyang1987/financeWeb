package com.finance.ams.code;

import javax.sql.DataSource;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * 档号流水服务（P0-7）
 *
 * 取号算法（行锁原子递增，绝无重号）：
 *   UPDATE ams_code_serial SET next_value=next_value+1, version=version+1
 *   WHERE scope/fonds/type/year/boxNo 匹配
 *   RETURNING next_value-1
 * 无行时 INSERT（并发冲突→重试 UPDATE）。
 * UPDATE 在 PG 中取行锁，并发事务串行化，保证单调不重号。
 */
@Service
public class CodeSerialService {

  private final JdbcClient jdbc;

  public CodeSerialService(DataSource dataSource) {
    this.jdbc = JdbcClient.create(dataSource);
  }

  public record SerialScope(String scope, String fondsCode, String typeCode, int year, String boxNo) {}

  /**
   * 取下一个流水号（调用方须在事务中；独立调用自动开新事务）
   */
  @Transactional(propagation = Propagation.REQUIRES_NEW)
  public int next(SerialScope s) {
    for (int attempt = 0; attempt < 3; attempt++) {
      var updated = jdbc.sql("""
          UPDATE ams_code_serial
             SET next_value = next_value + 1, version = version + 1
           WHERE scope = ? AND fonds_code = ? AND type_code = ? AND year = ?
             AND (box_no = CAST(? AS text) OR (box_no IS NULL AND CAST(? AS text) IS NULL))
          RETURNING next_value - 1
          """)
          .params(s.scope(), s.fondsCode(), s.typeCode(), s.year(), s.boxNo(), s.boxNo())
          .query(Integer.class)
          .optional();
      if (updated.isPresent()) {
        return updated.get();
      }
      // 无行：插入后重试 UPDATE（并发插入冲突时落入下一轮）
      try {
        jdbc.sql("""
            INSERT INTO ams_code_serial (scope, fonds_code, type_code, year, box_no, next_value)
            VALUES (?, ?, ?, ?, ?, 1)
            ON CONFLICT (scope, fonds_code, type_code, year, box_no) DO NOTHING
            """)
            .params(s.scope(), s.fondsCode(), s.typeCode(), s.year(), s.boxNo())
            .update();
      } catch (DuplicateKeyException ignored) {
        // 并发插入冲突，下一轮 UPDATE 必中
      }
    }
    throw new IllegalStateException("档号流水取号失败（重试耗尽）: " + s);
  }

  /** 查询当前值（不递增，展示用） */
  public int peek(SerialScope s) {
    return jdbc.sql("""
        SELECT next_value FROM ams_code_serial
         WHERE scope = ? AND fonds_code = ? AND type_code = ? AND year = ?
           AND (box_no = CAST(? AS text) OR (box_no IS NULL AND CAST(? AS text) IS NULL))
        """)
        .params(s.scope(), s.fondsCode(), s.typeCode(), s.year(), s.boxNo(), s.boxNo())
        .query(Integer.class)
        .optional()
        .orElse(1);
  }

  /** 启动回填：把某作用域的 next_value 抬升到至少 minNext（迁移既有数据用，幂等） */
  @Transactional(propagation = Propagation.REQUIRES_NEW)
  public void ensureAtLeast(SerialScope s, int minNext) {
    jdbc.sql("""
        INSERT INTO ams_code_serial (scope, fonds_code, type_code, year, box_no, next_value)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT (scope, fonds_code, type_code, year, box_no)
        DO UPDATE SET next_value = GREATEST(ams_code_serial.next_value, EXCLUDED.next_value)
        """)
        .params(s.scope(), s.fondsCode(), s.typeCode(), s.year(), s.boxNo(), minNext)
        .update();
  }
}
