package com.finance.ams.archivepackage;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;

import com.finance.ams.alfresco.AlfrescoNodeClient;
import com.finance.ams.alfresco.RepoLayout;
import com.finance.ams.api.BizException;
import com.finance.ams.fixity.FixityService;
import com.finance.ams.oplog.OperationLogService;
import com.finance.ams.util.HashUtil;

/**
 * 归档信息包服务（2026-09-05 批次五 T15，缺陷 #3「归档信息包不存在/死表」）。
 *
 * 依据：GB/T 44555 电子档案移交接收、DA/T 48-2009 基于 XML 的电子文件封装、
 *       DA/T 93-2022 电子档案移交接收操作规程。
 *
 * 产物（真 ZIP，一卷一目录）：
 *   {包号}/
 *     ├─ 封装说明.xml                 DA/T 48 风格封装说明：包标识/档案对象清单/文件级 SHA-256/内容聚合摘要
 *     └─ {卷号}/
 *         ├─ 元数据.xml               卷级+件级元数据（DA/T 94 风格字段）
 *         └─ 卷内文件/{件档号}-{文件名}  件内容字节（原格式，不转换）
 *
 * 校验链：文件级 SHA-256（逐文件）→ 内容聚合摘要（aggregateSha256）→ 包级 SHA-256
 *        （对最终 ZIP 字节计算，存 ams_package.checksum，随交接单传递；ZIP 内封装说明
 *        承载文件级/聚合级校验，包级值在包外传递，避免自引用悖论）。
 * 留存：ZIP 写入 Alfresco /{全宗}/_归档信息包/{年}/ 并入固化登记表（fixity.register），
 *       ams_package 表记录元数据与状态机（created → transferred → received）。
 */
@Service
public class ArchivePackageService {

  private static final Logger log = LoggerFactory.getLogger(ArchivePackageService.class);

  private final JdbcClient jdbc;
  private final AlfrescoNodeClient nodes;
  private final RepoLayout layout;
  private final OperationLogService oplog;
  private final FixityService fixity;

  public ArchivePackageService(javax.sql.DataSource dataSource, AlfrescoNodeClient nodes,
                               RepoLayout layout, OperationLogService oplog, FixityService fixity) {
    this.jdbc = JdbcClient.create(dataSource);
    this.nodes = nodes;
    this.layout = layout;
    this.oplog = oplog;
    this.fixity = fixity;
  }

  // ═══════════════════ 生成 ═══════════════════

  public record CreateCmd(String fondsCode, String name, String unitKind, List<String> volumeNodes, String createdBy) {}

