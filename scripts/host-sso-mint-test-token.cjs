#!/usr/bin/env node
/**
 * host-sso-mint-test-token.cjs —— 用共享密钥签一张测试 JWT(HS256)。
 *
 * 用途: 不依赖主站, 本地就能模拟"主站签票", 验证 SSO 全链路。
 *
 * 用法:
 *   node scripts/host-sso-mint-test-token.cjs <hostUid> [displayName]
 *   # 密钥默认读 /tmp/_host_sso_secret.txt, 或 env HOST_SSO_SECRET
 *
 * 输出: 一行 JWT。拿去拼:
 *   http://localhost:3000/auth/host/in?token=<JWT>
 * 或直接打后台测试:
 *   curl -s -X POST https://qoyuafqqkfyrqlthsvws.supabase.co/functions/v1/host-sso \
 *     -H 'Content-Type: application/json' -d "{\"token\":\"<JWT>\"}"
 */
const crypto = require('crypto');
const fs = require('fs');

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const hostUid = process.argv[2] || 'test-user-001';
const displayName = process.argv[3] || '测试用户';

let secret = process.env.HOST_SSO_SECRET || '';
if (!secret) {
  try { secret = fs.readFileSync('/tmp/_host_sso_secret.txt', 'utf8').trim(); } catch { /* */ }
}
if (!secret) {
  console.error('缺少密钥: 设 env HOST_SSO_SECRET 或放 /tmp/_host_sso_secret.txt');
  process.exit(1);
}

const now = Math.floor(Date.now() / 1000);
const header = { alg: 'HS256', typ: 'JWT' };
const payload = {
  sub: hostUid,          // 主站用户 id —— 必填
  name: displayName,     // 显示名 —— 可选
  iat: now,
  exp: now + 300,        // 5 分钟有效, 防重放
};

const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
const sig = b64url(crypto.createHmac('sha256', secret).update(signingInput).digest());
const jwt = `${signingInput}.${sig}`;

console.log(jwt);
