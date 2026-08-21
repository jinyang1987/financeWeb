# -*- coding: utf-8 -*-
"""RBAC 权限补强冒烟验证（2026-08-18）
覆盖：认证闸口 / 登录 / 三员硬分立 / 人员密级 / 操作权限(QX) / 行级过滤 / 配置权 / 开放端点放行
"""
import json, urllib.request, urllib.error, sys

BASE = "http://localhost:8081/api"
results = []

def call(method, path, headers=None, body=None):
    req = urllib.request.Request(BASE + path, method=method)
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        req.add_header("Content-Type", "application/json;charset=UTF-8")
    try:
        with urllib.request.urlopen(req, data, timeout=30) as r:
            text = r.read().decode("utf-8", "replace")
            try: return r.status, json.loads(text) if text else {}
            except Exception: return r.status, text
    except urllib.error.HTTPError as e:
        text = e.read().decode("utf-8", "replace")
        try: return e.code, json.loads(text) if text else {}
        except Exception: return e.code, text

def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    print(("PASS  " if cond else "FAIL  ") + name + ("" if cond else "   <-- " + str(detail)[:220]))

def H(t, u): return {"X-User-Id": u, "X-Alfresco-Ticket": t}

# ── A. 认证闸口 ──
s, b = call("GET", "/records?fondsCode=Z001&scope=all")
check("A1 无凭据访问业务端点 → 401 SESSION_EXPIRED", s == 401 and isinstance(b, dict) and b.get("code") == "SESSION_EXPIRED", (s, b))
s, b = call("GET", "/config/role-auth-v1", H("TICKET_FAKE_123", "admin"))
check("A2 伪造 ticket → 401", s == 401, (s, b))

# ── B. 登录 ──
s, b = call("POST", "/auth/login", body={"account": "admin", "password": "wrongpass"})
check("B1 错误密码 → 4xx AUTH_FAILED", s in (400, 401) and isinstance(b, dict) and b.get("code") == "AUTH_FAILED", (s, b))

tickets = {}
for acct, pwd, role in [("admin", "admin", "admin"), ("zhangwei", "123456", "employee"),
                        ("shenji", "123456", "security_auditor"), ("qianfang", "123456", "security_officer"),
                        ("zhaogang", "123456", "cfo"), ("wangqiang", "123456", "dept_manager")]:
    s, b = call("POST", "/auth/login", body={"account": acct, "password": pwd})
    ok = s == 200 and b.get("ticket") and role in b.get("user", {}).get("roles", [])
    check(f"B2 登录 {acct} → roles 含 {role}", ok, (s, b if s != 200 else b.get("user", {}).get("roles")))
    if s == 200: tickets[acct] = b["ticket"]

s, b = call("GET", "/auth/me", H(tickets.get("zhangwei", ""), "zhangwei"))
check("B3 /auth/me 会话恢复", s == 200 and b.get("account") == "zhangwei", (s, b))

# ── C. 审计日志硬分立（仅 security_auditor，admin 不豁免） ──
s, b = call("GET", "/audit/logs?limit=5", H(tickets.get("shenji", ""), "shenji"))
check("C1 审计员查审计日志 → 200", s == 200 and "items" in b, (s, str(b)[:150]))
s, b = call("GET", "/audit/logs?limit=5", H(tickets.get("admin", ""), "admin"))
check("C2 admin 查审计日志 → 403（硬分立不豁免）", s == 403, (s, b))
s, b = call("GET", "/audit/logs?limit=5", H(tickets.get("zhangwei", ""), "zhangwei"))
check("C3 普通员工查审计日志 → 403", s == 403, (s, b))

# ── D. 人员管理（sys-personnel：admin + security_officer） ──
s, b = call("GET", "/users", H(tickets.get("qianfang", ""), "qianfang"))
users_ok = s == 200 and isinstance(b, list) and len(b) >= 9 and all("clearance" in u for u in b)
check("D1 保密员查人员列表 → 200 且含密级字段", users_ok, (s, str(b)[:150]))
lina_clear = next((u.get("clearance") for u in (b if isinstance(b, list) else []) if u.get("account") == "lina"), None)
check("D2 李娜密级种子=1（内部）", lina_clear == 1, lina_clear)
s, b = call("GET", "/users", H(tickets.get("zhangwei", ""), "zhangwei"))
check("D3 员工查人员列表 → 403", s == 403, (s, b))
s, b = call("PUT", "/users/lina/clearance", H(tickets.get("qianfang", ""), "qianfang"), {"clearance": 5})
check("D4 密级越界值(5) → 400 VALIDATION_FAILED", s == 400 and isinstance(b, dict) and b.get("code") == "VALIDATION_FAILED", (s, b))
s, b = call("PUT", "/users/lina/clearance", H(tickets.get("qianfang", ""), "qianfang"), {"clearance": 2})
check("D5 保密员调密级 1→2 → 200", s == 200 and b.get("clearance") == 2, (s, b))
s, b = call("PUT", "/users/lina/clearance", H(tickets.get("zhangwei", ""), "zhangwei"), {"clearance": 3})
check("D6 员工调密级 → 403", s == 403, (s, b))
s, b = call("GET", "/audit/logs?action=%E4%BA%BA%E5%91%98%E5%AF%86%E7%BA%A7%E5%8F%98%E6%9B%B4&limit=5", H(tickets.get("shenji", ""), "shenji"))
audit_hit = s == 200 and b.get("total", 0) >= 1 and any("lina" in str(i) for i in b.get("items", []))
check("D7 密级变更上审计链", audit_hit, (s, str(b)[:200]))
s, b = call("PUT", "/users/lina/clearance", H(tickets.get("qianfang", ""), "qianfang"), {"clearance": 1})
check("D8 密级还原 2→1", s == 200 and b.get("clearance") == 1, (s, b))