  /**
   * 生成归档信息包：校验卷 → 组 ZIP（封装说明+元数据+内容）→ 存 Alfresco + 固化登记
   * → ams_package 落库（status=created）。
   */
  public Map<String, Object> create(String ticket, String userId, CreateCmd cmd) {
    if (cmd.volumeNodes() == null || cmd.volumeNodes().isEmpty()) {
      throw BizException.badRequest("VALIDATION_FAILED", "封装案卷不能为空");
    }
    if (!notBlank(cmd.fondsCode())) throw BizException.badRequest("VALIDATION_FAILED", "fondsCode 不能为空");

    // 读取卷与卷内件
    List<VolumeData> volumes = new ArrayList<>();
    for (String volId : cmd.volumeNodes()) {
      Map<String, Object> vol;
      try {
        vol = nodes.getNode(ticket, volId);
      } catch (HttpClientErrorException e) {
        throw BizException.badRequest("VOLUME_NOT_FOUND", "案卷不存在或无权限: " + volId);
      }
      if (!"finance:volume".equals(vol.get("nodeType"))) {
        throw BizException.badRequest("NOT_A_VOLUME", "节点不是案卷: " + volId);
      }
      VolumeData data = new VolumeData();
      data.nodeId = volId;
      data.volumeCode = prop(vol, "finance:volumeCode");
      data.title = prop(vol, "finance:title");
      data.year = prop(vol, "finance:volumeYear");
      data.retention = prop(vol, "finance:volumeRetention");
      data.retentionCode = prop(vol, "finance:retentionCode");
      data.digitalHash = prop(vol, "finance:digitalHash");
      for (Map<String, Object> r : childRecords(ticket, volId)) {
        RecordData rd = new RecordData();
        rd.nodeId = str(r.get("id"));
        rd.name = str(r.get("name"));
        rd.archiveCode = prop(r, "finance:archiveCode");
        rd.voucherNo = prop(r, "finance:voucherNo");
        rd.mimeType = content(r, "mimeType");
        rd.hasContent = !rd.mimeType.isBlank();
        // 内容字节（无内容件——纯元数据建档未补文件——在包内记说明不记字节）
        if (rd.hasContent) {
          try {
            rd.bytes = nodes.getContent(ticket, rd.nodeId).getBody();
            rd.hasContent = rd.bytes != null;
          } catch (Exception e) {
            log.warn("信息包读取件内容失败（按无内容收编）: {} — {}", rd.nodeId, e.getMessage());
            rd.hasContent = false;
          }
        }
        data.records.add(rd);
      }
      volumes.add(data);
    }
    if (volumes.isEmpty()) throw BizException.badRequest("BATCH_EMPTY", "无有效案卷");

    String packageNo = nextPackageNo();
    byte[] zip = buildZip(packageNo, volumes);

    // 包级 SHA-256（对最终 ZIP 字节；随交接单/系统传递）
    String checksum = HashUtil.sha256Hex(zip);

    // ZIP 写入 Alfresco 随档留存 + 固化登记（信息包本身也是归档对象）
    String year = String.valueOf(LocalDate.now().getYear());
    String fileNodeId;
    try {
      String fondsId = layout.fonds(ticket, cmd.fondsCode());
      String dirId = layout.ensurePath(ticket, fondsId, "_归档信息包", year);
      String fileName = packageNo + ".zip";
      Map<String, Object> created = nodes.createNode(ticket, dirId, fileName, "cm:content", Map.of(
          "cm:title", "归档信息包 " + packageNo,
          "cm:description", (notBlank(cmd.name()) ? cmd.name() + "；" : "")
              + volumes.size() + " 卷 " + volumes.stream().mapToInt(v -> v.records.size()).sum() + " 件；包级 SHA-256 " + checksum));
      fileNodeId = String.valueOf(created.get("id"));
      nodes.putContent(ticket, fileNodeId, zip, "application/zip");
      try {
        fixity.register(fileNodeId, zip, "application/zip", userId);
      } catch (Exception e) {
        log.error("信息包固化登记失败（文件已入库，待补登记）: {}", fileNodeId, e);
      }
    } catch (HttpClientErrorException e) {
      throw RepoLayout.translate("归档信息包写入 Alfresco 失败", e);
    }

    // ams_package 落库（启用 V1 死表，缺陷 #3）
    String manifestXml = buildManifestXml(packageNo, volumes, checksum);
    jdbc.sql("""
        INSERT INTO ams.ams_package
          (id, package_no, name, unit_kind, volume_nodes, manifest_xml, checksum, status)
        VALUES (gen_random_uuid(), ?, ?, ?, ?::text[], ?, ?, 'created')
        """)
        .params(packageNo, notBlank(cmd.name()) ? cmd.name() : "归档信息包 " + packageNo,
            notBlank(cmd.unitKind()) ? cmd.unitKind() : "volume",
            "{" + String.join(",", cmd.volumeNodes()) + "}", manifestXml, checksum)
        .update();
    // 文件节点补充记录（复用 volume_nodes 之外的列不可行——信息包文件节点入操作日志留痕）
    oplog.append(userId, userId, "归档信息包生成", packageNo, null,
        volumes.size() + " 卷；包级 SHA-256 " + checksum + "；文件节点 " + fileNodeId);
    log.info("归档信息包生成: {}（{} 卷，{} 字节，节点 {}，操作人 {}）", packageNo, volumes.size(), zip.length, fileNodeId, userId);

    Map<String, Object> out = new LinkedHashMap<>();
    out.put("packageNo", packageNo);
    out.put("checksum", checksum);
    out.put("fileNodeId", fileNodeId);
    out.put("totalVolumes", volumes.size());
    out.put("totalItems", volumes.stream().mapToInt(v -> v.records.size()).sum());
    out.put("zipSize", zip.length);
    return out;
  }

  // ═══════════════════ 列表 / 下载 / 状态机 ═══════════════════

