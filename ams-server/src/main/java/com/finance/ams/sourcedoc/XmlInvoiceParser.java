package com.finance.ams.sourcedoc;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import javax.xml.parsers.DocumentBuilderFactory;

import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

/**
 * 数电票/电子发票 XML 源文件解析器（2026-08-29 T2，财政部《电子凭证会计数据标准》归档客体）。
 *
 * 设计原则——防御性宽松解析，不绑定单一 schema：
 *  1. 命名空间剥离：按 localName 匹配（数电票 XML 存在多版本命名空间差异）；
 *  2. 同义词表：税务总局数电票 XML（中文标签）与电子凭证会计数据标准 XML 并存，
 *     标签名做同义归集（发票号码/InvoiceNumber/…）；
 *  3. 购买方/销售方歧义：按父级路径（购买方信息/销售方信息）定向提取，
 *     避免「统一社会信用代码」双方撞名；
 *  4. 签名探测：任何 签名/Signature/印章/Seal 元素的存在性记录（验签本身属 CA 接入，见总计划 T-外围）。
 *
 * 安全：XXE 全关（禁 DOCTYPE/外部实体）——解析外部上传 XML 的强制基线。
 * 解析失败抛异常，调用方按「原始字节归档、不解析」降级，绝不阻断归档。
 */
public final class XmlInvoiceParser {

  private XmlInvoiceParser() {}

  /** 解析结果：字段（前端 12 族字段集 key 口径）+ 签名存在性 + 是否发票 + 纯文本（全文索引用） */
  public record Parsed(Map<String, String> fields, boolean hasSignature, boolean looksLikeInvoice,
                       String plainText) {}

  /** 字段提取规则：字段集 key → （父级路径须包含的提示词, 标签同义词表） */
  private record Rule(String fieldKey, String parentHint, List<String> names) {}

  private static final List<Rule> RULES = List.of(
      new Rule("invoiceNo", "", List.of("发票号码", "invoicenumber", "invoiceno")),
      new Rule("invoiceCode", "", List.of("发票代码", "invoicecode")),
      new Rule("checkCode", "", List.of("校验码", "checkcode")),
      new Rule("machineNo", "", List.of("税控机器编号", "machineno")),
      new Rule("issueDate", "", List.of("开票日期", "issuedate", "开票时间")),
      new Rule("amountExclTax", "", List.of("合计金额", "amountexcludingtax", "amountexcltax", "不含税金额")),
      new Rule("taxAmount", "", List.of("合计税额", "totaltax", "taxamount", "税额合计")),
      new Rule("totalAmount", "", List.of("价税合计", "totalamount", "价税合计(小写)", "价税合计（小写）")),
      new Rule("buyerName", "购买方", List.of("购买方名称", "buyername", "名称")),
      new Rule("buyerTaxId", "购买方", List.of("购买方纳税人识别号", "buyertaxid", "统一社会信用代码", "纳税人识别号")),
      new Rule("sellerName", "销售方", List.of("销售方名称", "sellername", "名称")),
      new Rule("sellerTaxId", "销售方", List.of("销售方纳税人识别号", "sellertaxid", "统一社会信用代码", "纳税人识别号")),
      new Rule("drawer", "", List.of("开票人", "drawer"))
  );

  /** 解析 XML 字节。解析失败（非 XML/含 DOCTYPE/编码坏）抛 Exception。 */
  public static Parsed parse(byte[] bytes) throws Exception {
    DocumentBuilderFactory f = DocumentBuilderFactory.newInstance();
    // XXE 加固（外部上传内容强制基线）
    f.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
    f.setFeature("http://xml.org/sax/features/external-general-entities", false);
    f.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
    f.setXIncludeAware(false);
    f.setExpandEntityReferences(false);
    Document doc = f.newDocumentBuilder().parse(new ByteArrayInputStream(bytes));

    // 扁平化：路径（父链 localName 拼接）→ 文本；同名取先见者（票面要素唯一性假设）
    Map<String, String> flat = new LinkedHashMap<>();
    StringBuilder text = new StringBuilder();
    String rootLocal = local(doc.getDocumentElement());
    walk(doc.getDocumentElement(), new ArrayDeque<>(), flat, text);

    boolean looksLikeInvoice = rootLocal.contains("发票") || rootLocal.toLowerCase().contains("invoice")
        || flat.keySet().stream().anyMatch(k -> k.endsWith("发票号码"));
    boolean hasSignature = flat.keySet().stream().anyMatch(k -> {
      String tail = k.substring(k.lastIndexOf('/') + 1).toLowerCase();
      return tail.contains("签名") || tail.contains("signature") || tail.contains("印章") || tail.contains("seal");
    });

    Map<String, String> fields = new LinkedHashMap<>();
    for (Rule rule : RULES) {
      String value = null;
      // 第一轮：带父级提示精确命中（购买方/销售方定向）
      if (!rule.parentHint().isEmpty()) {
        for (Map.Entry<String, String> e : flat.entrySet()) {
          String path = e.getKey();
          String tail = path.substring(path.lastIndexOf('/') + 1).toLowerCase();
          if (path.contains(rule.parentHint()) && rule.names().stream().anyMatch(n -> tail.equals(n.toLowerCase()))) {
            value = e.getValue();
            break;
          }
        }
      }
      // 第二轮：无提示词的字段直接按标签名命中
      if (value == null) {
        for (Map.Entry<String, String> e : flat.entrySet()) {
          String tail = e.getKey().substring(e.getKey().lastIndexOf('/') + 1).toLowerCase();
          if (rule.names().stream().anyMatch(n -> tail.equals(n.toLowerCase()))) {
            value = e.getValue();
            break;
          }
        }
      }
      if (value != null && !value.isBlank()) fields.put(rule.fieldKey(), value.trim());
    }

    return new Parsed(fields, hasSignature, looksLikeInvoice, text.toString().trim());
  }

  /** 递归遍历：flat[路径]=首个非空文本；text 累计全部叶子文本（全文索引原料，上限截断） */
  private static void walk(Element el, Deque<String> parents, Map<String, String> flat, StringBuilder text) {
    String local = local(el);
    parents.addLast(local);
    String path = String.join("/", parents);
    String own = ownText(el);
    if (own != null && !own.isBlank()) {
      flat.putIfAbsent(path, own.trim());
      if (text.length() < 40000) {
        text.append(local).append(' ').append(own.trim()).append('\n');
      }
    }
    NodeList children = el.getChildNodes();
    for (int i = 0; i < children.getLength(); i++) {
      if (children.item(i).getNodeType() == Node.ELEMENT_NODE) {
        walk((Element) children.item(i), parents, flat, text);
      }
    }
    parents.removeLast();
  }

  private static String local(Element el) {
    String n = el.getLocalName();
    return n != null ? n : el.getNodeName();
  }

  /** 元素自身文本（不含子元素文本） */
  private static String ownText(Element el) {
    StringBuilder sb = new StringBuilder();
    NodeList children = el.getChildNodes();
    for (int i = 0; i < children.getLength(); i++) {
      short t = children.item(i).getNodeType();
      if (t == Node.TEXT_NODE || t == Node.CDATA_SECTION_NODE) sb.append(children.item(i).getNodeValue());
    }
    return sb.toString();
  }

  /** 截取纯文本（索引上限保护） */
  public static String capText(String s, int max) {
    if (s == null) return "";
    return s.length() <= max ? s : s.substring(0, max);
  }
}
