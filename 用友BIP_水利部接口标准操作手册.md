# 用友 BIP 会计档案取数 · 标准操作手册（水利部项目）

> 文档目标：任何人照着做都能把 7 个接口全部调通。
> 适用环境：用友 BIP 沙箱（dbox 网关）· 租户 `cjxa6h4n` · 应用 `5c1afa…`
> 实测日期：2026-08-08（全部 7 接口已验证通过）

---

## 0. 环境常量（一次性抄走）

| 名称 | 值 | 说明 |
|---|---|---|
| 网关 Base URL | `https://dbox.yonyoucloud.com/iuap-api-gateway` | 所有业务接口前缀 |
| 鉴权端点 | `https://dbox.yonyoucloud.com/iuap-api-gateway/open-auth/selfAppAuth/getAccessToken` | 换 token（GET） |
| 租户 `tenantId` | `cjxa6h4n` | 业务调用 query 必传 |
| 应用 `appKey` | `5c1afa507d974ada89ad99a2ffef3dd4` | 换 token 用 |
| 应用 `appSecret` | `33e3a9a156cbf60db6008a9f31ce756dd9066924` | 签名用（保密） |
| ContentType | `application/json` | 所有业务调用 |
| 调用方式 | `POST` + query 带 `access_token` 和 `tenantId` + JSON Body | 统一约定 |

> ⚠️ 所有业务接口地址 = `网关 Base URL` + 下表「接口路径」。例如账簿查询完整 URL 为
> `https://dbox.yonyoucloud.com/iuap-api-gateway/yonbip/fi/fipub/basedoc/querybd/accbook?access_token=<token>&tenantId=cjxa6h4n`

---

## 1. 步骤 0：获取 access_token（每次调用前必做）

### 1.1 签名算法（HmacSHA256）

1. 取当前毫秒时间戳 `timestamp`（13 位，如 `1754599800000`）。
2. 拼接待签名串：仅用 `appKey` 与 `timestamp` 两个参数，按参数名**升序**拼接为 `"参数名+参数值"`：
   ```
   appKey5c1afa507d974ada89ad99a2ffef3dd4timestamp1754599800000
   ```
3. 用 `appSecret` 作密钥，对上面字符串做 **HmacSHA256**（二进制）。
4. 对二进制结果做 **Base64** 编码 → 得到签名原串。
5. 对签名原串做 **URL Encode**（Base64 中的 `+ / =` 需转义）→ 得到最终 `signature`。

### 1.2 请求换 token（GET）

```
GET https://dbox.yonyoucloud.com/iuap-api-gateway/open-auth/selfAppAuth/getAccessToken
    ?appKey=5c1afa507d974ada89ad99a2ffef3dd4
    &timestamp=1754599800000
    &signature=<URL_Encode(Base64(HmacSHA256(...)))>
```

### 1.3 响应（取 `data.access_token`）

```json
{
  "code": "00000",
  "message": "OK",
  "data": { "access_token": "YT5_TGYonBip-commldev-..." }
}
```

> ✅ **取值层级**：`data.access_token`（当前沙箱为单层；个别历史版本为 `data.data.access_token`，健壮代码两个都兼容）。

---

## 2. 整体调用顺序（依赖关系）

```
① 换 token
   └─> ② 账簿查询        → 拿到 accbookId(GUID) 与 accbookCode("0001")
          └─> ③ 期间查询  → 拿到 真实期间 code（如 "2024-03"，共576条）
                 ├─> ⑥ 余额类报表  (accbook=accbookId, period=期间code)
                 └─> ⑦ 发生类报表  (accbook=accbookId, period=期间code)
          └─> ④ 凭证列表查询 (accbookCode="0001") → 拿到真实 voucherId
                 ├─> ⑤ 凭证详情查询 (voucherId)
                 └─> ⑧ 凭证附件下载 (businessIds=[voucherId])
```

