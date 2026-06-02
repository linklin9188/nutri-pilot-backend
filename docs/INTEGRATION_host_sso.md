# 爱吃 ↔ 主站 共享登录 (SSO) 对接说明

把"爱吃"(nothinkeats.com)作为一个栏目嵌进**主站**(另一个网页产品),用户在主站
登录后,点"爱吃"整页进入 `aieats.<主站域名>`,**自动认人、无需再登**。

落地形态(老板 2026-06-01 拍板): **子域名整页跳转 + 共享登录**。
深度中档:嵌入 + 共享登录(账号数据后台暂不合并,将来要合并这套机制照用不返工)。

---

## 一、整体流程(3 步握手)

```
①主站                          ②爱吃接力页                    ③爱吃首页
用户点"爱吃"栏目          →     /auth/host/in?token=<JWT>  →   认人成功
主站后端用共享密钥             接力页 POST host-sso 验票        setUserId(h_<主站uid>)
给当前用户签一张 JWT           验过→拿回爱吃 userId             直接进 /home-v2
整页跳 aieats.<主站>          (全程不离开爱吃域名)             不用再登
```

**安全核心**:绝不传明文 `?uid=张三`(谁都能改网址冒充)。传**密钥签名过的 JWT**,
爱吃后台用同一把密钥验签,验过才认。密钥只在两边后台,不进任何网页代码。

---

## 二、主站要做的(2 件)

### 1. 加"爱吃"入口,点击时签票 + 跳转

主站**后端**(不能放前端!密钥不能进浏览器)给当前登录用户签一张 JWT,然后整页跳转。

**JWT 规格**:
- 算法: `HS256`
- 密钥: 共享密钥 `HOST_SSO_SECRET`(见第四节)
- Payload 声明:

  | 字段 | 必填 | 说明 |
  |---|---|---|
  | `sub` | ✅ | 主站用户唯一 id(字符串或数字都行)。爱吃据此映射身份。 |
  | `name` | 可选 | 用户显示名,带上则自动填进爱吃资料。 |
  | `iat` | 建议 | 签发时间(秒级 Unix 时间戳)。 |
  | `exp` | ✅强烈建议 | 过期时间(秒级)。建议签发后 **5 分钟**,防票被截获重放。 |

**Node.js 签票示例**(主站后端):

