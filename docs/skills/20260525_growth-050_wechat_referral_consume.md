# TICKET-050 P0 — WeChat OAuth 路径消费 nutri_pending_ref_code

## 一句话

中介推荐码在 Login.tsx 写入 `localStorage.nutri_pending_ref_code`，但只有 dev fallback 路径消费它；真 WeChat OAuth (经 /auth/wechat/done 回跳) 路径之前没人消费 → 微信注册用户的 agency attribution 全丢。补在 WeChatCallback.tsx setUserId 之后即可。

## 为什么坑

裂变属性是双路径的：FB/IG/dev fallback 走 Login.tsx 内 attribute (TICKET-043 §B 已修)；微信走 redirect → wechat-mp-callback edge fn → `/auth/wechat/done#userId=...`，userId 真正落地在 WeChatCallback.tsx。 Login.tsx 那条 attribute 调用只能覆盖到 dev fallback 分支，真 OAuth 用户进 WeChat 浏览器后页面已经 reload 到回调页，原来那个 Login 实例的 attributeReferralCode 永远跑不到。这就是 qa-047 audit 抓出的 P1-2。

## 怎么修

WeChatCallback.tsx useEffect 里 setUserId 之后、navigate 之前，读 localStorage.nutri_pending_ref_code → 命中查 agencies → update user_profiles.referred_by_agency_id + referred_by_code → finally 清 localStorage。三个细节：(1) 失败容错—不命中也写 code 留 record，throw 静默不阻塞登录；(2) finally 清 key 避免重复 attribute；(3) 用 async IIFE fire-and-forget 包起来，不要 await，跳转 850ms timeout 照常跑，attribution 在后台完成。