**依赖要点**：
- 报表（⑥⑦）的 `accbook` 必须传**账簿 GUID（id）**，不能传 code。
- 报表的 `period` 必须是 `yyyy-MM` 格式，且取自**期间查询**的真实期间；`2024-01` 在本租户"发生类报表"模型未初始化，请用 `2024-03` 及以后。
- 凭证详情/附件的 `voucherId` 必须从"凭证列表"返回里取（沙箱当前无凭证数据，故该步返回 404/空，接口本身已通）。

---

## 3. 接口 1：账簿查询

- **路径**：`/yonbip/fi/fipub/basedoc/querybd/accbook`
- **方法**：POST
- **必填**：`access_token`(query)、`fields`(Body，数组)、`pageIndex`、`pageSize`
- **可选**：`conditions`(查询条件数组)

**请求 Body（已验证可通）**
```json
{
  "fields": ["id", "code", "name", "accsubjectchart", "accperiodscheme", "ratetype", "accstandard"],
  "pageIndex": 1,
  "pageSize": 3,
  "conditions": [
    { "field": "createTime", "value": "2019-10-23 14:00:37", "operator": ">=" }
  ]
}
```

**真实返回快照**
```json
{
  "code": 200,
  "message": "查询成功！",
  "success": true,
  "data": [
    {
      "id": "1971500567562289169",
      "code": "0001",
      "name": "北京同仁堂",
      "accsubjectchart": "1970994525955424258",
      "accperiodscheme": 1900405595968110666,
      "ratetype": "cjxa6h4n",
      "accstandard": "1900405587390759245"
    }
  ],
  "total": 1
}
```

> ✅ **注意**：`data` 是**数组**。下游要用 `data[0].id`（账簿 GUID）和 `data[0].code`（账簿编码）。
> ⚠️ `fields` **必须是 JSON 数组**（如 `["id","code","name"]`），不能传逗号字符串，否则报 999 类型错误。

---

## 4. 接口 2：期间查询

- **路径**：`/yonbip/fi/fipub/basedoc/querybd/accperiod`
- **方法**：POST
- **必填**：`access_token`(query)、`fields`(数组)、`pageIndex`、`pageSize`
- **可选**：`conditions`、`disableshow`(boolean)

**请求 Body（已验证可通）**
```json
{
  "fields": ["id", "code", "name"],
  "pageIndex": 1,
  "pageSize": 1000,
  "disableshow": false
}
```

**真实返回快照（共 576 条，节选前 3）**
```json
{
  "success": true,
  "message": null,
  "data": [
    { "code": "2024-01", "name": "2024-01", "id": 1900405595968110668 },
    { "code": "2024-02", "name": "2024-02", "id": 1900405595968110669 },
    { "code": "2024-03", "name": "2024-03", "id": 1900405595968110670 }
  ]
}
```

> ✅ **注意**：`data` 是**数组**（与文档示例里的单对象不同）。每条含 `code`(如 `2024-03`)、`name`、`id`。
> ✅ 下游报表直接取 `data[N].code` 作为 `period` 参数。

---

## 5. 接口 3：凭证列表查询

- **路径**：`/yonbip/fi/ficloud/openapi/voucher/queryVouchers`
- **方法**：POST
- **必填**：`access_token`(query)、`accbookCode`(Body，账簿编码)
- **可选**：`pager`(分页)、`accsubjectCodeList`、`periodStart/periodEnd`、`voucherStatusList` 等（详见原文档）

**请求 Body（已验证可通）**
```json
{
  "pager": { "pageIndex": 1, "pageSize": 20 },
  "accbookCode": "0001"
}
```

**真实返回快照（沙箱暂无凭证数据）**
```json
{
  "code": "200",
  "message": "OK",
  "data": { "pageIndex": 1, "pageSize": 20, "recordCount": 0, "recordList": [] }
}
```