# ── E. 操作权限（QX 码）+ 行级过滤 ──
s, b = call("GET", "/records?fondsCode=Z001&scope=all", H(tickets.get("zhangwei", ""), "zhangwei"))
zw_items = b.get("items", []) if isinstance(b, dict) else []
check("E1 员工(有catalog)查档案列表 → 200", s == 200, (s, str(b)[:150]))
s, b = call("GET", "/records?fondsCode=Z001&scope=all", H(tickets.get("shenji", ""), "shenji"))
check("E2 审计员(ops全关)查档案列表 → 403 无目录权", s == 403, (s, b))
s, b = call("GET", "/records?fondsCode=Z001&scope=all&maxItems=500", H(tickets.get("admin", ""), "admin"))
admin_items = b.get("items", []) if isinstance(b, dict) else []
check("E3 admin 查档案列表 → 200", s == 200, (s, str(b)[:120]))
check("E4 行级过滤：员工可见数({}) ≤ admin({})".format(len(zw_items), len(admin_items)), len(zw_items) <= len(admin_items), (len(zw_items), len(admin_items)))
zw_levels = {str(i.get("securityLevel", "")) for i in zw_items}
check("E5 员工(有效密级1)列表无 秘密/机密 行", not (zw_levels & {"秘密", "机密"}), zw_levels)

# 内容读取（view/download 分级）
node = None
for it in admin_items:
    lv = str(it.get("securityLevel", "") or "")
    if lv in ("普通", "内部", "") and it.get("nodeId"):
        node = it; break
if node:
    nid = node["nodeId"]
    s, _ = call("GET", f"/records/{nid}/content", H(tickets.get("zhangwei", ""), "zhangwei"))
    check("E6 员工在线查看(view有权) → 200", s == 200, s)
    s, b = call("GET", f"/records/{nid}/content?download=true", H(tickets.get("zhangwei", ""), "zhangwei"))
    check("E7 员工下载(download无权) → 403", s == 403, (s, b))
    s, _ = call("GET", f"/records/{nid}/content?download=true", H(tickets.get("zhaogang", ""), "zhaogang"))
    check("E8 CFO下载(有权) → 200", s == 200, s)
else:
    check("E6-E8 内容分级（跳过：无可测节点）", True, "admin 列表无普通/内部级节点")

# ── F. 配置权限 ──
s, b = call("GET", "/config/role-auth-v1", H(tickets.get("zhangwei", ""), "zhangwei"))
check("F1 已登录用户读权限配置 → 200 或 404(未初始化,前端落默认)", s in (200, 404), (s, str(b)[:120]))
role_auth = b.get("value") if (s == 200 and isinstance(b, dict)) else None
s, b = call("PUT", "/config/role-auth-v1", H(tickets.get("zhaogang", ""), "zhaogang"),
            {"value": role_auth or {"state": {}}})
check("F2 CFO 写权限矩阵 → 403（无 sys-role）", s == 403, (s, b))
if role_auth:
    s, b = call("PUT", "/config/role-auth-v1", H(tickets.get("admin", ""), "admin"), {"value": role_auth})
    check("F3 admin 回写权限矩阵(round-trip) → 200", s == 200, (s, str(b)[:150]))
    s, b = call("GET", "/audit/logs?action=%E6%9D%83%E9%99%90%E9%85%8D%E7%BD%AE%E5%8F%98%E6%9B%B4&limit=3", H(tickets.get("shenji", ""), "shenji"))
    check("F4 权限配置变更上审计链", s == 200 and b.get("total", 0) >= 1, (s, str(b)[:150]))
else:
    check("F3/F4 跳过：role-auth-v1 尚未保存（服务端走内置默认矩阵）", True, "")

# ── G. 开放端点放行（拦截器 exclude，自有 Bearer 认证） ──
s, b = call("POST", "/open/v1/archives", body={"test": 1})
check("G1 /open/v1 推送端点不经会话闸口（错误来自 Bearer 认证而非 SESSION_EXPIRED）",
      not (isinstance(b, dict) and b.get("code") == "SESSION_EXPIRED"), (s, b))
s, b = call("POST", "/open/v1/token", body={"appKey": "", "appSecret": ""})
check("G2 /open/v1/token 参数校验（可达，未被会话闸口拦） → 400 VALIDATION_FAILED",
      s == 400 and isinstance(b, dict) and b.get("code") == "VALIDATION_FAILED", (s, b))

# ── 汇总 ──
failed = [r for r in results if not r[1]]
print("\n" + "=" * 60)
print(f"冒烟结果: {len(results) - len(failed)}/{len(results)} 通过")
if failed:
    print("失败项:")
    for n, _, d in failed: print("  -", n, "|", str(d)[:200])
sys.exit(1 if failed else 0)