```js
const crypto = require('crypto');
const b64url = b => Buffer.from(b).toString('base64')
  .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');

function mintAieatsToken(hostUid, displayName) {
  const secret = process.env.HOST_SSO_SECRET;            // 主站后端 env
  const now = Math.floor(Date.now() / 1000);
  const header  = { alg: 'HS256', typ: 'JWT' };
  const payload = { sub: String(hostUid), name: displayName || '', iat: now, exp: now + 300 };
  const si  = b64url(JSON.stringify(header)) + '.' + b64url(JSON.stringify(payload));
  const sig = b64url(crypto.createHmac('sha256', secret).update(si).digest());
  return si + '.' + sig;
}

// 路由处理: GET /go/aieats  (用户点"爱吃"栏目时打到这)
app.get('/go/aieats', (req, res) => {
  const token = mintAieatsToken(req.user.id, req.user.name);
  const ret = encodeURIComponent('https://你的主站.com/');     // 可选: 爱吃里"返回主站"回到这
  res.redirect(`https://aieats.你的主站.com/auth/host/in?token=${token}&return=${ret}`);
});
```

> 用任何标准 JWT 库(`jsonwebtoken` 等)签 HS256 也完全等价:
> `jwt.sign({ sub, name }, secret, { algorithm:'HS256', expiresIn:'5m' })`

### 2. 跳转地址格式

```
https://aieats.<你的主站域名>/auth/host/in?token=<JWT>&return=<主站回跳URL(可选,需 encode)>
```

- `token`: 必填,上面签的 JWT。
- `return`: 可选,爱吃里点"返回主站"会回到这个地址(爱吃会存下来)。

---

## 三、爱吃这边已做好的(无需你操心,已部署)

| 件 | 状态 |
|---|---|
| 接力页 `/auth/host/in` | ✅ 已上线(`src/pages/HostSsoIn.tsx`) |
| 验票后台 `host-sso` edge function | ✅ 已部署到生产 Supabase |
| 共享密钥 `HOST_SSO_SECRET` | ✅ 已生成 + 设进 Supabase secret |
| 身份映射 | 主站 `sub` → 爱吃 userId `h_<sub>`(加前缀隔离,不撞历史身份) |
| 自动建档 | 第一次进来自动建 `user_profiles` 行(用 `name` 填显示名) |

**验票后台地址**(主站不直接调,接力页内部调,列出供排查):
```
POST https://qoyuafqqkfyrqlthsvws.supabase.co/functions/v1/host-sso
Body: { "token": "<JWT>" }
返回: { "ok": true, "userId": "h_<sub>", "displayName": "...", "isNew": 0|1 }
错误: { "ok": false, "error": "<code>" }
```
错误码: `no_token` / `malformed_token` / `unsupported_alg` / `bad_signature` /
`token_expired` / `token_not_yet_valid` / `no_subject` / `server_misconfigured_no_secret`。

---

## 四、共享密钥(一次性配置)

密钥已生成,**两边必须用同一把**:

- **爱吃侧**: 已存进 Supabase secret `HOST_SSO_SECRET`(无需再动)。
- **主站侧**: 需把同一串密钥放进主站后端环境变量 `HOST_SSO_SECRET`。
- 密钥当前值: 见本机 `/tmp/_host_sso_secret.txt`(64 字符 base64url)。
  **请安全传给主站后端**(不要进 git、不要进前端)。要换密钥时两边同步更新即可。

> 取密钥: `cat /tmp/_host_sso_secret.txt`
> 换密钥: `supabase secrets set HOST_SSO_SECRET="<新值>"` + 主站 env 同步。

---

## 五、DNS(一次性配置,你来点)

把子域名指到爱吃现有服务器(Railway):

1. 在主站域名 DNS 加一条记录: `aieats` → CNAME 指向爱吃的 Railway 域名
   (或在 Railway 项目里给爱吃加自定义域名 `aieats.你的主站.com`,按 Railway 提示配 CNAME)。
2. 等证书签发(Railway 自动)。
3. 验证 `https://aieats.你的主站.com/login-v2` 能打开。

---

## 六、本地联调(不依赖主站就能测全链路)

爱吃仓库自带测试签票脚本,模拟"主站签票":

```bash
# 1. 签一张测试票(密钥默认读 /tmp/_host_sso_secret.txt)
node scripts/host-sso-mint-test-token.cjs demo-uid-42 "陈太太"
# → 输出一行 JWT

# 2a. 直接打后台验票:
curl -s -X POST https://qoyuafqqkfyrqlthsvws.supabase.co/functions/v1/host-sso \
  -H 'Content-Type: application/json' -d '{"token":"<上面的JWT>"}'
# → {"ok":true,"userId":"h_demo-uid-42",...}

# 2b. 或浏览器走完整接力页流程:
#   http://localhost:3000/auth/host/in?token=<上面的JWT>
#   → 应自动认人 → 跳 /home-v2
```

已验证(2026-06-01): 有效票✅认人建档 / 篡改票✅拒 / 过期票✅拒 / 无票✅拒。

---

## 七、命门与边界(给爱吃这边维护者)

- 本机制是**多一条认人入口**,与微信 (`/auth/wechat/in`) / 匿名 / 邀请码登录**并存**,
  不动任何现有登录路径(CLAUDE.md 自定义 auth 命门不破)。
- `setUserId()` 走 SESSION sentinel,不直接写 LS,避免 App 启动 IIFE 清掉(见 userId.ts)。
- 身份前缀 `h_` 隔离主站身份与历史 uuid 身份;将来"深档"(账号合并)时,这层映射是
  现成的对应关系,加数据层即可,不返工。