  public List<Map<String, Object>> list() {
    return jdbc.sql("""
        SELECT id::text AS id, package_no, name, unit_kind, volume_nodes,
               checksum, status, created_at::text AS created_at,
               transferred_at::text AS transferred_at, received_at::text AS received_at
        FROM ams.ams_package ORDER BY created_at DESC LIMIT 200
        """).query((rs, i) -> {
          Map<String, Object> m = new LinkedHashMap<>();
          m.put("id", rs.getString("id"));
          m.put("packageNo", rs.getString("package_no"));
          m.put("name", rs.getString("name"));
          m.put("unitKind", rs.getString("unit_kind"));
          String[] vols = (String[]) rs.getArray("volume_nodes").getArray();
          m.put("volumeNodes", List.of(vols));
          m.put("checksum", rs.getString("checksum"));
          m.put("status", rs.getString("status"));
          m.put("createdAt", rs.getString("created_at"));
          m.put("transferredAt", rs.getString("transferred_at") == null ? "" : rs.getString("transferred_at"));
          m.put("receivedAt", rs.getString("received_at") == null ? "" : rs.getString("received_at"));
          return m;
        }).list();
  }

  /** 信息包 ZIP 下载（从 Alfresco 随档节点取原文，含包级摘要一致性校验） */
  public Map<String, Object> download(String ticket, String packageNo) {
    Map<String, Object> row = requireByNo(packageNo);
    List<String> volIds = volumeNodesOf(row);
    if (volIds.isEmpty()) {
      throw BizException.badRequest("PACKAGE_LOCATION_FAILED", "信息包 " + packageNo + " 未登记案卷，无法定位归档全宗");
    }
    String fileNodeId;
    try {
      // 信息包按生成年度归档在首卷所属全宗的 _归档信息包/{年}/ 下；逐年回退最多 3 年
      String fondsId = str(layout.findFondsOf(ticket, volIds.get(0)).get("id"));
      fileNodeId = null;
      for (int back = 0; back <= 3 && fileNodeId == null; back++) {
        String year = String.valueOf(LocalDate.now().getYear() - back);
        String dirId = layout.ensurePath(ticket, fondsId, "_归档信息包", year);
        fileNodeId = nodes.findChildId(ticket, dirId, packageNo + ".zip");
      }
      if (fileNodeId == null) throw BizException.notFound("信息包文件不存在: " + packageNo + ".zip");
      var resp = nodes.getContent(ticket, fileNodeId);
      byte[] bytes = resp.getBody() == null ? new byte[0] : resp.getBody();
      // 包级摘要一致性校验（下载即验真——GB/T 44555 接收方校验要求）
      String actual = HashUtil.sha256Hex(bytes);
      boolean match = actual.equalsIgnoreCase(str(row.get("checksum")));
      Map<String, Object> out = new LinkedHashMap<>();
      out.put("bytes", bytes);
      out.put("filename", packageNo + ".zip");
      out.put("checksumMatch", match);
      if (!match) {
        log.error("信息包摘要不一致: {} 登记 {} ≠ 下载重算 {}", packageNo, row.get("checksum"), actual);
      }
      return out;
    } catch (HttpClientErrorException e) {
      throw RepoLayout.translate("归档信息包下载失败", e);
    }
  }

  /** 发送（包移交至接收方）：created → transferred */
  public Map<String, Object> transfer(String userId, String packageNo) {
    Map<String, Object> row = requireByNo(packageNo);
    if (!"created".equals(row.get("status"))) {
      throw new BizException(HttpStatus.CONFLICT, "PACKAGE_STATE", "仅「已生成」状态的信息包可发送（当前: " + row.get("status") + "）");
    }
    jdbc.sql("UPDATE ams.ams_package SET status = 'transferred', transferred_at = now() WHERE package_no = ?")
        .param(packageNo).update();
    oplog.append(userId, userId, "归档信息包发送", packageNo, null, "包级 SHA-256 " + str(row.get("checksum")));
    return requireByNo(packageNo);
  }

  /** 接收确认（接收方校验通过后回执）：transferred → received */
  public Map<String, Object> receive(String userId, String packageNo) {
    Map<String, Object> row = requireByNo(packageNo);
    if (!"transferred".equals(row.get("status"))) {
      throw new BizException(HttpStatus.CONFLICT, "PACKAGE_STATE", "仅「已发送」状态的信息包可接收确认（当前: " + row.get("status") + "）");
    }
    jdbc.sql("UPDATE ams.ams_package SET status = 'received', received_at = now() WHERE package_no = ?")
        .param(packageNo).update();
    oplog.append(userId, userId, "归档信息包接收", packageNo, null, "接收方回执");
    return requireByNo(packageNo);
  }