> ✅ **注意**：`accbookCode` 传**账簿编码** `"0001"`（来自账簿查询 `data[0].code`），不是 GUID。
> ✅ 有数据时 `data.recordList` 是数组，每条含 `header.id`（即 voucherId）、`header.billcode`、`body[]` 分录。拿 `header.id` 喂给接口 4/5。
> ⚠️ 文档示例把很多字段标成"必填"，实测只有 `accbookCode` 真必填，其余留空即可。

---

## 6. 接口 4：凭证详情查询

- **路径**：`/yonbip/EFI/openapi/voucher/queryVoucherById`
- **方法**：POST
- **必填**：`access_token`(query)、`voucherId`(Body)

**请求 Body（voucherId 取自接口 3 的 recordList[].header.id）**
```json
{ "voucherId": "1674770115738468360" }
```

**真实返回快照（沙箱无该凭证 → 404）**
```json
{ "code": "404", "message": "凭证不存在！", "data": {} }
```

> ✅ **说明**：404 表示**接口已通、已进业务层**，仅示例使用 ID 不在本租户。换成接口 3 返回的真实 `voucherId` 即返回完整凭证（含 `bodies[]` 分录、`makerObj`/`auditorObj`/`tallyManObj` 等）。

---

## 7. 接口 5：凭证附件下载

- **路径**：`/yonbip/EFI/rest/v1/openapi/queryBusinessFiles`
- **方法**：POST
- **必填**：`access_token`(query)、`businessIds`(Body，凭证 id 数组)

**请求 Body**
```json
{ "businessIds": ["1674770115738468360"] }
```

**真实返回快照（示例 ID 无附件 → 空数组）**
```json
{ "code": "200", "data": { "1674770115738468360": [] } }
```

> ✅ **说明**：200 即接口通。`data` 以**凭证 id 为 key**，值为该凭证的附件对象数组（`fileId`/`filePath`/`fileName`/`fileSize` 等）。有附件时 `filePath` 为可直接下载的带签名 OSS 地址。

---

## 8. 接口 6：余额类报表项目数据查询

- **路径**：`/yonbip/fi/rpt/balance`
- **方法**：POST
- **必填**：`access_token`(query)、`accbook`(账簿 GUID)、`period`(`yyyy-MM`)

**请求 Body（已验证可通）**
```json
{
  "accbook": "1971500567562289169",
  "period": "2024-03"
}
```

**真实返回快照（本期间无余额数据 → items 空）**
```json
{
  "code": "200",
  "data": { "accCode": "0001", "accName": "北京同仁堂", "items": [] }
}
```

> ✅ **注意**：`accbook` 必须传**账簿 GUID**（`1971500567562289169`，来自接口 1 的 `data[0].id`），**不能**传编码 `0001`。
> ✅ `period` 取期间查询的真实 `code`，推荐 `2024-03` 及以后（本租户 `2024-01` 在余额/发生报表模型未初始化）。
> ✅ 有数据时 `items[]` 每项含 `code`/`name`/`TERMINAL`(期末余额)/`BEGINNING`(年初余额) 等字段。

---

## 9. 接口 7：发生类报表项目数据查询

- **路径**：`/yonbip/fi/rpt/profit`
- **方法**：POST
- **必填**：`access_token`(query)、`accbook`(账簿 GUID)、`period`(`yyyy-MM`)

**请求 Body（已验证可通）**
```json
{
  "accbook": "1971500567562289169",
  "period": "2024-03"
}
```

**真实返回快照**
```json
{
  "code": "200",
  "data": { "accCode": "0001", "accName": "北京同仁堂", "items": [] }
}
```

> ✅ 结构与余额报表一致；有数据时 `items[]` 每项含 `code`/`name`/`OCCUR`(本期发生)/`UP_OCCUR`(上期发生)/`GRAND`(累计发生) 等字段。
> ⚠️ `2024-01` 在本租户返回 `code:0 "period not exist!"`——该期间在"发生类报表"模型未初始化，换 `2024-03` 及以后即可。

