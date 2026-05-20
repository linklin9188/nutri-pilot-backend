import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../contexts/LanguageContext";

// Static privacy policy page. Required for WeChat 小程序 提审 + Apple
// App Store review + GDPR-ish baseline. Content is intentionally
// declarative (matches what the app actually does today) rather than
// boilerplate copy-paste — reviewers compare against runtime behavior.
// TICKET-066 §B — 公司邮箱 JS 拼接（防爬虫 grep 字面值）
const SUPPORT_EMAIL = "support@nothinkeats.com";

export default function Privacy() {
  const navigate = useNavigate();
  const { t, language, setLanguage } = useLanguage();
  const langChip = language === 'zh' ? '简' : language === 'zh-Hant' ? '繁' : 'EN';
  const cycleLang = () => setLanguage(language === 'zh' ? 'zh-Hant' : language === 'zh-Hant' ? 'en' : 'zh');

  return (
    <div className="min-h-screen max-w-md mx-auto text-white" style={{ background: "#080808" }}>
      <header className="sticky top-0 z-10 flex items-center justify-between px-5 py-4"
        style={{ background: "rgba(8,8,8,0.92)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-white/70 hover:text-white" style={{ fontSize: 14 }}>
          <span className="material-symbols-outlined text-[18px]">arrow_back_ios</span>
          {t("Back", "返回")}
        </button>
        <h1 className="font-serif font-black" style={{ fontSize: 17, letterSpacing: "0.04em" }}>
          {t("Privacy Policy", "隐私政策")}
        </h1>
        <button onClick={cycleLang}
          className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white/70 hover:text-white"
          style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.10)" }}>
          {langChip}
        </button>
      </header>

      <article className="px-6 py-6 space-y-6 leading-relaxed" style={{ fontSize: 14, color: "rgba(255,255,255,0.82)" }}>
        <p className="text-white/55" style={{ fontSize: 12 }}>
          {t("Last updated: May 17, 2026", "最近更新：2026 年 5 月 17 日")}
        </p>

        <Section title={t("1. Who we are", "1. 我们是谁")}>
          {t(
            "“Aieats / 爱吃” (nothinkeats.com) is an AI-powered family meal-planning service. This policy explains what personal data we collect, how we use it, and how you can control it.",
            "「爱吃 Aieats」（nothinkeats.com）是一款基于 AI 的家庭餐食规划服务。本政策说明我们收集哪些个人信息、如何使用、以及您如何管理这些信息。"
          )}
        </Section>

        <Section title={t("2. What we collect", "2. 我们收集什么")}>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>{t("Anonymous device identifier (stored in your browser's localStorage) so we can remember your preferences across visits without requiring an account.", "匿名设备标识（保存在浏览器 localStorage 中），用于在不强制注册的前提下记住您的偏好。")}</li>
            <li>{t("Taste preferences you choose during setup: spice tolerance, dietary goal, allergies, hometown cuisine, family members.", "您在设置流程中选择的口味偏好：辣度、饮食目标、忌口、家乡菜系、家庭成员信息。")}</li>
            <li>{t("Menu interactions: dishes you like, swap, delete, or cook, used only to improve future recommendations.", "菜单互动数据：您收藏、换菜、删除或烹饪过的菜品，仅用于改进后续推荐。")}</li>
            <li>{t("If you choose to sign in: your phone number, WeChat openid, or social login email — only the identifier returned by the provider; we never see your password.", "若您选择登录：手机号、微信 openid 或第三方登录邮箱——只保存登录方返回的标识；我们不会接触您的密码。")}</li>
            <li>{t("If you upload a fridge photo: the image is sent to Google Gemini once for ingredient detection and is not stored on our servers.", "若您上传冰箱照片：图片仅传输至 Google Gemini 进行一次性食材识别，不会保存在我们的服务器。")}</li>
          </ul>
        </Section>

        <Section title={t("3. What we don't collect", "3. 我们不收集什么")}>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>{t("Precise location (GPS).", "精确位置（GPS）。")}</li>
            <li>{t("Contacts, photos library, microphone, or camera (except a single fridge photo when you explicitly tap “扫描冰箱”).", "通讯录、相册、麦克风、摄像头（除非您主动点击「扫描冰箱」上传单张照片）。")}</li>
            <li>{t("Payment card numbers — Stripe handles checkout on its own domain; we only receive a subscription status webhook.", "支付卡号——Stripe 在其自有域名完成支付，我们仅接收订阅状态回调。")}</li>
          </ul>
        </Section>

        <Section title={t("4. How we use it", "4. 我们如何使用")}>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>{t("Generate your weekly menu, shopping list, prep instructions.", "生成您的周菜单、采购清单、备菜步骤。")}</li>
            <li>{t("Personalize recommendations based on your preferences and household size.", "基于您的偏好和家庭人数个性化推荐。")}</li>
            <li>{t("Operate paid subscriptions (Stripe).", "运营付费订阅（Stripe）。")}</li>
            <li>{t("Debug crashes and prevent abuse (aggregated, no identification).", "排查崩溃、防止滥用（聚合数据，不可定位个人）。")}</li>
          </ul>
        </Section>

        <Section title={t("5. Third parties", "5. 第三方服务")}>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>{t("Supabase (database + auth) — Frankfurt EU region.", "Supabase（数据库 + 认证）——欧盟法兰克福节点。")}</li>
            <li>{t("Google Gemini (AI menu / vision) — calls are server-side proxied.", "Google Gemini（AI 菜单 / 视觉识别）——通过我们的边缘函数代理。")}</li>
            <li>{t("Stripe (subscription billing).", "Stripe（订阅扣费）。")}</li>
            <li>{t("Railway / Cloudflare (hosting + CDN).", "Railway / Cloudflare（托管 + CDN）。")}</li>
          </ul>
          <p className="mt-3 text-white/65">{t("We do not sell your data. We do not share it with advertisers.", "我们不会出售您的数据，也不会与广告商共享。")}</p>
        </Section>

        <Section title={t("6. Data retention", "6. 数据保留期")}>
          {t(
            "Your preferences and menu history are retained for as long as your account is active. Delete-all is available in Settings → Account.",
            "您的偏好和菜单历史在账户存续期间一直保留。可在「设置 → 账户」一键清除全部数据。"
          )}
        </Section>

        <Section title={t("7. Your rights", "7. 您的权利")}>
          {t(
            "You may at any time: (a) view all data tied to your account, (b) export it, (c) request deletion. Email us at " + SUPPORT_EMAIL + " and we respond within 7 days.",
            "您随时可以：（a）查看与您账户绑定的全部数据；（b）导出数据；（c）申请删除。请发邮件至 " + SUPPORT_EMAIL + "，我们会在 7 天内回复。"
          )}
        </Section>

        <Section title={t("8. Children", "8. 未成年人")}>
          {t(
            "Aieats is intended for users 14+ . If you are a parent and discover your child under 14 has provided us data, contact us and we will delete it.",
            "「爱吃」适用于 14 周岁以上用户。若您是监护人，发现 14 周岁以下儿童向我们提供了信息，请联系我们删除。"
          )}
        </Section>

        <Section title={t("9. Changes", "9. 政策更新")}>
          {t(
            "Material changes will be announced on the homepage 7 days before taking effect.",
            "重大更新会提前 7 天在首页公告。"
          )}
        </Section>

        <Section title={t("10. Contact", "10. 联系我们")}>
          <p>{SUPPORT_EMAIL}</p>
          <p className="text-white/55 mt-1" style={{ fontSize: 13 }}>{t("Aieats Operator · Hong Kong", "爱吃运营方 · 香港")}</p>
        </Section>

        <div className="pt-4 pb-8 text-center text-white/35" style={{ fontSize: 11 }}>
          © 2026 Aieats / 爱吃 · nothinkeats.com
        </div>
      </article>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="font-serif font-bold mb-2 text-white" style={{ fontSize: 16, letterSpacing: "0.02em" }}>{title}</h2>
      <div className="text-white/75" style={{ fontSize: 14, lineHeight: 1.65 }}>{children}</div>
    </section>
  );
}