  // ═══════════════════ ZIP 组装 ═══════════════════

  private byte[] buildZip(String packageNo, List<VolumeData> volumes) {
    List<String[]> fileEntries = new ArrayList<>(); // {zipPath, sha256, size}
    List<String> contentHashes = new ArrayList<>();
    ByteArrayOutputStream bos = new ByteArrayOutputStream();
    try (ZipOutputStream zip = new ZipOutputStream(bos)) {
      for (VolumeData v : volumes) {
        String volDir = (v.volumeCode.isBlank() ? "卷-" + v.nodeId.substring(0, 8) : v.volumeCode) + "/";
        // 卷级元数据
        String meta = buildVolumeMetaXml(v);
        zip.putNextEntry(new ZipEntry(volDir + "元数据.xml"));
        zip.write(meta.getBytes(StandardCharsets.UTF_8));
        zip.closeEntry();
        // 卷内件
        int seq = 0;
        for (RecordData r : v.records) {
          String safeName = r.name.replaceAll("[*?\"<>\\\\/:|]", "_");
          String path = volDir + "卷内文件/" + (r.archiveCode.isBlank() ? r.nodeId : r.archiveCode) + "-" + safeName;
          if (r.hasContent && r.bytes != null) {
            zip.putNextEntry(new ZipEntry(path));
            zip.write(r.bytes);
            zip.closeEntry();
            String h = HashUtil.sha256Hex(r.bytes);
            fileEntries.add(new String[]{path, h, String.valueOf(r.bytes.length)});
            contentHashes.add(h);
          } else {
            // 无内容件（纯元数据建档）：记录说明文件，诚实标注
            String note = "本件为纯元数据建档，电子文件" + (r.hasContent ? "读取失败" : "尚未补充") + "。\n档号: " + r.archiveCode + "\n凭证号: " + r.voucherNo + "\n";
            byte[] noteBytes = note.getBytes(StandardCharsets.UTF_8);
            String notePath = path + ".无电子文件.txt";
            zip.putNextEntry(new ZipEntry(notePath));
            zip.write(noteBytes);
            zip.closeEntry();
            fileEntries.add(new String[]{notePath, HashUtil.sha256Hex(noteBytes), String.valueOf(noteBytes.length)});
          }
          seq++;
        }
      }
      // DA/T 48 封装说明（包级聚合摘要对全部内容文件哈希再聚合）
      String aggregate = contentHashes.isEmpty() ? "" : HashUtil.aggregateSha256(contentHashes);
      String manifest = buildManifestXml(packageNo, volumes, aggregate, fileEntries);
      zip.putNextEntry(new ZipEntry("封装说明.xml"));
      zip.write(manifest.getBytes(StandardCharsets.UTF_8));
      zip.closeEntry();
    } catch (Exception e) {
      throw new BizException(HttpStatus.INTERNAL_SERVER_ERROR, "ZIP_BUILD_FAILED", "信息包 ZIP 组装失败: " + e.getMessage());
    }
    return bos.toByteArray();
  }

  /** DA/T 48 风格封装说明 XML */
  private String buildManifestXml(String packageNo, List<VolumeData> volumes, String checksum) {
    StringBuilder sb = new StringBuilder();
    sb.append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
    sb.append("<封装包 xmlns=\"urn:dat48:eep\" 版本=\"1.0\">\n");
    sb.append("  <包标识>\n    <包编号>").append(esc(packageNo)).append("</包编号>\n");
    sb.append("    <包类型>归档信息包（ZIP）</包类型>\n    <封装规范>DA/T 48-2009</封装规范>\n");
    sb.append("    <创建时间>").append(LocalDate.now()).append("</创建时间>\n");
    sb.append("    <包级SHA256>").append(esc(checksum)).append("</包级SHA256>\n");
    sb.append("  </包标识>\n  <档案对象列表>\n");
    for (VolumeData v : volumes) {
      sb.append("    <案卷>\n      <档号>").append(esc(v.volumeCode)).append("</档号>\n")
        .append("      <题名>").append(esc(v.title)).append("</题名>\n")
        .append("      <年度>").append(esc(v.year)).append("</年度>\n")
        .append("      <保管期限>").append(esc(v.retention)).append("</保管期限>\n")
        .append("      <件数>").append(v.records.size()).append("</件数>\n")
        .append("      <卷级聚合摘要>").append(esc(v.digitalHash)).append("</卷级聚合摘要>\n    </案卷>\n");
    }
    sb.append("  </档案对象列表>\n");
    sb.append("  <校验信息>\n    <算法>SHA-256</算法>\n");
    sb.append("    <说明>包级SHA256为对完整ZIP字节的摘要，随交接单据在包外传递；包内各文件摘要见各卷元数据与清单。</说明>\n");
    sb.append("  </校验信息>\n</封装包>\n");
    return sb.toString();
  }

