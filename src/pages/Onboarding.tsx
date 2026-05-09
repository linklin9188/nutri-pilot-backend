import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function Onboarding() {
  const [step, setStep] = useState(1);
  const navigate = useNavigate();
  const [selectedCards, setSelectedCards] = useState<string[]>([]);
  const [dinerCount, setDinerCount] = useState(4);
  const [language, setLanguage] = useState("English");
  const [selectedTags, setSelectedTags] = useState<string[]>(["damp_clear", "high_protein"]);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const cards = [
    {
      id: "c1",
      title: "花胶鸡汤",
      img: "https://lh3.googleusercontent.com/aida-public/AB6AXuAT8K2HZYhzHYFaZ07Rqs32WtkwSPn9QfCWpQFuZVgrKUxSHyMSqm8IkkldUa_dN1emAOS0CeSxLRfvUbxS8oqRgQ7b8auE4vlq9FwvBRddo52ckNYgumz16EYwtkP6pBPMrGo70oAcfFDU9GWWiGyCy_5gv0vVwdZRwAsJF0Og11iL5jB6A516GHt9sBYM5NBVc8a7x4DQ44sf6jioh9-4wos3lE0PDRZH7uBsR-l0k11mkZTs-_nvYP8PyBkO5_6xbTdgf35jHmQ7",
      type: "Nourishing",
    },
    {
      id: "c2",
      title: "清蒸东星斑",
      img: "https://lh3.googleusercontent.com/aida-public/AB6AXuC5nZyrKGBuM8IkjZo2OVhw9xkp-v5h899Rj0osD_4D7VPrAGgEOvmRZLgCPD9AUfGloHwIjpQnr3QqQqR9HOocDSzhrW9nasyo-wI5dZFigCK8AtDu9IFDWxkXX5rAbWm9QwLjETJOyeNoSMfOJsgZ00OCWgnstAsJ9Zgi7q9YnjrVvgFHxylc0pkTQfpHVQEgSvJdoazlUlLlltDlgB7Ghln0KlFu9IbovL9b38JhHsmNxW2RjRbIxoMd4VAXISKQbhrH9npIn8Te",
      type: "Protein",
    },
    {
      id: "c3",
      title: "羊肚菌鲜百合",
      img: "https://lh3.googleusercontent.com/aida-public/AB6AXuApj1zHqWGWKC_xwMy8yj4B1RzqbJkKicg5zZ6OjaL-H6jyNMVxHI99MgbHaH6oppwQ0WLlR2pmianDOIBXvoFEFiGntuZszypMHZcxc9iUtlTJMXzLTeFPv2-WTQAShrwlm8tR7UkeemFw6DODR_Bi78KeTY6PUdQKmODRxPnW1jmLPBtd5YLolVKsUtvIYCcvCTLVk6c_7zfs0eGM7dgEJzZnzy9MNOkySTHyz1go_mndj4ZCzurmrZAX8OkzmpnK7dPXEkhPSsgP",
      type: "Organic",
    },
  ];

  const handleCardToggle = (id: string) => {
    setSelectedCards((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
    // Auto advance if at least one is selected and on step 1
    if (step === 1) {
       setTimeout(() => setStep(2), 600);
    }
  };

  const handleComplete = async () => {
    localStorage.setItem("nutri_prefs", JSON.stringify({ selectedCards, dinerCount, language }));
    localStorage.setItem("curationTags", JSON.stringify(selectedTags));
    let userId = localStorage.getItem("nutri_user_id");
    if (!userId) {
      userId = crypto.randomUUID();
      localStorage.setItem("nutri_user_id", userId);
    }
    try {
      if (supabase) {
        await supabase.from("user_profiles").upsert({
          id: userId,
          taste_preferences: selectedCards,
          curation_tags: selectedTags,
          household_size: dinerCount,
          helper_language: language,
          updated_at: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.warn("[Supabase] user_profiles upsert failed:", err);
    }
    navigate(`/?userId=${userId}`);
  };

  return (
    <div className="font-sans text-on-surface antialiased overflow-x-hidden min-h-screen pb-32 flex flex-col max-w-md mx-auto relative bg-background">
      <header className="bg-surface/80 backdrop-blur-md font-headline-2 text-headline-2 docked full-width top-0 sticky flex justify-between items-center w-full px-margin-page py-4 z-50">
        <div className="flex flex-col">
          <div className="flex items-center gap-1">
            <span className="font-headline-2 text-[18px] font-semibold tracking-tight text-primary">
              Nutri-Pilot
            </span>
            <div className="w-1.5 h-1.5 rounded-full bg-primary-container"></div>
            <span className="ml-1 text-[18px] font-semibold text-on-surface">
              悦小厨
            </span>
          </div>
          <span className="font-label-caps text-label-caps text-secondary">
            Personalize Your Experience
          </span>
        </div>
      </header>

      <main className="flex-1 px-4 mt-6">
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <h1 className="text-headline-2 font-headline-2 font-medium">
                Select your preferred culinary styles
              </h1>
              <div className="grid grid-cols-1 gap-4">
                {cards.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => handleCardToggle(c.id)}
                    className={`relative rounded-card overflow-hidden h-40 cursor-pointer border-2 transition-all duration-300 ${
                      selectedCards.includes(c.id)
                        ? "border-[#D4AF37] shadow-[0_0_20px_rgba(212,175,55,0.3)]"
                        : "border-transparent shadow-[0_10px_30px_rgba(0,0,0,0.05)]"
                    }`}
                  >
                    <img
                      src={c.img}
                      alt={c.title}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                    <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end">
                      <div>
                        <h3 className="text-white font-semibold text-lg drop-shadow-md">
                          {c.title}
                        </h3>
                        <span className="text-white/80 text-[11px] uppercase tracking-widest font-label-caps">
                          {c.type}
                        </span>
                      </div>
                      {selectedCards.includes(c.id) && (
                        <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                          <span className="material-symbols-outlined text-white text-[16px]">check</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
            >
              <section className="bg-surface-container-lowest rounded-card p-6 border border-surface-container/50 shadow-sm">
                <h2 className="text-[17px] font-semibold mb-4">Household Baseline (Diners)</h2>
                <div className="flex items-center justify-between mt-4">
                  <div className="flex items-baseline gap-1">
                    <span className="text-[48px] font-bold text-primary leading-none">
                      {dinerCount}
                    </span>
                    <span className="text-[15px] text-secondary">People</span>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setDinerCount(Math.max(1, dinerCount - 1))}
                      className="w-12 h-12 rounded-full border border-surface-variant flex items-center justify-center active:scale-90 duration-200"
                    >
                      <span className="material-symbols-outlined text-secondary">remove</span>
                    </button>
                    <button
                      onClick={() => setDinerCount(dinerCount + 1)}
                      className="w-12 h-12 rounded-full border border-surface-variant flex items-center justify-center active:scale-90 duration-200"
                    >
                      <span className="material-symbols-outlined text-secondary">add</span>
                    </button>
                  </div>
                </div>
              </section>

              <section className="bg-surface-container-lowest rounded-card p-6 border border-surface-container/50 shadow-sm">
                <h2 className="text-[17px] font-semibold mb-4">Helper Instruction Language</h2>
                <div className="flex p-1 bg-surface-container rounded-xl w-full">
                  <button
                    onClick={() => setLanguage("English")}
                    className={`flex-1 py-3 text-[14px] rounded-lg transition-all ${
                      language === "English"
                        ? "bg-white shadow border border-surface-variant/50 font-bold text-on-background"
                        : "font-medium text-secondary"
                    }`}
                  >
                    English (🇬🇧)
                  </button>
                  <button
                    onClick={() => setLanguage("Tagalog")}
                    className={`flex-1 py-3 text-[14px] rounded-lg transition-all ${
                      language === "Tagalog"
                        ? "bg-white shadow border border-surface-variant/50 font-bold text-on-background"
                        : "font-medium text-secondary"
                    }`}
                  >
                    Tagalog (🇵🇭)
                  </button>
                </div>
              </section>

              <section className="bg-surface-container-lowest rounded-card p-6 border border-surface-container/50 shadow-sm">
                 <h2 className="text-[17px] font-semibold mb-4">Curation Tags</h2>
                 <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => toggleTag('damp_clear')}
                      className={`px-4 py-2 rounded-full text-[14px] font-medium border transition-all ${
                        selectedTags.includes('damp_clear')
                          ? 'shadow-[0_0_15px_rgba(255,90,31,0.15)] bg-primary/10 text-primary border-primary/20'
                          : 'bg-black/5 text-secondary border-transparent'
                      }`}
                    >
                      祛湿 (Damp Clear)
                    </button>
                    <button
                      onClick={() => toggleTag('high_protein')}
                      className={`px-4 py-2 rounded-full text-[14px] font-medium border transition-all ${
                        selectedTags.includes('high_protein')
                          ? 'shadow-[0_0_15px_rgba(255,90,31,0.15)] bg-primary/10 text-primary border-primary/20'
                          : 'bg-black/5 text-secondary border-transparent'
                      }`}
                    >
                      高蛋白 (High Protein)
                    </button>
                    <button
                      onClick={() => toggleTag('cantonese')}
                      className={`px-4 py-2 rounded-full text-[14px] font-medium border transition-all ${
                        selectedTags.includes('cantonese')
                          ? 'shadow-[0_0_15px_rgba(255,90,31,0.15)] bg-primary/10 text-primary border-primary/20'
                          : 'bg-black/5 text-secondary border-transparent'
                      }`}
                    >
                      粤菜 (Cantonese)
                    </button>
                 </div>
              </section>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {step === 2 && (
        <motion.footer
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed bottom-0 left-0 w-full z-50 bg-surface/90 backdrop-blur-xl px-4 pb-8 pt-4"
        >
          <div className="max-w-md mx-auto">
            <button
              onClick={handleComplete}
              className="w-full h-[52px] bg-gradient-to-r from-[#1D1D1F] to-[#3A3A3C] rounded-btn flex flex-col items-center justify-center active:scale-95 transition-transform shadow-xl"
            >
              <span className="text-on-primary text-[15px] font-semibold">
                Generate Custom Menu
              </span>
            </button>
          </div>
        </motion.footer>
      )}
    </div>
  );
}
