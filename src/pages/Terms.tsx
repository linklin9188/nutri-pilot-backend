import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../contexts/LanguageContext";

// Static terms of service page. Required for WeChat 小程序 提审 + Apple
// + Stripe (any subscription product needs visible refund / billing rules).
export default function Terms() {
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
          {t("Terms of Service", "服务条款")}
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

        <Section title={t("1. The service", "1. 服务说明")}>
          {t(
            "“Aieats / 爱吃” is a personal meal-planning assistant. It suggests dishes, generates shopping lists, and provides preparation guidance based on the preferences you tell it about yourself and your family. Recommendations are informational only and are not medical, nutritional, or pediatric advice.",
            "「爱吃 Aieats」是一款个人餐食规划助手，基于您提供的家庭偏好生成菜单、采购清单与备菜指引。推荐内容仅供参考，不构成医疗、营养或儿科建议。"
          )}
        </Section>

        <Section title={t("2. Account & age", "2. 账户与年龄")}>
          {t(
            "You may use Aieats anonymously. If you choose to sign in, you confirm you are at least 14 years old. One account per person.",
            "您可以匿名使用爱吃。若您选择登录，则确认本人已年满 14 周岁。一人一账户。"
          )}
        </Section>

        <Section title={t("3. Acceptable use", "3. 使用规范")}>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>{t("Don't try to circumvent the AI rate limits, scrape bulk content, or attempt prompt-injection on our edge functions.", "请勿绕过 AI 限频、批量爬取内容或对我们的边缘函数发起 prompt-injection。")}</li>
            <li>{t("Don't upload images of other people without their consent.", "请勿未经他人同意上传其图像。")}</li>
            <li>{t("Don't use Aieats to plan meals for people with medical conditions in lieu of consulting a doctor.", "请勿在不咨询医生的前提下，仅依据爱吃为有医疗需求的家庭成员制定饮食。")}</li>
          </ul>
        </Section>

        <Section title={t("4. Allergies & dietary safety", "4. 过敏与饮食安全")}>
          {t(
            "You are responsible for double-checking every recommended dish against your actual allergies and medical advice. Aieats provides allergen filters but cannot guarantee complete coverage — recipe sources may contain hidden ingredients.",
            "您有责任根据自身实际过敏情况和医生建议复核每一道推荐菜品。爱吃提供过敏原过滤，但无法 100% 保证覆盖——食谱来源可能含有未标注的成分。"
          )}
        </Section>

        <Section title={t("5. Paid subscriptions", "5. 付费订阅")}>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>{t("Pricing is shown in HKD on the /pricing page. The active price at purchase time is final.", "价格以 HKD 在 /pricing 页面展示，下单时显示的价格为最终价。")}</li>
            <li>{t("Billing is processed by Stripe. We never receive your card number.", "扣费由 Stripe 处理，我们无法接触您的卡号。")}</li>
            <li>{t("Refund: within 7 days of first charge, request via email and we issue a full refund unless the AI menu was generated more than 3 times.", "退款：首次扣费后 7 天内可发邮件申请；若您已生成 AI 菜单超过 3 次则不予退款。")}</li>
            <li>{t("Cancel anytime: Settings → Subscription → Manage. Cancellation stops the next renewal; the current period remains usable.", "随时取消：「设置 → 订阅 → 管理」。取消后下一周期不再扣费，当前周期保留使用权。")}</li>
          </ul>
        </Section>

        <Section title={t("6. Content ownership", "6. 内容归属")}>
          {t(
            "You retain ownership of anything you submit (photos, preferences, member info). You grant Aieats a limited license to use it solely to operate the service for you. AI-generated menus are not copyrighted by us; you may use them freely.",
            "您保留所提交内容（照片、偏好、成员信息）的全部权利，仅授予爱吃为您运营服务所必需的有限许可。AI 生成的菜单不享有我们的著作权，您可自由使用。"
          )}
        </Section>

        <Section title={t("7. Disclaimer", "7. 免责声明")}>
          {t(
            "The service is provided “as is”. Aieats is not liable for: (a) food allergies from sources beyond declared ingredients, (b) dietary outcomes (weight, blood sugar, pregnancy nutrition, etc.), (c) AI generation downtime due to upstream providers.",
            "服务按「现状」提供。爱吃对以下情形不承担责任：（a）来自标注成分之外的食物过敏；（b）饮食带来的体重、血糖、孕产营养等结果；（c）因上游服务商导致的 AI 生成中断。"
          )}
        </Section>

        <Section title={t("8. Termination", "8. 终止")}>
          {t(
            "We may suspend accounts that abuse the AI quotas, attempt to compromise the service, or violate these terms. You may delete your account anytime in Settings.",
            "如您滥用 AI 限频、试图破坏服务或违反本条款，我们可暂停账户。您也可随时在「设置」中删除账户。"
          )}
        </Section>

        <Section title={t("9. Governing law", "9. 适用法律")}>
          {t(
            "These terms are governed by the laws of Hong Kong SAR. Disputes are first attempted via good-faith negotiation; failing that, Hong Kong courts have exclusive jurisdiction.",
            "本条款适用中国香港特别行政区法律。争议先经诚信协商解决；协商不成的，香港法院具有专属管辖权。"
          )}
        </Section>

        <Section title={t("10. Contact", "10. 联系")}>
          <p>jianjiaolin9@gmail.com</p>
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