  /** 带文件清单的封装说明（写入 ZIP 内部：文件级 SHA-256 + 内容聚合摘要） */
  private String buildManifestXml(String packageNo, List<VolumeData> volumes, String aggregate,
                                  List<String[]> fileEntries) {
    StringBuilder sb = new StringBuilder();
    sb.append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
    sb.append("<封装包 xmlns=\"urn:dat48:eep\" 版本=\"1.0\">\n");
    sb.append("  <包标识>\n    <包编号>").append(esc(packageNo)).append("</包编号>\n");
    sb.append("    <包类型>归档信息包（ZIP）</包类型>\n    <封装规范>DA/T 48-2009</封装规范>\n");
    sb.append("    <创建时间>").append(LocalDate.now()).append("</创建时间>\n");
    sb.append("  </包标识>\n  <档案对象列表>\n");
    for (VolumeData v : volumes) {
      sb.append("    <案卷>\n      <档号>").append(esc(v.volumeCode)).append("</档号>\n")
        .append("      <题名>").append(esc(v.title)).append("</题名>\n")
        .append("      <件数>").append(v.records.size()).append("</件数>\n    </案卷>\n");
    }
    sb.append("  </档案对象列表>\n  <文件清单>\n");
    for (String[] e : fileEntries) {
      sb.append("    <文件>\n      <路径>").append(esc(e[0])).append("</路径>\n")
        .append("      <SHA256>").append(esc(e[1])).append("</SHA256>\n")
        .append("      <字节数>").append(esc(e[2])).append("</字节数>\n    </文件>\n");
    }
    sb.append("  </文件清单>\n  <校验信息>\n    <算法>SHA-256</算法>\n");
    sb.append("    <内容聚合摘要>").append(esc(aggregate)).append("</内容聚合摘要>\n");
    sb.append("    <说明>内容聚合摘要=对全部内容文件 SHA-256 按序聚合（同卷级固化口径）；包级 SHA-256 由包外交接单据承载。</说明>\n");
    sb.append("  </校验信息>\n</封装包>\n");
    return sb.toString();
  }

  /** 卷级元数据 XML（DA/T 94 风格字段） */
  private String buildVolumeMetaXml(VolumeData v) {
    StringBuilder sb = new StringBuilder();
    sb.append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<案卷>\n");
    sb.append("  <档号>").append(esc(v.volumeCode)).append("</档号>\n");
    sb.append("  <题名>").append(esc(v.title)).append("</题名>\n");
    sb.append("  <年度>").append(esc(v.year)).append("</年度>\n");
    sb.append("  <保管期限>").append(esc(v.retention)).append("</保管期限>\n");
    sb.append("  <保管期限代码>").append(esc(v.retentionCode)).append("</保管期限代码>\n");
    sb.append("  <卷内件数>").append(v.records.size()).append("</卷内件数>\n");
    sb.append("  <卷级聚合摘要>").append(esc(v.digitalHash)).append("</卷级聚合摘要>\n");
    sb.append("  <卷内件>\n");
    for (RecordData r : v.records) {
      sb.append("    <件>\n      <档号>").append(esc(r.archiveCode)).append("</档号>\n")
        .append("      <文件名>").append(esc(r.name)).append("</文件名>\n")
        .append("      <凭证号>").append(esc(r.voucherNo)).append("</凭证号>\n")
        .append("      <格式>").append(esc(r.mimeType)).append("</格式>\n")
        .append("      <有电子文件>").append(r.hasContent).append("</有电子文件>\n");
      if (r.hasContent && r.bytes != null) {
        sb.append("      <SHA256>").append(HashUtil.sha256Hex(r.bytes)).append("</SHA256>\n");
      }
      sb.append("    </件>\n");
    }
    sb.append("  </卷内件>\n</案卷>\n");
    return sb.toString();
  }

