/**
 * recoveryCode — 雇主账号"找回码" (TICKET-116, 老板 6/19 "先上找回码兜底").
 *
 * custom auth 下 userId 只存 localStorage, 换设备就丢 → 看不到原数据 (数据在云端).
 * 雇主在设置页拿到一串 8 位找回码 (截图保存), 换设备在登录页输码 → 查回 userId →
 * setUserId 数据回来. 不依赖微信 (微信 openid 只 3 个号有 + 登录未确认稳).
 *
 * 存储: user_profiles.recovery_code (migration 107, text + unique partial index).
 * 字符集去掉易混 0/O/1/I/L; 存规范化大写 8 位, UI 显示插横线 (XXXX-XXXX).
 */
import { supabase } from './supabase';

// 去掉 0 O 1 I L (易混); 30 个字符 → 30^8 ≈ 6.5e11 空间
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_LEN = 8;

function genRaw(): string {
  const buf = new Uint32Array(CODE_LEN);
  crypto.getRandomValues(buf);
  let s = '';
  for (let i = 0; i < CODE_LEN; i++) s += ALPHABET[buf[i] % ALPHABET.length];
  return s;
}

/** 规范化用户输入: 去非字母数字 + 大写 (易混字符不在码集内, 不做映射避免误纠) */
export function normalizeCode(input: string): string {
  return (input || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

/** 显示用: 8 位 → "XXXX-XXXX" */
export function formatCode(code: string): string {
  const c = normalizeCode(code);
  if (c.length !== CODE_LEN) return c;
  return `${c.slice(0, 4)}-${c.slice(4)}`;
}

/**
 * 取当前账号的找回码, 没有则生成并写入 (碰撞重试).
 * 返回规范化 8 位码; 失败返回 null.
 */
export async function getOrCreateRecoveryCode(userId: string): Promise<string | null> {
  if (!userId) return null;

  const { data } = await supabase
    .from('user_profiles')
    .select('recovery_code')
    .eq('id', userId)
    .maybeSingle();
  if (data?.recovery_code) return data.recovery_code as string;

  // 没有 → 生成唯一码 (unique index 撞了就重试)
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = genRaw();
    const { error } = await supabase
      .from('user_profiles')
      .upsert({ id: userId, recovery_code: code }, { onConflict: 'id' });
    if (!error) return code;
    // 23505 unique_violation → 换一个再试; 其他错直接放弃
    if ((error as any)?.code !== '23505') return null;
  }
  return null;
}

/**
 * 用找回码查回 userId. 输入容错 (横线/空格/小写都接受).
 * 命中返回该账号 id; 没找到 / 格式不对返回 null.
 */
export async function recoverByCode(input: string): Promise<string | null> {
  const code = normalizeCode(input);
  if (code.length !== CODE_LEN) return null;
  const { data } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('recovery_code', code)
    .maybeSingle();
  return (data?.id as string) ?? null;
}
