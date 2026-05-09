import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Settings() {
  const navigate = useNavigate();
  const [curationTags, setCurationTags] = useState<string[]>(() => {
    const saved = localStorage.getItem('curationTags');
    return saved ? JSON.parse(saved) : ["damp_clear", "daily_soup"];
  });
  const [isHouseholdOpen, setIsHouseholdOpen] = useState(false);

  const [helperName, setHelperName] = useState(() => {
    return localStorage.getItem('helperName') || 'Maria Santos';
  });
  const [helperLang, setHelperLang] = useState(() => {
    return localStorage.getItem('helperLang') || 'tagalog';
  });
  const [isHelperModalOpen, setIsHelperModalOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{role: 'user' | 'assistant', text: string}[]>([
    { role: 'assistant', text: `Hello sir/ma'am! I'm ${helperName}, your AI helper assistant. How can I help you today?` }
  ]);
  const [chatInput, setChatInput] = useState('');

  const handleSaveHelperSettings = () => {
    localStorage.setItem('helperName', helperName);
    localStorage.setItem('helperLang', helperLang);
    setIsHelperModalOpen(false);
  };

  const [members, setMembers] = useState([
    { id: '1', role: 'Father (爸爸)', age: 42 },
    { id: '2', role: 'Mother (妈妈)', age: 38 },
    { id: '3', role: 'Elderly (老人)', age: 65 },
    { id: '4', role: 'Child (孩子)', age: 10 },
    { id: '5', role: 'Child (孩子)', age: 6 },
  ]);

  const kidsCount = members.filter(m => m.role.includes('Child')).length;
  const adultsCount = members.length - kidsCount;
  const totalPeople = members.length;

  const [logistics, setLogistics] = useState(() => {
    const saved = localStorage.getItem('logisticsPrefs');
    return saved ? JSON.parse(saved) : {
      meat: 'Waves Pacific',
      produce: 'Eat FRESH',
      staples: 'Wellcome'
    };
  });

  const handleUpdateLogistics = (field: string, value: string) => {
    const updated = { ...logistics, [field]: value };
    setLogistics(updated);
    localStorage.setItem('logisticsPrefs', JSON.stringify(updated));
  };

  const handleUpdateMember = (id: string, field: string, value: string | number) => {
    setMembers(members.map(m => m.id === id ? { ...m, [field]: value } : m));
  };
  const handleDeleteMember = (id: string) => setMembers(members.filter(m => m.id !== id));
  const handleAddMember = () => setMembers([...members, { id: Date.now().toString(), role: 'Adult (成人)', age: 30 }]);

  const getRoleColor = (role: string) => {
    if (role === 'Elderly (老人)') return 'bg-primary';
    if (role === 'Child (孩子)' || role === 'Child (儿童)') return 'bg-primary';
    return 'bg-surface-container';
  };

  const toggleCurationTag = (tag: string) => {
    setCurationTags(prev => {
      const next = prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag];
      localStorage.setItem('curationTags', JSON.stringify(next));
      return next;
    });
  };

  return (
    <div className="flex justify-center items-start min-h-screen text-on-surface bg-background">
      <div className="w-full max-w-md min-h-screen relative overflow-x-hidden pb-32">
        <header className="fixed top-0 w-full max-w-md z-50 bg-surface/80 backdrop-blur-md px-6 h-20 flex justify-between items-center shadow-[0_10px_30px_rgba(0,0,0,0.03)] border-none">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="active:scale-95 transition-transform duration-200">
               <span className="material-symbols-outlined text-primary text-2xl">arrow_back</span>
            </button>
            <div className="w-10 h-10 rounded-full overflow-hidden border border-primary/20">
              <img alt="Executive Chef Profile" className="w-full h-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAhRHGsrgJgOz5FP9TQt7UN7zPO1XbbTg0fkZxATa1oderC-8nr2tBhCv-1_Ptog2aGoakLQziRO2lsEpeuDjRUbn7kiWD94OzB42oSFR-gPxLF6Yg01YNI_XD7yvYGNGmUvKH4eAN7d7Wngji-h63aIla6Bt9epHXnxP7VnyE-lEVC8ZvGZo_k6Loh5hDjiR8qHoTykwF8JltdKR3sGnZvm4XJmV3X-171EgeLBK9TjMWOFzoSU82onKttKx8BIueEzrlCpVEVYxYG" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-[20px] text-on-surface leading-none">Link</span>
              <span className="text-[11px] font-semibold text-primary uppercase tracking-wider mt-0.5">Elite Concierge Member</span>
            </div>
          </div>
        </header>

        <div className="mt-24 px-4 space-y-4">
          <section className="bg-white rounded-[24px] p-6 shadow-[0_10px_30px_rgba(0,0,0,0.03)] cursor-pointer active:scale-[0.98] transition-transform" onClick={() => setIsHouseholdOpen(true)}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-[13px] text-on-surface">Household Baseline (家庭常住人口)</h3>
              <span className="material-symbols-outlined text-secondary text-lg">group</span>
            </div>
            
            <div className="flex items-center justify-between pb-2">
              <div className="flex items-baseline gap-1">
                <span className="text-[36px] font-bold text-primary">{totalPeople}</span>
                <span className="text-[15px] text-secondary">Total</span>
              </div>
              <div className="text-right">
                <p className="text-[14px] font-semibold text-on-surface">{adultsCount} Adults, {kidsCount} Kids</p>
                <p className="text-[11px] text-secondary">Model accuracy: High</p>
              </div>
            </div>
          </section>

          <section className="bg-white rounded-[24px] p-6 shadow-[0_10px_30px_rgba(0,0,0,0.03)]">
            <h3 className="font-semibold text-[13px] text-on-surface mb-4">Curation Tags (定制推荐标签)</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                { id: 'damp_clear', label: '祛湿清热\n(Damp Clear)' },
                { id: 'auth_hk', label: '地道港味\n(Authentic HK)' },
                { id: 'daily_soup', label: '每日靓汤\n(Daily Soup)' },
                { id: 'spicy', label: '无辣不欢\n(Spicy Craving)' },
              ].map(tag => (
                <button
                  key={tag.id}
                  onClick={() => toggleCurationTag(tag.id)}
                  className={`flex items-center justify-center text-center px-4 py-4 rounded-[16px] text-[13px] font-bold border transition-all active:scale-[0.98] whitespace-pre-line leading-tight ${
                    curationTags.includes(tag.id)
                      ? 'shadow-[0_0_15px_rgba(255,90,31,0.15)] bg-primary/10 text-primary border-primary/20'
                      : 'bg-black/5 text-secondary border-transparent'
                  }`}
                >
                  {tag.label}
                </button>
              ))}
            </div>
          </section>

          <section className="bg-white rounded-[24px] p-6 shadow-[0_10px_30px_rgba(0,0,0,0.03)]">
            <h3 className="font-semibold text-[13px] text-on-surface mb-4">Helper Management (外佣助手设置)</h3>
            <div 
              className="flex items-center justify-between mb-6 p-3 bg-white rounded-xl border border-black/5 active:scale-[0.98] transition-transform cursor-pointer"
              onClick={() => setIsHelperModalOpen(true)}
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full overflow-hidden bg-black/10 flex-shrink-0">
                  <img alt={helperName} className="w-full h-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAPFNTo4wIQDPt8rn29ymek9Km0i_ZlmDkoKO-xlL2Dn7xQ6TM6Ii5H-VoRYxr0ywGemJ_JFgNjDGHrxYNj_O5d9qogjugJMavbgeephMQIl-81Fw8Si_67JiTxdmivMJ7itCub4dS0hru9wffkdULf-FlFBfbsgOX0OWuk6XnK2ai_azswnueXVssZ42UlsZN0YCKohd_EEv9kK2qWJInaTqlj8U_y_RCsVFhW9We0mtxQIaynWOXzkEZ9xtvGLSwznXmJkoLwlTVm" />
                </div>
                <div className="flex flex-col">
                  <span className="font-semibold text-[13px]">{helperName}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span className="text-[12px] text-secondary">Connected & Syncing</span>
                  </div>
                </div>
              </div>
              <span className="material-symbols-outlined text-secondary">chevron_right</span>
            </div>
            <div className="space-y-4">
              <label className="block text-[13px] text-secondary">Target Instruction Language (下发指令语言)</label>
              <div className="flex p-1 bg-black/5 rounded-xl w-full">
                <button 
                  onClick={() => { setHelperLang('english'); localStorage.setItem('helperLang', 'english'); }}
                  className={`flex-1 py-2 text-[13px] rounded-lg transition-all ${helperLang === 'english' ? 'font-bold text-on-surface bg-white shadow-[0_2px_8px_rgba(0,0,0,0.1)]' : 'font-medium text-secondary'}`}
                >
                  English
                </button>
                <button 
                  onClick={() => { setHelperLang('tagalog'); localStorage.setItem('helperLang', 'tagalog'); }}
                  className={`flex-1 py-2 text-[13px] rounded-lg transition-all ${helperLang === 'tagalog' ? 'font-bold text-on-surface bg-white shadow-[0_2px_8px_rgba(0,0,0,0.1)]' : 'font-medium text-secondary'}`}
                >
                  Tagalog
                </button>
              </div>
            </div>
          </section>

          <section className="bg-white rounded-[24px] p-6 shadow-[0_10px_30px_rgba(0,0,0,0.03)]">
            <h3 className="font-semibold text-[13px] text-on-surface mb-4">Logistics Routing (采购渠道偏好)</h3>
            <div className="space-y-4">
              {/* Meat/Seafood */}
              <div className="flex flex-col border-b border-[#E2E2E4]/30 pb-3">
                <span className="text-on-surface font-medium mb-2">Premium Meat/Seafood (肉类/海鲜)</span>
                <div className="relative">
                  <select 
                    value={logistics.meat}
                    onChange={(e) => handleUpdateLogistics('meat', e.target.value)}
                    className="w-full appearance-none bg-surface border border-black/5 rounded-[12px] px-4 py-2.5 text-[14px] font-bold text-primary outline-none"
                  >
                    <optgroup label="轻奢 (Premium)">
                      <option value="Waves Pacific">Waves Pacific</option>
                      <option value="Jett Foods">Jett Foods</option>
                      <option value="Tenderloin Fine Food">Tenderloin Fine Food</option>
                    </optgroup>
                    <optgroup label="精选 (Selected)">
                      <option value="Feather & Bone">Feather & Bone</option>
                      <option value="MeatMarket">MeatMarket</option>
                      <option value="Farmer's Market">Farmer's Market</option>
                    </optgroup>
                    <optgroup label="经济 (Economy)">
                      <option value="PARKnSHOP">PARKnSHOP (百佳)</option>
                      <option value="Wellcome">Wellcome (惠康)</option>
                      <option value="AEON">AEON</option>
                    </optgroup>
                  </select>
                  <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-secondary pointer-events-none text-[20px]">
                    expand_more
                  </span>
                </div>
              </div>

              {/* Organic Produce */}
              <div className="flex flex-col border-b border-[#E2E2E4]/30 pb-3">
                <span className="text-on-surface font-medium mb-2">Organic Produce (有机果蔬)</span>
                <div className="relative">
                  <select 
                    value={logistics.produce}
                    onChange={(e) => handleUpdateLogistics('produce', e.target.value)}
                    className="w-full appearance-none bg-surface border border-black/5 rounded-[12px] px-4 py-2.5 text-[14px] font-bold text-primary outline-none"
                  >
                    <optgroup label="轻奢 (Premium)">
                      <option value="Eat FRESH">Eat FRESH</option>
                      <option value="Jou Sun">Jou Sun</option>
                      <option value="EcoFarm">EcoFarm (生态农庄)</option>
                    </optgroup>
                    <optgroup label="精选 (Selected)">
                      <option value="SpiceBox Organics">SpiceBox Organics</option>
                      <option value="Green Common">Green Common</option>
                      <option value="Oisix">Oisix</option>
                    </optgroup>
                    <optgroup label="经济 (Economy)">
                      <option value="HKTVmall">HKTVmall</option>
                      <option value="Wet Market">Wet Market (街市)</option>
                      <option value="Local Grocer">Local Grocer (本地菜档)</option>
                    </optgroup>
                  </select>
                  <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-secondary pointer-events-none text-[20px]">
                    expand_more
                  </span>
                </div>
              </div>

              {/* Daily Staples */}
              <div className="flex flex-col">
                <span className="text-on-surface font-medium mb-2">Daily Staples (日常粮油)</span>
                <div className="relative">
                  <select 
                    value={logistics.staples}
                    onChange={(e) => handleUpdateLogistics('staples', e.target.value)}
                    className="w-full appearance-none bg-surface border border-black/5 rounded-[12px] px-4 py-2.5 text-[14px] font-bold text-primary outline-none"
                  >
                    <optgroup label="轻奢 (Premium)">
                      <option value="city'super">city'super</option>
                      <option value="Oliver's">Oliver's</option>
                      <option value="Great Food Hall">Great Food Hall</option>
                    </optgroup>
                    <optgroup label="精选 (Selected)">
                      <option value="Market Place">Market Place</option>
                      <option value="YATA">YATA (一田)</option>
                      <option value="SOGO Freshmart">SOGO Freshmart</option>
                    </optgroup>
                    <optgroup label="经济 (Economy)">
                      <option value="Wellcome">Wellcome (惠康)</option>
                      <option value="PARKnSHOP">PARKnSHOP (百佳)</option>
                      <option value="U Select">U Select (U购)</option>
                    </optgroup>
                  </select>
                  <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-secondary pointer-events-none text-[20px]">
                    expand_more
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section className="bg-white rounded-[24px] p-6 shadow-[0_10px_30px_rgba(0,0,0,0.03)]">
            <h3 className="font-semibold text-[13px] text-on-surface mb-4">Robot-Link Devices (智能厨电状态)</h3>
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-xl bg-black/5 flex items-center justify-center">
                <span className="material-symbols-outlined text-secondary">kitchen</span>
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-on-surface font-medium">Smart Cooker B1</span>
                  <span className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"></span>
                </div>
                <span className="text-[12px] text-secondary">Connected • Idle</span>
              </div>
            </div>
            <button className="w-full py-3 bg-primary/10 text-primary text-[13px] font-bold rounded-xl active:scale-[0.98] transition-transform">
              Manage Cooking Protocols
            </button>
          </section>

          <button 
            onClick={() => {
              localStorage.clear();
              navigate('/login');
            }}
            className="w-full bg-[#f8f8f8] border border-black/5 rounded-[24px] py-4 text-secondary font-bold text-[14px] active:scale-[0.98] transition-transform"
          >
            Sign Out (退出登录)
          </button>
        </div>

        <nav className="fixed bottom-0 w-full max-w-md z-50 pb-safe bg-surface/90 backdrop-blur-xl shadow-[0_-10px_30px_rgba(0,0,0,0.03)] border-none">
          <div className="flex justify-around items-center h-20 w-full px-4">
            <button onClick={() => navigate('/')} className="flex flex-col items-center justify-center text-secondary hover:text-primary transition-colors active:scale-90 duration-300 ease-out">
              <span className="material-symbols-outlined">home</span>
              <span className="text-[11px] font-bold mt-1">Home</span>
            </button>
            <button onClick={() => navigate('/delivery')} className="flex flex-col items-center justify-center text-secondary hover:text-primary transition-colors active:scale-90 duration-300 ease-out">
              <span className="material-symbols-outlined">analytics</span>
              <span className="text-[11px] font-bold mt-1">Status</span>
            </button>
            <button onClick={() => navigate('/prep')} className="flex flex-col items-center justify-center w-12 h-12 bg-primary text-white rounded-full active:scale-90 duration-300 ease-out -mt-8 shadow-lg">
              <span className="material-symbols-outlined">radio_button_checked</span>
            </button>
            <button onClick={() => navigate('/ai-pilot')} className="flex flex-col items-center justify-center text-secondary hover:text-primary transition-colors active:scale-90 duration-300 ease-out">
              <span className="material-symbols-outlined">support_agent</span>
              <span className="text-[11px] font-bold mt-1">Concierge</span>
            </button>
            <button className="flex flex-col items-center justify-center bg-primary/10 text-primary rounded-xl px-3 py-1 active:scale-90 duration-300 ease-out">
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>domain</span>
              <span className="text-[11px] font-bold mt-1">Center</span>
            </button>
          </div>
        </nav>

        {/* Household Modal Drawer */}
        <div className={`fixed inset-0 bg-black/60 z-[100] transition-opacity duration-300 ${isHouseholdOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => setIsHouseholdOpen(false)} />
        <div className={`fixed bottom-0 left-0 w-full bg-white rounded-t-3xl z-[101] transition-transform duration-300 transform ${isHouseholdOpen ? 'translate-y-0' : 'translate-y-full'} shadow-[0_-10px_40px_rgba(0,0,0,0.1)] max-h-[85vh] overflow-y-auto`}>
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-12 h-1.5 bg-black/10 rounded-full"></div>
          </div>
          
          <div className="px-6 pb-12 pt-2">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-[18px] font-bold text-on-surface">Household Baseline (家庭常住人口)</h2>
              <span className="material-symbols-outlined text-secondary text-xl">group</span>
            </div>

            <div className="flex items-center justify-between border-b border-[#E2E2E4]/50 pb-4 mb-6">
              <div className="flex items-baseline gap-1">
                <span className="text-[42px] font-bold text-primary leading-none">{totalPeople}</span>
                <span className="text-[16px] text-secondary font-medium">Total</span>
              </div>
              <div className="text-right">
                <p className="text-[16px] font-bold text-on-surface mb-0.5">{adultsCount} Adults, {kidsCount} Kids</p>
                <p className="text-[12px] text-secondary">Model accuracy: High</p>
              </div>
            </div>

            {/* Members Section */}
            <div className="mb-6">
              <div className="flex justify-between items-center mb-3">
                <span className="text-[13px] font-bold text-secondary tracking-wide">HOUSEHOLD MEMBERS (家庭成员)</span>
                <button onClick={handleAddMember} className="text-primary text-[13px] font-bold active:scale-95 transition-transform">+ Add</button>
              </div>
              <div className="space-y-3">
                {members.map(member => (
                  <div key={member.id} className="flex items-center justify-between bg-surface px-4 py-3.5 rounded-[16px] border border-black/5">
                    <div className="flex items-center gap-3">
                       <span className={`w-1.5 h-1.5 rounded-full ${getRoleColor(member.role)}`}></span>
                       <select 
                         value={member.role} 
                         onChange={(e) => handleUpdateMember(member.id, 'role', e.target.value)}
                         className="bg-transparent text-[15px] font-bold text-on-surface outline-none max-w-[140px] appearance-none cursor-pointer" 
                       >
                         <option value="Adult (成人)">Adult (成人)</option>
                         <option value="Father (爸爸)">Father (爸爸)</option>
                         <option value="Mother (妈妈)">Mother (妈妈)</option>
                         <option value="Elderly (老人)">Elderly (老人)</option>
                         <option value="Child (孩子)">Child (孩子)</option>
                       </select>
                    </div>
                    <div className="flex items-center gap-3">
                       <div className="flex items-center">
                         <input 
                           type="number" 
                           value={member.age} 
                           onChange={(e) => handleUpdateMember(member.id, 'age', parseInt(e.target.value) || 0)}
                           className="bg-transparent text-[14px] font-bold text-primary w-8 text-right outline-none" 
                         />
                         <span className="text-[14px] font-bold text-primary ml-1">yrs</span>
                       </div>
                       <button onClick={() => handleDeleteMember(member.id)} className="text-secondary opacity-40 hover:opacity-100 flex items-center justify-center p-1 active:scale-90 transition-transform">
                         <span className="material-symbols-outlined text-[18px]">close</span>
                       </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Helper Modal */}
      {isHelperModalOpen && (
        <div className="fixed inset-0 z-[100] flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsHelperModalOpen(false)}></div>
          <div className="relative bg-surface w-full max-w-md mx-auto rounded-t-[32px] pt-4 pb-10 px-6 shadow-2xl safe-area-pb translate-y-0 transition-transform duration-300">
            <div className="w-12 h-1.5 bg-black/10 rounded-full mx-auto mb-6"></div>
            
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-[20px] font-bold text-on-surface">Helper Settings</h2>
              <button className="text-secondary bg-black/5 rounded-full w-8 h-8 flex items-center justify-center active:scale-95" onClick={() => setIsHelperModalOpen(false)}>
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            
            <div className="space-y-6 mb-8">
              <div>
                <label className="block text-[13px] font-bold text-secondary mb-2">HELPER NAME (外佣名字)</label>
                <input 
                  type="text" 
                  value={helperName}
                  onChange={(e) => setHelperName(e.target.value)}
                  className="w-full bg-white border border-black/5 rounded-xl px-4 py-3 text-[15px] font-bold text-on-surface outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-[13px] font-bold text-secondary mb-2">INSTRUCTION LANGUAGE (语言)</label>
                <div className="flex p-1 bg-black/5 rounded-xl w-full">
                  <button 
                    onClick={() => setHelperLang('english')}
                    className={`flex-1 py-2 text-[13px] rounded-lg transition-all ${helperLang === 'english' ? 'font-bold text-on-surface bg-white shadow-[0_2px_8px_rgba(0,0,0,0.1)]' : 'font-medium text-secondary'}`}
                  >
                    English
                  </button>
                  <button 
                    onClick={() => setHelperLang('tagalog')}
                    className={`flex-1 py-2 text-[13px] rounded-lg transition-all ${helperLang === 'tagalog' ? 'font-bold text-on-surface bg-white shadow-[0_2px_8px_rgba(0,0,0,0.1)]' : 'font-medium text-secondary'}`}
                  >
                    Tagalog
                  </button>
                  <button 
                    onClick={() => setHelperLang('indonesian')}
                    className={`flex-1 py-2 text-[13px] rounded-lg transition-all ${helperLang === 'indonesian' ? 'font-bold text-on-surface bg-white shadow-[0_2px_8px_rgba(0,0,0,0.1)]' : 'font-medium text-secondary'}`}
                  >
                    Indonesian
                  </button>
                </div>
              </div>

              <div className="pt-4 border-t border-black/5">
                <button 
                  onClick={() => { setIsHelperModalOpen(false); setIsChatOpen(true); }}
                  className="w-full flex items-center justify-center gap-2 bg-[#F0F4E8] text-[#5F6E40] py-4 rounded-2xl font-bold text-[15px] active:scale-[0.98] transition-transform border border-[#E0E8D0]"
                >
                  <span className="material-symbols-outlined text-[20px]">chat</span>
                  Open AI Chat window with {helperName}
                </button>
              </div>
            </div>

            <button className="w-full h-14 bg-[#2D3748] text-white rounded-2xl font-semibold text-[16px] shadow-lg active:scale-[0.98] transition-transform" onClick={handleSaveHelperSettings}>
              Save Settings
            </button>
          </div>
        </div>
      )}

      {/* Helper AI Chat */}
      {isChatOpen && (
        <div className="fixed inset-0 z-[110] flex flex-col bg-surface max-w-md mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-12 pb-4 bg-white/80 backdrop-blur-xl border-b border-black/5 top-0 sticky z-10">
            <div className="flex items-center gap-3">
              <button className="text-on-surface p-1 -ml-1 active:scale-95" onClick={() => setIsChatOpen(false)}>
                <span className="material-symbols-outlined text-[24px]">close</span>
              </button>
              <div className="w-10 h-10 rounded-full overflow-hidden bg-black/10">
                <img alt={helperName} className="w-full h-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAPFNTo4wIQDPt8rn29ymek9Km0i_ZlmDkoKO-xlL2Dn7xQ6TM6Ii5H-VoRYxr0ywGemJ_JFgNjDGHrxYNj_O5d9qogjugJMavbgeephMQIl-81Fw8Si_67JiTxdmivMJ7itCub4dS0hru9wffkdULf-FlFBfbsgOX0OWuk6XnK2ai_azswnueXVssZ42UlsZN0YCKohd_EEv9kK2qWJInaTqlj8U_y_RCsVFhW9We0mtxQIaynWOXzkEZ9xtvGLSwznXmJkoLwlTVm" />
              </div>
              <div className="flex flex-col">
                <span className="text-[16px] font-bold text-on-surface leading-tight">{helperName}</span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span className="text-[12px] text-secondary leading-none">Online & Ready</span>
                </div>
              </div>
            </div>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {chatMessages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-[20px] px-4 py-3 text-[15px] shadow-[0_2px_8px_rgba(0,0,0,0.02)] ${
                  msg.role === 'user' 
                    ? 'bg-surface-container text-white rounded-br-[4px]' 
                    : 'bg-white text-on-surface border border-black/5 rounded-bl-[4px]'
                }`}>
                  {msg.text}
                </div>
              </div>
            ))}
          </div>

          {/* Input */}
          <div className="p-4 bg-white border-t border-black/5 safe-area-pb">
            <div className="flex items-center gap-2 bg-surface rounded-full border border-black/5 px-4 py-2">
              <input 
                type="text"
                placeholder="Type a message..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && chatInput.trim()) {
                    setChatMessages([...chatMessages, { role: 'user', text: chatInput.trim() }]);
                    setChatInput('');
                    setTimeout(() => {
                      setChatMessages(prev => [...prev, { role: 'assistant', text: `Yes, I will handle that for you right away.` }]);
                    }, 1000);
                  }
                }}
                className="flex-1 bg-transparent border-none outline-none text-[15px]"
              />
              <button 
                onClick={() => {
                  if (chatInput.trim()) {
                    setChatMessages([...chatMessages, { role: 'user', text: chatInput.trim() }]);
                    setChatInput('');
                    setTimeout(() => {
                      setChatMessages(prev => [...prev, { role: 'assistant', text: `Yes, I will handle that for you right away.` }]);
                    }, 1000);
                  }
                }}
                className="w-8 h-8 flex items-center justify-center bg-primary text-white rounded-full active:scale-95 transition-transform"
              >
                <span className="material-symbols-outlined text-[18px]">arrow_upward</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