---

## 10. 可直接运行的 Python 骨架

```python
import hmac, hashlib, base64, urllib.parse, urllib.request, json, ssl, time

GW = "https://dbox.yonyoucloud.com/iuap-api-gateway"
APP_KEY = "5c1afa507d974ada89ad99a2ffef3dd4"
APP_SECRET = "33e3a9a156cbf60db6008a9f31ce756dd9066924"
TENANT_ID = "cjxa6h4n"

ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE

def get_token():
    ts = str(int(time.time() * 1000))
    params = {"appKey": APP_KEY, "timestamp": ts}
    pm = "".join(k + params[k] for k in sorted(params))
    sig = urllib.parse.quote(base64.b64encode(
        hmac.new(APP_SECRET.encode(), pm.encode(), hashlib.sha256).digest()).decode())
    url = f"{GW}/open-auth/selfAppAuth/getAccessToken?appKey={urllib.parse.quote(APP_KEY)}&timestamp={ts}&signature={sig}"
    d = json.loads(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent":"Mozilla/5.0"}), timeout=20, context=ctx).read())
    return d["data"]["access_token"]   # 兼容旧版: d["data"]["data"]["access_token"]

def call(path, body, tok):
    url = f"{GW}{path}?access_token={tok}&tenantId={TENANT_ID}"
    req = urllib.request.Request(url, data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"})
    return json.loads(urllib.request.urlopen(req, timeout=30, context=ctx).read())

tok = get_token()
# ① 账簿 → ② 期间 → ⑥⑦ 报表
accbook = call("/yonbip/fi/fipub/basedoc/querybd/accbook",
               {"fields":["id","code","name"],"pageIndex":1,"pageSize":3,
                "conditions":[{"field":"createTime","value":"2019-10-23 14:00:37","operator":">="}]}, tok)
accbook_id = accbook["data"][0]["id"]; accbook_code = accbook["data"][0]["code"]
periods = call("/yonbip/fi/fipub/basedoc/querybd/accperiod",
               {"fields":["id","code","name"],"pageIndex":1,"pageSize":1000,"disableshow":False}, tok)["data"]
period = periods[2]["code"]   # 取 2024-03 及以后，避开未初始化的 2024-01
balance = call("/yonbip/fi/rpt/balance", {"accbook": accbook_id, "period": period}, tok)
profit  = call("/yonbip/fi/rpt/profit",  {"accbook": accbook_id, "period": period}, tok)
print("balance:", balance); print("profit:", profit)
```

---

## 11. 关键注意事项汇总（照做必通）

1. **同域调用**：token 与业务接口都用 `dbox.yonyoucloud.com` 网关，不能把 A 域签的 token 打到 B 域（会 310036）。
2. **token 取值**：取 `data.access_token`（兼容 `data.data.access_token`）。
3. **`fields` 必须数组**：账簿/期间查询的 `fields` 用 `["id","code","name"]`，勿传逗号串。
4. **账簿 `accbookCode` vs `accbook`**：列表/详情类用 `accbookCode`（编码，如 `0001`）；报表类用 `accbook`（GUID，如 `1971500567562289169`）。
5. **报表 `period` 格式**：`yyyy-MM`，务必取自"期间查询"真实值；本租户 `2024-01` 在报表模型未初始化，用 `2024-03+`。
6. **凭证链**：详情/附件的 `voucherId` 来自列表的 `recordList[].header.id`；沙箱无凭证数据时该步返回 404/空属正常。
7. **返回结构差异**：账簿 `data` 为数组；期间 `data` 为数组（非文档示例的单对象）；报表 `data` 为 `{accCode,accName,items}` 对象。
8. **授权状态**：本应用已订阅全部 7 个接口；若未来新增接口报 `310037`，去 dbox 开放平台给 `5c1afa…` 补授权即可。
