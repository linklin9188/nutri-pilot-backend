import { useNavigate } from "react-router-dom";
import { useLanguage } from "../contexts/LanguageContext";

export default function DeliveryTracking() {
  const navigate = useNavigate();
  const { t3 } = useLanguage();

  return (
    <div className="min-h-screen bg-[#f5f5f7] flex flex-col items-center justify-center p-6 text-center">
      <span className="material-symbols-outlined" style={{ fontSize: 80, color: '#FF5A1F' }}>
        local_shipping
      </span>
      <h1 className="text-2xl font-bold mt-6 mb-2" style={{ color: '#1a1a1a' }}>
        🚧 {t3('Coming Soon', '即将上线', 'Paparating na')}
      </h1>
      <p className="text-base mb-2" style={{ color: 'rgba(0,0,0,0.6)' }}>
        {t3(
          'Live delivery tracking',
          '实时物流追踪',
          'Live na pag-track ng delivery'
        )}
      </p>
      <p className="text-sm mb-8" style={{ color: 'rgba(0,0,0,0.45)' }}>
        {t3(
          'We are integrating with our supplier delivery systems. Real-time order status will be available after launch.',
          '我们正在对接供应商物流系统, 上线后可实时查看订单状态。',
          'Kasalukuyang nag-iintegrate sa supplier delivery systems. Real-time order status pagkatapos ng launch.'
        )}
      </p>
      <button
        onClick={() => navigate('/orders')}
        className="px-6 py-3 rounded-2xl font-bold text-white active:scale-95"
        style={{ background: 'linear-gradient(135deg, #FF5A1F, #FF9054)' }}
      >
        {t3('View My Orders', '查看我的订单', 'Tingnan ang aking orders')}
      </button>
      <button
        onClick={() => navigate(-1)}
        className="mt-3 px-6 py-2 text-sm"
        style={{ color: 'rgba(0,0,0,0.5)' }}
      >
        {t3('Back', '返回', 'Bumalik')}
      </button>
    </div>
  );
}