  // ═══════════════════ 内部 ═══════════════════

  private String nextPackageNo() {
    String today = LocalDate.now().format(java.time.format.DateTimeFormatter.BASIC_ISO_DATE);
    int seq = jdbc.sql("SELECT count(*) FROM ams.ams_package WHERE package_no LIKE 'PKG-' || ? || '-%'")
        .param(today).query(Integer.class).single() + 1;
    return "PKG-" + today + "-" + String.format("%03d", seq);
  }

  private Map<String, Object> requireByNo(String packageNo) {
    return jdbc.sql("""
        SELECT id::text AS id, package_no, name, unit_kind, checksum, status,
               volume_nodes, created_at::text AS created_at,
               transferred_at::text AS transferred_at, received_at::text AS received_at
        FROM ams.ams_package WHERE package_no = ?
        """).param(packageNo)
        .query((rs, i) -> {
          Map<String, Object> m = new LinkedHashMap<>();
          m.put("id", rs.getString("id"));
          m.put("packageNo", rs.getString("package_no"));
          m.put("name", rs.getString("name"));
          m.put("unitKind", rs.getString("unit_kind"));
          m.put("checksum", rs.getString("checksum"));
          m.put("status", rs.getString("status"));
          String[] vols = (String[]) rs.getArray("volume_nodes").getArray();
          m.put("volumeNodes", List.of(vols));
          m.put("createdAt", rs.getString("created_at"));
          return m;
        }).optional()
        .orElseThrow(() -> BizException.notFound("归档信息包不存在: " + packageNo));
  }

  @SuppressWarnings("unchecked")
  private List<String> volumeNodesOf(Map<String, Object> row) {
    Object v = row.get("volumeNodes");
    return v instanceof List<?> l ? (List<String>) l : List.of();
  }

  @SuppressWarnings("unchecked")
  private List<Map<String, Object>> childRecords(String ticket, String volumeId) {
    List<Map<String, Object>> out = new ArrayList<>();
    int skip = 0;
    while (true) {
      Map<String, Object> list;
      try {
        list = nodes.listChildren(ticket, volumeId, skip, 500);
      } catch (HttpClientErrorException e) {
        throw RepoLayout.translate("卷内件查询失败", e);
      }
      for (Map<String, Object> e : (List<Map<String, Object>>) list.get("entries")) {
        Map<String, Object> entry = (Map<String, Object>) e.get("entry");
        if ("finance:record".equals(entry.get("nodeType"))) out.add(entry);
      }
      Map<String, Object> paging = (Map<String, Object>) list.get("pagination");
      if (!Boolean.TRUE.equals(paging.get("hasMoreItems"))) break;
      skip += 500;
    }
    return out;
  }

  private static String content(Map<String, Object> entry, String key) {
    return entry.get("content") instanceof Map<?, ?> c && c.get(key) != null ? String.valueOf(c.get(key)) : "";
  }

  private static String esc(String s) {
    return s == null ? "" : s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
  }

  @SuppressWarnings("unchecked")
  private static String prop(Map<String, Object> entry, String name) {
    Object props = entry.get("properties");
    if (!(props instanceof Map)) return "";
    Object v = ((Map<String, Object>) props).get(name);
    return v == null ? "" : String.valueOf(v);
  }

  private static String str(Object o) {
    return o == null ? "" : String.valueOf(o);
  }

  private static boolean notBlank(String s) {
    return s != null && !s.isBlank();
  }

  /** 卷数据（打包期） */
  private static class VolumeData {
    String nodeId;
    String volumeCode = "";
    String title = "";
    String year = "";
    String retention = "";
    String retentionCode = "";
    String digitalHash = "";
    List<RecordData> records = new ArrayList<>();
  }

  /** 件数据（打包期） */
  private static class RecordData {
    String nodeId;
    String name = "";
    String archiveCode = "";
    String voucherNo = "";
    String mimeType = "";
    boolean hasContent;
    byte[] bytes;
  }
}
