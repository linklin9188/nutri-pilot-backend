import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useRecommendDishes, fetchSwapOptions, type SupabaseDish } from "../hooks/useSupabaseMenu";
import { useWeeklyMenu } from "../hooks/useWeeklyMenu";
import { useFeedbackInput } from "../hooks/useFeedbackInput";
import { analyzeFridgePhoto, fileToBase64, type FridgeDish } from "../lib/geminiVision";

export default function Home() {
  const navigate = useNavigate();

  // ── mealTime must be declared before useRecommendDishes ──────────────────
  const [mealTime, setMealTime] = useState<'早餐' | '午餐' | '晚餐'>(() => {
    const hour = new Date().getHours();
    if (hour < 10) return "早餐";
    if (hour < 15) return "午餐";
    return "晚餐";
  });

  // People count must be declared before useRecommendDishes
  const [todayAdults, setTodayAdults] = useState(3);
  const [todayKids, setTodayKids] = useState(2);

  const [veganOnly, setVeganOnly] = useState(false);
  const { recommendedDishes, currentSolarTerm, prefScores, loading: dishesLoading, refresh: refreshMenu } = useRecommendDishes(mealTime, veganOnly, todayAdults, todayKids);
  const { weeklyMenu, loading: weeklyLoading, regenerate: regenerateWeekly } = useWeeklyMenu();
  const { submit: submitFeedback, submitting: feedbackSubmitting } = useFeedbackInput({
    currentScores: prefScores,
    onScoresUpdated: () => refreshMenu(),
  });
  const [isDetox, setIsDetox] = useState(false);
  const [menuSwaps, setMenuSwaps] = useState<Record<number, any>>({});
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isSwapOpen, setIsSwapOpen] = useState(false);

  // ── Fridge scan ──────────────────────────────────────────────────────────
  const [isFridgeScanOpen, setIsFridgeScanOpen]       = useState(false);
  const [fridgeScanLoading, setFridgeScanLoading]     = useState(false);
  const [fridgeIngredients, setFridgeIngredients]     = useState<string[]>([]);
  const [fridgeDishes, setFridgeDishes]               = useState<FridgeDish[]>([]);
  const [fridgeError, setFridgeError]                 = useState<string | null>(null);
  const [fridgePreview, setFridgePreview]             = useState<string | null>(null);
  const fridgeInputRef = useRef<HTMLInputElement>(null);
  const [isDinerSelectorOpen, setIsDinerSelectorOpen] = useState(false);
  const [currentTaste, setCurrentTaste] = useState("default");
  const [isTasteSelectorOpen, setIsTasteSelectorOpen] = useState(false);
  const [userCraving, setUserCraving] = useState("");
  const [isCravingModalOpen, setIsCravingModalOpen] = useState(false);

  interface DietRecord {
    id: string;
    image: string;
    feeling: string;
    date: string;
  }
  
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [isTakingPhoto, setIsTakingPhoto] = useState(false);
  const [newFeeling, setNewFeeling] = useState("");
  const [tempPhoto, setTempPhoto] = useState<string | null>(null);
  const [dietRecords, setDietRecords] = useState<DietRecord[]>(() => {
    const saved = localStorage.getItem('dietRecords');
    return saved ? JSON.parse(saved) : [];
  });
  const [hasSolarTerm, setHasSolarTerm] = useState(false); // Can be toggled if today is solar term
  // mealTime is declared at the top of the component (before useRecommendDishes)
  const [selectedDayOfWeek, setSelectedDayOfWeek] = useState(() => {
    const dict = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
    return dict[new Date().getDay()];
  });
  const [isMealTimeDropdownOpen, setIsMealTimeDropdownOpen] = useState(false);
  const [curationTags, setCurationTags] = useState<string[]>(() => {
    const saved = localStorage.getItem('curationTags');
    return saved ? JSON.parse(saved) : ["damp_clear", "daily_soup"];
  });

  useEffect(() => {
    setMenuSwaps({});
  }, [mealTime, selectedDayOfWeek, currentTaste, todayAdults, todayKids]);

  // Fallback static data based on provided HTML
  const getDynamicMenu = () => {
    const totalPeople = todayAdults + todayKids;
    const menu = [];

    // Pure Green / Detox Menu Profile
    if (isDetox) {
      menu.push({
        id: "detox1",
        title: "清炒有机时蔬",
        type: "VEGGIE",
        desc: "Stir-fried Organic Seasonal Vegetables",
        img: "https://lh3.googleusercontent.com/aida-public/AB6AXuC9zCHf_9BIKpLclYQqkpqP9nn5zZqxJXAVRvjD9VcDb-Z-cLrkWLiw_55qAym81OiuT-JDaMw-3NH7TMyWJfPVtc4QrR-WxO4wFP87qoFAZ1IbxWfAY9aDqI31jzwhyYWyum31tb7OSl_7bXfP9QfLSPmZwLBJrs6-pBG0Hk14ZJqEsUhuk1wwBq-oVBabIjf7Pvq7ln-1-juESFbCftUpcLM2H_M9_LxxHKMGrEfKkvz9tx_oUFsIBUua32ZIsMhwPouaylI0Byy8",
        highlight: true,
      });
      menu.push({
        id: "detox2",
        title: "香煎素牛排",
        type: "VEGGIE",
        desc: "Pan-Seared Plant-based Steak",
        img: "https://lh3.googleusercontent.com/aida-public/AB6AXuDQmXgQzO0KqO-X-4YI2V6lW-v82KqI4gZ1g8hW2v4f1vT9j6g6xQVx2y2T1_gVyVqFhBv_iG1_E_6t4sQ4x7u9q8o1uG6vB2v6hK6l_vH3qV8wD3xF5V2yW4T9yC8lK2pQ8qA9yU6xB1wH4gC3vE9zP-5R9rXv8uF-4zE1tV5wN6sJ-uH6vB1yK4qG-yT8fD_6sK_9mX4bZ0kY3rP-5eA3vC9tB-2rW9gH0",
        highlight: false,
      });
      menu.push({
        id: "detox3",
        title: "姬松茸野生菌菇汤",
        type: "SOUP",
        desc: "Wild Mushroom Soup",
        img: "https://lh3.googleusercontent.com/aida-public/AB6AXuAT8K2HZYhzHYFaZ07Rqs32WtkwSPn9QfCWpQFuZVgrKUxSHyMSqm8IkkldUa_dN1emAOS0CeSxLRfvUbxS8oqRgQ7b8auE4vlq9FwvBRddo52ckNYgumz16EYwtkP6pBPMrGo70oAcfFDU9GWWiGyCy_5gv0vVwdZRwAsJF0Og11iL5jB6A516GHt9sBYM5NBVc8a7x4DQ44sf6jioh9-4wos3lE0PDRZH7uBsR-l0k11mkZTs-_nvYP8PyBkO5_6xbTdgf35jHmQ7",
        highlight: false,
      });
      if (totalPeople >= 3) {
        menu.push({
          id: "detox4",
          title: "清心降火百合莲子羹",
          type: "SOUP",
          desc: "Lily Bulb & Lotus Seed Sweet Soup",
          img: "https://images.unsplash.com/photo-1574484284002-952d92456975?q=80&w=400&auto=format&fit=crop",
          highlight: false,
        });
      }
      return menu;
    }

    if (mealTime === "早餐") {
      menu.push({
        id: "b1",
        title: currentTaste === "spicy" ? "红油抄手" : "营养杂粮粥配水煮蛋",
        type: "MAIN",
        desc: currentTaste === "spicy" ? "Spicy Wontons" : "Multigrain Porridge & Boiled Eggs",
        img: currentTaste === "spicy" ? "https://images.unsplash.com/photo-1563245372-f21724e3856d?q=80&w=400&auto=format&fit=crop" : "https://images.unsplash.com/photo-1517609948086-6a0511baa1ca?q=80&w=400&auto=format&fit=crop",
        highlight: currentTaste !== "spicy",
      });
      menu.push({
        id: "b2",
        title: "港式流沙包",
        type: "DIMSUM",
        desc: "Lava Salted Egg Yolk Buns",
        img: "https://images.unsplash.com/photo-1563245372-f21724e3856d?q=80&w=400&auto=format&fit=crop",
        highlight: currentTaste === "spicy",
      });
      if (totalPeople >= 3) {
        menu.push({
          id: "b3",
          title: "鲜榨玉米汁",
          type: "DRINK",
          desc: "Fresh Corn Juice",
          img: "https://images.unsplash.com/photo-1574484284002-952d92456975?q=80&w=400&auto=format&fit=crop",
          highlight: false,
        });
      }
      return menu;
    }

    if (mealTime === "午餐") {
      menu.push({
        id: "l1",
        title: currentTaste === "spicy" ? "水煮黑豚肉卷" : (currentTaste === "seafood" ? "姜葱炒花蟹" : "滑蛋虾仁"),
        type: currentTaste === "spicy" ? "MEAT" : "SEAFOOD",
        desc: "Quick & Nutritious Lunch Main",
        img: currentTaste === "spicy" 
          ? "https://lh3.googleusercontent.com/aida-public/AB6AXuCeFEl2mNIfre8YXV3tgomTrFQaXfpivoa2csjBvSG3-6KDia-omgSXPNGwPdGpaJrzSpy_PX2nHaYlcrW3BRUwTf-J6uJE3l_YJe6TFYBupRf2ik_8gilfFcCxCP4H2qHVievKDTbiFTt2KQI61wR49qA2ESdhKQIa6ZZivHbFjlIngJGJzFIFzRHA1w-jbtimsGKxAoVUV8Kk8reV8ixA-RxY_qh9QVAtCm3S1EerrwbBQnx82JJUn8e8AjtyGgT3Ik4wOKZFqfHw" 
          : "https://lh3.googleusercontent.com/aida-public/AB6AXuAFojfwA-P3HA8OjcYc8PgxadWPWZwVbw4VARavs91spF9B_fzi-7A8a5sm6JAs7wt8wOuJppmaGM2z5rEgLq_AiKQrjuLPzoaxeCM_EHfsAHSUnKlwaIqegshSY3ekJIaof9AS0-AcM32TQEHXs3oss-z-J7NeOsTk9efLfBQeknSjW1eKpOB9QDKMN-eRAxBNtz9NpwAVQ7UuW7k5Qh8o3jg3rTuOAyrDf52TAJA3Z-cKVwbM3q9S3gUthIR3fxQyZL0EQHjmU6V2",
        highlight: true,
      });
      menu.push({
        id: "l2",
        title: "清炒罗马生菜",
        type: "VEGGIE",
        desc: "Stir-fried Romaine Lettuce",
        img: "https://lh3.googleusercontent.com/aida-public/AB6AXuC9zCHf_9BIKpLclYQqkpqP9nn5zZqxJXAVRvjD9VcDb-Z-cLrkWLiw_55qAym81OiuT-JDaMw-3NH7TMyWJfPVtc4QrR-WxO4wFP87qoFAZ1IbxWfAY9aDqI31jzwhyYWyum31tb7OSl_7bXfP9QfLSPmZwLBJrs6-pBG0Hk14ZJqEsUhuk1wwBq-oVBabIjf7Pvq7ln-1-juESFbCftUpcLM2H_M9_LxxHKMGrEfKkvz9tx_oUFsIBUua32ZIsMhwPouaylI0Byy8",
        highlight: false,
      });
      if (totalPeople >= 3) {
        menu.push({
          id: "l3",
          title: "无骨白切鸡",
          type: "MEAT",
          desc: "Boneless Poached Chicken",
          img: "https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?q=80&w=400&auto=format&fit=crop",
          highlight: false,
        });
      }
      return menu;
    }

    // Always include a Main Meat & Seafood (unless Veggie taste) for DINNER
    if (currentTaste !== "veggie") {
      if (currentTaste === "seafood") {
        menu.push({
          id: "dish1",
          title: "姜葱炒花蟹",
          type: "SEAFOOD",
          desc: "Ginger Scallion Crab",
          img: "https://lh3.googleusercontent.com/aida-public/AB6AXuAFojfwA-P3HA8OjcYc8PgxadWPWZwVbw4VARavs91spF9B_fzi-7A8a5sm6JAs7wt8wOuJppmaGM2z5rEgLq_AiKQrjuLPzoaxeCM_EHfsAHSUnKlwaIqegshSY3ekJIaof9AS0-AcM32TQEHXs3oss-z-J7NeOsTk9efLfBQeknSjW1eKpOB9QDKMN-eRAxBNtz9NpwAVQ7UuW7k5Qh8o3jg3rTuOAyrDf52TAJA3Z-cKVwbM3q9S3gUthIR3fxQyZL0EQHjmU6V2",
          highlight: true,
        });
      } else {
        menu.push({
          id: "dish1",
          title: currentTaste === "spicy" ? "水煮黑豚肉卷" : "回锅黑豚肉",
          type: "MEAT",
          desc: currentTaste === "spicy" ? "Spicy Sichuan Style" : "Premium Black Pork",
          img: "https://lh3.googleusercontent.com/aida-public/AB6AXuCeFEl2mNIfre8YXV3tgomTrFQaXfpivoa2csjBvSG3-6KDia-omgSXPNGwPdGpaJrzSpy_PX2nHaYlcrW3BRUwTf-J6uJE3l_YJe6TFYBupRf2ik_8gilfFcCxCP4H2qHVievKDTbiFTt2KQI61wR49qA2ESdhKQIa6ZZivHbFjlIngJGJzFIFzRHA1w-jbtimsGKxAoVUV8Kk8reV8ixA-RxY_qh9QVAtCm3S1EerrwbBQnx82JJUn8e8AjtyGgT3Ik4wOKZFqfHw",
          highlight: false,
        });
      }

      menu.push({
        id: "dish2",
        title: currentTaste === "light" ? "清蒸东星斑" : "港式避风塘炒蟹",
        type: "SEAFOOD",
        desc: currentTaste === "light" ? "Steamed Garoupa" : "Typhoon Shelter Crab",
        img: currentTaste === "light" ? "https://lh3.googleusercontent.com/aida-public/AB6AXuC5nZyrKGBuM8IkjZo2OVhw9xkp-v5h899Rj0osD_4D7VPrAGgEOvmRZLgCPD9AUfGloHwIjpQnr3QqQqR9HOocDSzhrW9nasyo-wI5dZFigCK8AtDu9IFDWxkXX5rAbWm9QwLjETJOyeNoSMfOJsgZ00OCWgnstAsJ9Zgi7q9YnjrVvgFHxylc0pkTQfpHVQEgSvJdoazlUlLlltDlgB7Ghln0KlFu9IbovL9b38JhHsmNxW2RjRbIxoMd4VAXISKQbhrH9npIn8Te" : "https://lh3.googleusercontent.com/aida-public/AB6AXuAFojfwA-P3HA8OjcYc8PgxadWPWZwVbw4VARavs91spF9B_fzi-7A8a5sm6JAs7wt8wOuJppmaGM2z5rEgLq_AiKQrjuLPzoaxeCM_EHfsAHSUnKlwaIqegshSY3ekJIaof9AS0-AcM32TQEHXs3oss-z-J7NeOsTk9efLfBQeknSjW1eKpOB9QDKMN-eRAxBNtz9NpwAVQ7UuW7k5Qh8o3jg3rTuOAyrDf52TAJA3Z-cKVwbM3q9S3gUthIR3fxQyZL0EQHjmU6V2",
        highlight: currentTaste !== "seafood",
      });
    } else {
      // Veggie Taste Mains
      menu.push({
        id: "dish1",
        title: "香煎素牛排",
        type: "VEGGIE",
        desc: "Pan-Seared Plant-based Steak",
        img: "https://lh3.googleusercontent.com/aida-public/AB6AXuDQmXgQzO0KqO-X-4YI2V6lW-v82KqI4gZ1g8hW2v4f1vT9j6g6xQVx2y2T1_gVyVqFhBv_iG1_E_6t4sQ4x7u9q8o1uG6vB2v6hK6l_vH3qV8wD3xF5V2yW4T9yC8lK2pQ8qA9yU6xB1wH4gC3vE9zP-5R9rXv8uF-4zE1tV5wN6sJ-uH6vB1yK4qG-yT8fD_6sK_9mX4bZ0kY3rP-5eA3vC9tB-2rW9gH0",
        highlight: true,
      });
    }

    // If more than 2 people, add a Veggie (or an extra Veggie if already veggie)
    if (totalPeople >= 3) {
      menu.push({
        id: "dish3",
        title: currentTaste === "spicy" ? "呛炒手撕包菜" : "蒜蓉本地有机菜心",
        type: "VEGGIE",
        desc: currentTaste === "spicy" ? "Spicy Cabbage" : "Organic Choy Sum",
        img: "https://lh3.googleusercontent.com/aida-public/AB6AXuC9zCHf_9BIKpLclYQqkpqP9nn5zZqxJXAVRvjD9VcDb-Z-cLrkWLiw_55qAym81OiuT-JDaMw-3NH7TMyWJfPVtc4QrR-WxO4wFP87qoFAZ1IbxWfAY9aDqI31jzwhyYWyum31tb7OSl_7bXfP9QfLSPmZwLBJrs6-pBG0Hk14ZJqEsUhuk1wwBq-oVBabIjf7Pvq7ln-1-juESFbCftUpcLM2H_M9_LxxHKMGrEfKkvz9tx_oUFsIBUua32ZIsMhwPouaylI0Byy8",
        highlight: false,
      });
    }

    // Always add soup
    menu.push({
      id: "dish4",
      title: currentTaste === "veggie" ? "姬松茸野生菌菇汤" : "招牌花胶鸡汤",
      type: "SOUP",
      desc: currentTaste === "veggie" ? "Wild Mushroom Soup" : "Premium Fish Maw Soup",
      img: "https://lh3.googleusercontent.com/aida-public/AB6AXuAT8K2HZYhzHYFaZ07Rqs32WtkwSPn9QfCWpQFuZVgrKUxSHyMSqm8IkkldUa_dN1emAOS0CeSxLRfvUbxS8oqRgQ7b8auE4vlq9FwvBRddo52ckNYgumz16EYwtkP6pBPMrGo70oAcfFDU9GWWiGyCy_5gv0vVwdZRwAsJF0Og11iL5jB6A516GHt9sBYM5NBVc8a7x4DQ44sf6jioh9-4wos3lE0PDRZH7uBsR-l0k11mkZTs-_nvYP8PyBkO5_6xbTdgf35jHmQ7",
      highlight: false,
    });

    // Extra Dish recommended (instead of relying on 70% fullness logic)
    menu.push({
      id: "dish5",
      title: "无骨白切鸡",
      type: "MEAT",
      desc: "Boneless Poached Chicken",
      img: "https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?q=80&w=400&auto=format&fit=crop",
      highlight: false,
    });

    return menu;
  };

  const isLoggedIn = !!localStorage.getItem('isLoggedIn');

  useEffect(() => {
    // No forced login — anonymous users can browse menu
    // If no prefs at all, redirect to quick setup
    if (!localStorage.getItem('quickPrefs') && !localStorage.getItem('isLoggedIn')) {
      navigate('/setup');
      return;
    }

    const savedTaste = localStorage.getItem('userTaste');
    if (savedTaste && currentTaste === "default") {
       if (savedTaste === 'light') setCurrentTaste('light');
       if (savedTaste === 'spicy') setCurrentTaste('spicy');
       if (savedTaste === 'savory') setCurrentTaste('seafood');
       if (savedTaste === 'veggie' || savedTaste === 'fatloss') setCurrentTaste('veggie');
    }
  }, [navigate]);

  useEffect(() => {
    // Simulate AI Menu Generation from backend
    setIsAiLoading(true);
    setMenuSwaps({}); // reset swaps when taste/people change
    const timer = setTimeout(() => {
      setIsAiLoading(false);
    }, 600);
    return () => clearTimeout(timer);
  }, [todayAdults, todayKids, currentTaste, isDetox]);

  const handleCravingSubmit = async (e?: React.FormEvent, cravingText?: string) => {
    if (e) e.preventDefault();
    const textToSubmit = cravingText || userCraving;
    if (!textToSubmit.trim() || feedbackSubmitting) return;

    setIsCravingModalOpen(false);
    setUserCraving("");
    // Submit to EMA learning loop → saves to Supabase + refreshes recommendations
    await submitFeedback(textToSubmit);
  };

  const [selectedSwap, setSelectedSwap] = useState<string>("");
  const [swappingDishIndex, setSwappingDishIndex] = useState<number | null>(null);
  const [swapOptions, setSwapOptions] = useState<SupabaseDish[]>([]);
  const [isSwapLoading, setIsSwapLoading] = useState(false);

  // Breakfast: DB currently only has lunch/dinner dishes — use static until
  // meal_type column is populated with breakfast data (see scripts/import-dishes.ts)
  const baseMenu = (mealTime !== "早餐" && recommendedDishes.length > 0)
    ? recommendedDishes
    : getDynamicMenu();
  const displayMenu = baseMenu.map((dish, idx) => menuSwaps[idx] || dish);
  const effectiveLoading = isAiLoading || dishesLoading;

  const handleSwapConfirm = () => {
    if (swappingDishIndex !== null) {
      const option = swapOptions.find(opt => opt.id === selectedSwap);
      if (option) {
        setMenuSwaps(prev => ({ ...prev, [swappingDishIndex]: option }));
      }
    }
    setIsSwapOpen(false);
  };

  const openSwapDrawer = async (idx: number) => {
    const dish = displayMenu[idx];
    setSwappingDishIndex(idx);
    setSwapOptions([]);
    setSelectedSwap("");
    setIsSwapOpen(true);
    setIsSwapLoading(true);
    try {
      const options = await fetchSwapOptions(dish as SupabaseDish, 3);
      setSwapOptions(options);
      if (options.length > 0) setSelectedSwap(options[0].id);
    } finally {
      setIsSwapLoading(false);
    }
  };

  const handleFridgeScan = async (file: File) => {
    setFridgeScanLoading(true);
    setFridgeError(null);
    setFridgeDishes([]);
    setFridgeIngredients([]);
    // Show preview immediately
    const objectUrl = URL.createObjectURL(file);
    setFridgePreview(objectUrl);
    setIsFridgeScanOpen(true);
    try {
      const { base64, mimeType } = await fileToBase64(file);
      const result = await analyzeFridgePhoto(base64, mimeType);
      setFridgeIngredients(result.detected_ingredients);
      setFridgeDishes(result.dishes);
    } catch (err) {
      setFridgeError('识别失败，请重试');
    } finally {
      setFridgeScanLoading(false);
    }
  };

  // Dynamic Nutrition logic based on current menu
  const getNutritionMetrics = () => {
    let focus = "Protein Synthesis";
    let secondFocus = "Joint Health";
    let chart = [60, 40, 95, 55, 70]; // Default sizes

    if (isDetox) {
      focus = "Detoxification & Cleansing";
      secondFocus = "Gut Health";
      chart = [85, 30, 45, 90, 60]; 
    } else {
      const hasSeafood = displayMenu.some((d: any) => d.type === 'SEAFOOD');
      const hasVeggie = displayMenu.some((d: any) => d.type === 'VEGGIE');
      const hasSoup = displayMenu.some((d: any) => d.type === 'SOUP');
      const hasMeat = displayMenu.some((d: any) => d.type === 'MEAT');
      
      if (hasSeafood && !hasMeat) {
        focus = "Lean Protein";
        secondFocus = "Cardiovascular Health";
        chart = [50, 70, 85, 60, 75];
      } else if (hasVeggie && !hasMeat && !hasSeafood) {
         focus = "High Fiber";
         secondFocus = "Digestive Balance";
         chart = [90, 20, 30, 85, 50];
      } else if (hasSoup && hasMeat) {
        focus = "Immune Support";
        secondFocus = "Energy Restoration";
        chart = [70, 50, 60, 80, 85];
      } else {
        // mixed
        focus = "Protein Synthesis";
        secondFocus = "Joint Health";
        chart = [40, 60, 95, 45, 65];
      }
    }
    
    return { focus, secondFocus, chart };
  };

  const nutrition = getNutritionMetrics();

  return (
    <div className="font-sans text-on-surface antialiased overflow-x-hidden pb-32 w-full max-w-md mx-auto relative min-h-screen bg-background">
      {/* TopAppBar */}

      <header className="bg-surface/80 backdrop-blur-xl sticky top-0 flex justify-between items-center w-full px-5 py-4 z-50 border-b border-black/5">
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="font-serif text-[22px] font-bold tracking-tight text-primary">
              爱吃 <span className="font-sans text-[16px] text-on-surface tracking-normal font-bold">Aieats</span>
            </span>
          </div>
        </div>
        <div className="relative active:scale-95 transition-transform cursor-pointer"
          onClick={() => navigate(isLoggedIn ? '/settings' : '/login')}>
          {isLoggedIn ? (
            <img
              className="w-9 h-9 rounded-full shadow-sm"
              alt="Profile Avatar"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuB7Zg8a6m7XUQvXKCDMVxUrgoAkr03cz_M9mDGc-QDUu0HarnbbFJC4spv-e4vA3ZC6VbpYMM4qjdzKbW9N9t63MCOBUM2hbMIrKUfrbgx6KNjVwDAwuWA109eB9JSHCJ1yd2z5GiOozG0gjdubOLsGnJlEa6GFX9hIcRa-5jXa2DA2Vy0IZXpJ42jbtDBCIsf2uecz5DXSL-ssC0jz3Gzg9Pfs8sjXSYVvd5Cwn7t15Ypht3hNk7MJwZsCjB4eSu1PFtiEi2cb2tez"
            />
          ) : (
            /* Anonymous — shows as login invitation */
            <div className="flex items-center gap-1.5 px-3 h-9 rounded-full transition-all"
              style={{ background: "rgba(255,90,31,0.10)", border: "1.5px solid rgba(255,90,31,0.25)" }}>
              <span className="material-symbols-outlined text-primary" style={{ fontSize: 17 }}>person</span>
              <span className="text-primary font-semibold" style={{ fontSize: 12 }}>登录</span>
            </div>
          )}
        </div>
      </header>

      {/* ── Anonymous trial strip ─────────────────────────────────── */}
      {!isLoggedIn && (
        <div className="flex items-center gap-3 px-4 py-3 border-b border-black/[0.04]"
          style={{ background: "rgba(255,90,31,0.04)" }}>
          <span style={{ fontSize: 18 }}>🎁</span>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-semibold" style={{ color: "#FF5A1F" }}>
              访客体验模式 · 3天免费试用
            </p>
            <p className="text-[11px] text-gray-400 truncate">
              菜单 · 做饭步骤 · 采购清单 全部可体验
            </p>
          </div>
          <button onClick={() => navigate('/signin')}
            className="shrink-0 text-[11px] px-3 py-1.5 rounded-full font-semibold text-white"
            style={{ background: "linear-gradient(135deg, #FF5A1F, #FF8C54)" }}>
            登录解锁
          </button>
        </div>
      )}

      <main className="max-w-md mx-auto pt-4">
        {/* Attributes: Solar Terms & Diners */}
        <section className="px-4 flex flex-col gap-3">
          {/* Environment / Solar Terms */}
          {hasSolarTerm ? (
            <div className="flex items-center justify-between bg-[#EBF0D8] rounded-2xl py-3 px-4 shadow-sm select-none">
              <div className="flex items-center gap-3">
                <span className="text-[22px]">🌱</span>
                <div className="flex flex-col">
                  <span className="text-[14px] font-bold text-[#2C3810] tracking-tight">立夏 Lìxià</span>
                  <span className="text-[12px] text-[#5F6E40] font-medium mt-0.5">健脾化湿 · 清心降火</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between bg-white rounded-2xl py-3 px-4 shadow-sm select-none">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-blue-500 text-[22px]">partly_cloudy_day</span>
                <div className="flex flex-col">
                  <span className="text-[14px] font-bold text-on-surface tracking-tight">26°C 多云</span>
                  <span className="text-[12px] text-green-600 font-medium mt-0.5">AQI 42 优</span>
                </div>
              </div>
            </div>
          )}

          {/* Dynamic Diner & Taste Selectors */}
          <div className="flex gap-2">
            <button 
              onClick={() => setIsDinerSelectorOpen(true)}
              className="flex-[0.8] flex items-center justify-center gap-1.5 bg-white rounded-2xl py-3 shadow-[0_2px_8px_rgba(0,0,0,0.04)] active:scale-95 transition-transform"
            >
              <span className="font-semibold text-[14px] text-on-surface">
                {todayAdults}大 {todayKids}小
              </span>
              <span className="material-symbols-outlined text-[16px] text-secondary">expand_more</span>
            </button>

            <button 
              onClick={() => setIsTasteSelectorOpen(true)}
              className="flex-[1.2] flex items-center justify-center gap-1.5 bg-white rounded-2xl py-3 shadow-[0_2px_8px_rgba(0,0,0,0.04)] active:scale-95 transition-transform"
            >
              <span className="font-semibold text-[14px] text-on-surface">
                {
                  currentTaste === 'light' ? '清淡减脂' : 
                  currentTaste === 'spicy' ? '无辣不欢' : 
                  currentTaste === 'veggie' ? '清新素食' : 
                  currentTaste === 'seafood' ? '海鲜盛宴' : '当前口味: 经典均衡'
                }
              </span>
              <span className="material-symbols-outlined text-[16px] text-secondary">expand_more</span>
            </button>
          </div>
        </section>

        {/* "Today's Gold Match" Hero Card */}
        <section className="mt-6 px-4">
          <div className="bg-white rounded-3xl p-5 shadow-[0_8px_30px_rgba(0,0,0,0.06)] border border-primary/20">
            <div className="flex flex-col gap-1 mb-6">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <h2 className="font-serif text-[24px] font-bold text-on-surface tracking-tight">
                    金牌菜单
                  </h2>
                  <div className="relative">
                    <button 
                      onClick={() => setIsMealTimeDropdownOpen(!isMealTimeDropdownOpen)}
                      className="flex items-center gap-0.5 text-[13px] text-primary font-bold tracking-tight bg-primary/10 px-2.5 py-1 rounded-lg active:scale-95 transition-transform"
                    >
                      今日{mealTime}
                      <span className="material-symbols-outlined text-[16px] leading-none">expand_more</span>
                    </button>
                    
                    {isMealTimeDropdownOpen && (
                      <>
                        <div 
                          className="fixed inset-0 z-40"
                          onClick={() => setIsMealTimeDropdownOpen(false)}
                        />
                        <div className="absolute left-0 top-full mt-2 w-32 bg-white rounded-2xl shadow-lg border border-black/5 overflow-hidden z-50 py-1 origin-top-left animate-in fade-in zoom-in-95 duration-200">
                          {(['早餐', '午餐', '晚餐'] as const).map((option) => (
                            <button
                              key={option}
                              onClick={() => {
                                setMealTime(option);
                                setIsMealTimeDropdownOpen(false);
                              }}
                              className={`w-full text-left px-4 py-3 text-[14px] transition-colors ${
                                mealTime === option 
                                  ? 'bg-primary/5 text-primary font-bold' 
                                  : 'text-on-surface hover:bg-[#f8f8f8] font-medium'
                              }`}
                            >
                              今日{option}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                  {/* 今日净食 toggle */}
                  <button
                    onClick={() => setVeganOnly(v => !v)}
                    className={`flex items-center gap-1.5 text-[13px] font-bold tracking-tight px-2.5 py-1 rounded-lg active:scale-95 transition-all ${
                      veganOnly
                        ? 'bg-green-500 text-white shadow-sm'
                        : 'bg-green-500/10 text-green-700'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[15px] leading-none">
                      {veganOnly ? 'spa' : 'eco'}
                    </span>
                    今日净食
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {displayMenu.map((dish: any, idx: number) => (
                <div
                  key={idx}
                  className={`flex items-center justify-between transition-all ${
                    dish.highlight
                      ? "p-2.5 -mx-2.5 rounded-2xl bg-orange-50/50"
                      : "group hover:opacity-80"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-[14px] overflow-hidden bg-surface-container relative">
                      {isAiLoading ? (
                        <div className="absolute inset-0 bg-surface-variant animate-pulse flex items-center justify-center">
                        </div>
                      ) : (
                        <img
                          className="w-full h-full object-cover"
                          alt={dish.title}
                          src={dish.img || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=120&h=120&fit=crop"}
                        />
                      )}
                    </div>
                    <div>
                      {isAiLoading ? (
                        <div className="flex flex-col gap-2 py-1">
                          <div className="h-4 w-32 bg-surface-variant rounded animate-pulse"></div>
                          <div className="h-3 w-48 bg-surface-variant rounded animate-pulse"></div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2">
                            <h3 className="font-serif text-[17px] font-bold text-on-surface tracking-tight">
                              {dish.title}
                            </h3>
                          </div>
                          <p className="text-[13px] text-secondary mt-0.5">{dish.desc}</p>
                        </>
                      )}
                    </div>
                  </div>
                  <button onClick={() => openSwapDrawer(idx)} disabled={isAiLoading} className="active:scale-90 transition-transform disabled:opacity-50">
                     {dish.highlight ? (
                        <span className="material-symbols-outlined text-orange-400 text-[22px]">
                          stars
                        </span>
                     ) : (
                       <span className="material-symbols-outlined text-secondary/40 text-[20px] hover:text-secondary transition-colors">
                         swap_horiz
                       </span>
                     )}
                  </button>
                </div>
              ))}
            </div>

            {/* AI Craving Input Button */}
            <div className="mt-6 pointer-events-auto">
              <div 
                className="w-full bg-[#f8f8f8] hover:bg-[#f0f0f0] transition-colors rounded-2xl py-3.5 px-4 cursor-pointer flex items-center justify-between"
                onClick={() => setIsCravingModalOpen(true)}
              >
                <span className="text-[14px] font-medium text-secondary/80">今天想吃点什么？...</span>
                <span className="material-symbols-outlined text-[18px] text-secondary/50">search</span>
              </div>
            </div>
          </div>
        </section>

        {/* Weekly Menu Recommendation */}
        <section className="mt-6 px-4">
          {(() => {
            // today's index in Mon=0…Sun=6 system
            const todayDayIdx = (new Date().getDay() + 6) % 7;
            const FREE_DAYS = 3;
            const isDayLocked = (dayIndex: number) =>
              !isLoggedIn && (dayIndex < todayDayIdx || dayIndex >= todayDayIdx + FREE_DAYS);
            const selectedDayObj = weeklyMenu?.days.find(d => d.dayLabel === selectedDayOfWeek);
            const selectedDayLocked = selectedDayObj ? isDayLocked(selectedDayObj.dayIndex) : false;

            return (
              <div className="bg-white rounded-3xl p-5 shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-black/[0.02]">
                <div className="flex items-center justify-between mb-5">
                  <span className="text-[18px] font-bold tracking-tight text-on-surface">
                    一周菜单推荐
                  </span>
                  <button
                    onClick={regenerateWeekly}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-[#f8f8f8] hover:bg-[#f0f0f0] transition-colors"
                    title="重新生成本周菜单"
                  >
                    <span className="material-symbols-outlined text-secondary text-[16px]">refresh</span>
                  </button>
                </div>

                {/* Day tabs */}
                <div className="flex justify-between items-center gap-1 overflow-x-auto no-scrollbar pb-1 mb-4">
                  {(weeklyMenu?.days ?? []).map((day) => {
                    const locked = isDayLocked(day.dayIndex);
                    const selected = selectedDayOfWeek === day.dayLabel;
                    return (
                      <button
                        key={day.dayIndex}
                        onClick={() => {
                          if (locked) { navigate('/signin'); return; }
                          setSelectedDayOfWeek(day.dayLabel);
                        }}
                        className={`flex flex-col items-center gap-1 min-w-[3rem] py-2.5 rounded-2xl transition-all ${
                          locked
                            ? 'opacity-35 cursor-pointer'
                            : selected
                              ? 'bg-primary text-white shadow-md shadow-primary/20'
                              : 'bg-transparent text-secondary hover:bg-black/5'
                        }`}
                      >
                        <span className={`text-[14px] font-bold ${selected && !locked ? 'text-white' : 'text-secondary'}`}>
                          {day.dayLabel.replace('周', '')}
                        </span>
                        {locked
                          ? <span className="material-symbols-outlined text-secondary" style={{ fontSize: 10 }}>lock</span>
                          : <div className={`w-1 h-1 rounded-full ${selected ? 'bg-white/80' : 'bg-transparent'}`} />
                        }
                      </button>
                    );
                  })}
                  {weeklyLoading && ['一','二','三','四','五','六','日'].map(d => (
                    <div key={d} className="flex flex-col items-center gap-1.5 min-w-[3rem] py-2.5">
                      <div className="w-4 h-4 rounded-full bg-black/5 animate-pulse" />
                    </div>
                  ))}
                </div>

                {/* Dishes or lock state */}
                {weeklyLoading ? (
                  <div className="space-y-3">
                    {[1,2,3,4,5].map(i => (
                      <div key={i} className="flex items-center gap-3 animate-pulse">
                        <div className="w-10 h-10 rounded-xl bg-black/5 shrink-0" />
                        <div className="flex-1 space-y-1.5">
                          <div className="h-3.5 bg-black/5 rounded-full w-2/3" />
                          <div className="h-3 bg-black/5 rounded-full w-1/2" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : selectedDayLocked ? (
                  /* Lock state for selected day */
                  <button
                    onClick={() => navigate('/signin')}
                    className="w-full py-5 rounded-2xl flex flex-col items-center gap-2 transition-all active:scale-[0.98]"
                    style={{ background: "rgba(255,90,31,0.05)", border: "1px dashed rgba(255,90,31,0.25)" }}
                  >
                    <span className="material-symbols-outlined text-primary" style={{ fontSize: 28 }}>lock</span>
                    <p className="text-[13px] font-semibold text-on-surface">登录后查看完整 7 天菜单</p>
                    <p className="text-[11px] text-secondary">免费账号即可解锁</p>
                  </button>
                ) : (
                  <div className="space-y-3">
                    {(weeklyMenu?.days.find(d => d.dayLabel === selectedDayOfWeek)?.dishes ?? [])
                      .map((dish, idx) => (
                        <div key={idx} className="flex items-center gap-3">
                          <div
                            className="w-10 h-10 rounded-xl shrink-0 bg-cover bg-center bg-black/5"
                            style={dish.img ? { backgroundImage: `url(${dish.img})` } : {}}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-[14px] font-semibold text-on-surface truncate">{dish.title}</p>
                            <p className="text-[12px] text-secondary truncate">{dish.desc || dish.type}</p>
                          </div>
                          {dish.is_vegan && (
                            <span className="text-[10px] font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full shrink-0">净食</span>
                          )}
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                            dish.type === 'VEGGIE' ? 'text-green-700 bg-green-50' :
                            dish.type === 'SEAFOOD' ? 'text-blue-700 bg-blue-50' :
                            'text-orange-700 bg-orange-50'
                          }`}>
                            {dish.type === 'VEGGIE' ? '素' : dish.type === 'SEAFOOD' ? '海鲜' : '肉'}
                          </span>
                        </div>
                      ))}
                    {!weeklyMenu && (
                      <p className="text-[13px] text-secondary text-center py-4">暂无推荐，请检查网络连接</p>
                    )}
                  </div>
                )}

                {/* CTA → full weekly menu page */}
                <button
                  onClick={() => navigate('/weekly')}
                  className="mt-4 w-full h-[44px] rounded-2xl flex items-center justify-center gap-2 font-semibold transition-all active:scale-[0.98]"
                  style={{
                    background: "linear-gradient(135deg, #FF5A1F, #FF8C54)",
                    boxShadow: "0 6px 20px rgba(255,90,31,0.22)",
                    fontSize: 14, color: "white",
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>calendar_month</span>
                  查看完整周菜单 · 生成购物清单
                </button>
              </div>
            );
          })()}
        </section>
      </main>

      {/* Bottom Action Bar (Sticky Bottom) */}
      <footer className="fixed bottom-0 left-0 w-full z-50 bg-white/80 backdrop-blur-xl px-4 pb-8 pt-4 border-t border-black/5">
        <div className="max-w-md mx-auto flex flex-col items-center gap-3">
          <div className="flex items-center gap-2 w-full">
            <button onClick={() => setIsRecordModalOpen(true)} className="flex-1 h-[52px] bg-[#f8f8f8] hover:bg-[#f0f0f0] text-secondary rounded-2xl flex flex-col items-center justify-center active:scale-95 transition-all">
              <span className="material-symbols-outlined text-[18px] mb-0.5">photo_camera</span>
              <span className="text-[11px] font-semibold">打卡</span>
            </button>
            <button onClick={() => window.location.href='/prep'} className="flex-1 h-[52px] bg-[#f8f8f8] hover:bg-[#f0f0f0] text-secondary rounded-2xl flex flex-col items-center justify-center active:scale-95 transition-all">
              <span className="material-symbols-outlined text-[18px] mb-0.5">menu_book</span>
              <span className="text-[11px] font-semibold">做法</span>
            </button>
            <button onClick={() => { setIsFridgeScanOpen(true); }} className="flex-1 h-[52px] bg-[#f0f9f4] hover:bg-[#e0f4e8] text-emerald-600 rounded-2xl flex flex-col items-center justify-center active:scale-95 transition-all">
              <span className="material-symbols-outlined text-[18px] mb-0.5">kitchen</span>
              <span className="text-[11px] font-semibold">扫冰箱</span>
            </button>
            <button onClick={() => {
              localStorage.setItem('generatedMenu', JSON.stringify(displayMenu));
              localStorage.setItem('effectivePeople', JSON.stringify(todayAdults + (todayKids * 0.5)));
              window.location.href='/verify';
            }} className="flex-[1.5] h-[52px] bg-gradient-to-r from-[#FF5A1F] to-[#FF9054] text-white rounded-2xl flex flex-col items-center justify-center active:scale-95 transition-all shadow-lg shadow-[#FF5A1F]/30">
              <span className="material-symbols-outlined text-[18px] mb-0.5">shopping_cart</span>
              <span className="text-[13px] font-bold">开始采购</span>
            </button>
          </div>
        </div>
      </footer>

      {/* Floating AI Suggestion (Pilot Float) */}
      <div className="fixed bottom-32 right-6 z-50">
        <button onClick={() => window.location.href='/ai-pilot'} className="w-14 h-14 rounded-full glass-card border border-white/20 shadow-2xl flex items-center justify-center active:scale-90 transition-transform">
          <span
            className="material-symbols-outlined text-primary text-[28px]"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            auto_awesome
          </span>
        </button>
      </div>

      {/* Diner Selector Drawer */}
      {isDinerSelectorOpen && (
        <div className="fixed inset-0 z-[100] flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsDinerSelectorOpen(false)}></div>
          <div className="relative bg-surface w-full max-w-md mx-auto rounded-t-[32px] pt-4 pb-10 px-6 shadow-2xl safe-area-pb translate-y-0 transition-transform duration-300">
            <div className="w-12 h-1.5 bg-black/10 rounded-full mx-auto mb-6"></div>
            
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-[20px] font-bold text-on-surface">今日就餐人数</h2>
              <button className="text-secondary bg-black/5 rounded-full w-8 h-8 flex items-center justify-center active:scale-95" onClick={() => setIsDinerSelectorOpen(false)}>
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            
            <div className="space-y-4 mb-8">
              {/* Adults Control */}
              <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-black/5">
                <div className="flex flex-col">
                  <span className="font-bold text-[16px] text-on-surface">Adults (成人)</span>
                </div>
                <div className="flex items-center gap-4 bg-surface-variant/30 rounded-full py-1.5 px-2">
                  <button onClick={() => setTodayAdults(Math.max(1, todayAdults - 1))} className="w-8 h-8 flex items-center justify-center rounded-full bg-white shadow-sm text-secondary active:scale-95 transition-transform">
                    <span className="material-symbols-outlined text-[18px]">remove</span>
                  </button>
                  <span className="text-[16px] font-bold text-on-surface w-4 text-center">{todayAdults}</span>
                  <button onClick={() => setTodayAdults(todayAdults + 1)} className="w-8 h-8 flex items-center justify-center rounded-full bg-white shadow-sm text-secondary active:scale-95 transition-transform">
                    <span className="material-symbols-outlined text-[18px]">add</span>
                  </button>
                </div>
              </div>
              
              {/* Kids Control */}
              <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-black/5">
                <div className="flex flex-col">
                  <span className="font-bold text-[16px] text-on-surface">Kids (儿童)</span>
                </div>
                <div className="flex items-center gap-4 bg-surface-variant/30 rounded-full py-1.5 px-2">
                  <button onClick={() => setTodayKids(Math.max(0, todayKids - 1))} className="w-8 h-8 flex items-center justify-center rounded-full bg-white shadow-sm text-secondary active:scale-95 transition-transform">
                    <span className="material-symbols-outlined text-[18px]">remove</span>
                  </button>
                  <span className="text-[16px] font-bold text-on-surface w-4 text-center">{todayKids}</span>
                  <button onClick={() => setTodayKids(todayKids + 1)} className="w-8 h-8 flex items-center justify-center rounded-full bg-white shadow-sm text-secondary active:scale-95 transition-transform">
                    <span className="material-symbols-outlined text-[18px]">add</span>
                  </button>
                </div>
              </div>
            </div>

            <button className="w-full h-14 bg-[#2D3748] text-white rounded-2xl font-semibold text-[16px] shadow-lg active:scale-[0.98] transition-transform" onClick={() => {
              // Persist headcount so weekly menu can read it + regenerate
              localStorage.setItem('nutri_adults', String(todayAdults));
              localStorage.setItem('nutri_kids', String(todayKids));
              window.dispatchEvent(new Event('nutri-prefs-changed'));
              setIsDinerSelectorOpen(false);
            }}>
              确认 Confirm
            </button>
          </div>
        </div>
      )}

      {/* Drawer Overlay */}
      {isSwapOpen && (
        <div className="fixed inset-0 z-[100] flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsSwapOpen(false)}></div>
          <div className="relative bg-surface w-full max-w-md mx-auto rounded-t-[32px] pt-4 pb-10 px-6 shadow-2xl safe-area-pb translate-y-0 transition-transform duration-300">
            <div className="w-12 h-1.5 bg-black/10 rounded-full mx-auto mb-6"></div>
            
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-[20px] font-bold text-on-surface">更换菜品 (Swap Menu)</h2>
              <button className="text-secondary bg-black/5 rounded-full w-8 h-8 flex items-center justify-center active:scale-95" onClick={() => setIsSwapOpen(false)}>
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            
            {swappingDishIndex !== null && displayMenu[swappingDishIndex] && (
              <p className="text-[12px] text-secondary mb-4 text-center">
                换掉「{displayMenu[swappingDishIndex].title}」· 同食材不同做法
              </p>
            )}

            <div className="space-y-3 mb-8">
              {isSwapLoading ? (
                <div className="flex flex-col items-center justify-center py-8 gap-3">
                  <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-[13px] text-secondary">正在为您搜索同食材菜品…</p>
                </div>
              ) : swapOptions.length === 0 ? (
                <p className="text-[13px] text-secondary text-center py-6">暂无同食材菜品可换</p>
              ) : (
                swapOptions.map((opt) => (
                  <label key={opt.id} className={`flex items-center p-3 rounded-2xl border-2 transition-all cursor-pointer ${selectedSwap === opt.id ? 'border-primary bg-primary/5' : 'border-black/5 bg-white'}`}>
                    <div className="w-14 h-14 rounded-xl overflow-hidden bg-black/5 mr-4 flex-shrink-0">
                      <img className="w-full h-full object-cover" alt={opt.title} src={opt.img} onError={e => { (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1512003867696-6d5ce6835040?w=200&q=60'; }} />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-on-surface text-[15px]">{opt.title}</h3>
                      <span className="inline-block mt-1 px-2 py-0.5 rounded-md bg-black/5 text-[10px] font-bold text-secondary">{opt.type}</span>
                    </div>
                    <div className="w-6 h-6 rounded-full border-2 border-primary flex items-center justify-center ml-2">
                      {selectedSwap === opt.id && <div className="w-3 h-3 rounded-full bg-primary"></div>}
                    </div>
                    <input type="radio" name="swap_dish" className="hidden" checked={selectedSwap === opt.id} onChange={() => setSelectedSwap(opt.id)} />
                  </label>
                ))
              )}
            </div>

            <button
              className="w-full h-14 bg-[#2D3748] text-white rounded-2xl font-semibold text-[16px] shadow-lg active:scale-[0.98] transition-transform disabled:opacity-40"
              onClick={handleSwapConfirm}
              disabled={isSwapLoading || !selectedSwap}
            >
              <span className="flex items-center justify-center gap-2">
                 <span className="material-symbols-outlined text-[20px]">check_circle</span>
                 确认换菜
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Hidden fridge photo input */}
      <input
        ref={fridgeInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFridgeScan(f); e.target.value = ''; }}
      />

      {/* Fridge Scan Drawer */}
      {isFridgeScanOpen && (
        <div className="fixed inset-0 z-[110] flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setIsFridgeScanOpen(false)}></div>
          <div className="relative bg-surface w-full max-w-md mx-auto rounded-t-[32px] pt-4 pb-10 px-6 shadow-2xl safe-area-pb">
            <div className="w-12 h-1.5 bg-black/10 rounded-full mx-auto mb-4"></div>

            <div className="flex justify-between items-center mb-4">
              <h2 className="text-[20px] font-bold text-on-surface">冰箱扫一扫</h2>
              <button className="text-secondary bg-black/5 rounded-full w-8 h-8 flex items-center justify-center active:scale-95" onClick={() => setIsFridgeScanOpen(false)}>
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Photo preview */}
            {fridgePreview && (
              <div className="w-full h-44 rounded-2xl overflow-hidden mb-4 bg-black/5">
                <img src={fridgePreview} alt="冰箱照片" className="w-full h-full object-cover" />
              </div>
            )}

            {fridgeScanLoading && (
              <div className="flex flex-col items-center justify-center py-10 gap-3">
                <div className="w-9 h-9 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                <p className="text-[13px] text-secondary">AI 正在识别食材，生成菜单…</p>
              </div>
            )}

            {fridgeError && (
              <div className="text-center py-6">
                <p className="text-[14px] text-red-500 mb-4">{fridgeError}</p>
                <button className="px-5 py-2 bg-primary text-white rounded-full text-[13px] font-semibold active:scale-95" onClick={() => fridgeInputRef.current?.click()}>重新拍照</button>
              </div>
            )}

            {!fridgeScanLoading && fridgeDishes.length > 0 && (
              <>
                {/* Detected ingredients */}
                {fridgeIngredients.length > 0 && (
                  <div className="mb-4">
                    <p className="text-[11px] text-secondary font-semibold mb-2 uppercase tracking-wider">识别到的食材</p>
                    <div className="flex flex-wrap gap-1.5">
                      {fridgeIngredients.map(ing => (
                        <span key={ing} className="px-2.5 py-1 bg-primary/10 text-primary rounded-full text-[12px] font-medium">{ing}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Suggested dishes */}
                <p className="text-[11px] text-secondary font-semibold mb-3 uppercase tracking-wider">推荐做法（3种）</p>
                <div className="space-y-3 mb-6">
                  {fridgeDishes.map((dish, i) => (
                    <div key={i} className="p-4 bg-white rounded-2xl border border-black/5 shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <h3 className="text-[15px] font-bold text-on-surface">{dish.name_zh}</h3>
                          <p className="text-[11px] text-secondary mt-0.5">{dish.name_en}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className="px-2 py-0.5 bg-black/5 rounded-md text-[11px] text-secondary font-semibold">{dish.cook_method}</span>
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${dish.difficulty === '简单' ? 'bg-green-50 text-green-600' : dish.difficulty === '稍复杂' ? 'bg-orange-50 text-orange-600' : 'bg-yellow-50 text-yellow-600'}`}>{dish.difficulty} · {dish.time_minutes}分钟</span>
                        </div>
                      </div>
                      <p className="text-[12px] text-secondary mt-2 leading-relaxed">{dish.description}</p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {dish.ingredients_used.map(ing => (
                          <span key={ing} className="px-2 py-0.5 bg-black/5 text-secondary rounded-md text-[10px]">{ing}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  className="w-full h-12 bg-black/5 text-secondary rounded-2xl text-[13px] font-semibold active:scale-95 transition-transform"
                  onClick={() => fridgeInputRef.current?.click()}
                >
                  <span className="flex items-center justify-center gap-2">
                    <span className="material-symbols-outlined text-[18px]">photo_camera</span>
                    重新拍照
                  </span>
                </button>
              </>
            )}

            {!fridgeScanLoading && !fridgeError && fridgeDishes.length === 0 && !fridgePreview && (
              <div className="flex flex-col items-center justify-center py-10 gap-4">
                <span className="material-symbols-outlined text-[56px] text-secondary/40">kitchen</span>
                <p className="text-[14px] text-secondary text-center">拍一张冰箱或食材照片<br/>AI 帮你想三种做法</p>
                <button className="px-6 py-3 bg-primary text-white rounded-2xl text-[14px] font-semibold shadow-lg active:scale-95 transition-transform" onClick={() => fridgeInputRef.current?.click()}>
                  <span className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[20px]">photo_camera</span>
                    拍照 / 选图
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Taste Selector Drawer */}
      {isTasteSelectorOpen && (
        <div className="fixed inset-0 z-[100] flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsTasteSelectorOpen(false)}></div>
          <div className="relative bg-surface w-full max-w-md mx-auto rounded-t-[32px] pt-4 pb-10 px-6 shadow-2xl safe-area-pb translate-y-0 transition-transform duration-300">
            <div className="w-12 h-1.5 bg-black/10 rounded-full mx-auto mb-6"></div>
            
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-[20px] font-bold text-on-surface">今日口味偏好</h2>
              <button className="text-secondary bg-black/5 rounded-full w-8 h-8 flex items-center justify-center active:scale-95" onClick={() => setIsTasteSelectorOpen(false)}>
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            
            <div className="flex flex-col gap-3 mb-8">
              {[
                { id: 'default', name: '经典均衡', icon: 'set_meal' },
                { id: 'light', name: '清淡减脂', icon: 'spa' },
                { id: 'spicy', name: '无辣不欢', icon: 'local_fire_department' },
                { id: 'veggie', name: '清新素食', icon: 'eco' },
                { id: 'seafood', name: '海鲜盛宴', icon: 'phishing' },
              ].map(taste => (
                <button
                  key={taste.id}
                  onClick={() => setCurrentTaste(taste.id)}
                  className={`flex items-center gap-3 p-4 rounded-xl border ${
                    currentTaste === taste.id 
                      ? 'border-primary bg-primary/10 text-primary' 
                      : 'border-surface-container bg-white text-on-surface'
                  } active:scale-95 transition-all`}
                >
                  <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                    {taste.icon}
                  </span>
                  <span className="font-bold text-[16px] flex-1 text-left">{taste.name}</span>
                  {currentTaste === taste.id && (
                    <span className="material-symbols-outlined text-primary">check_circle</span>
                  )}
                </button>
              ))}
            </div>

            <button className="w-full h-14 bg-[#2D3748] text-white rounded-2xl font-semibold text-[16px] shadow-lg active:scale-[0.98] transition-transform" onClick={() => setIsTasteSelectorOpen(false)}>
              确认 Confirm
            </button>
          </div>
        </div>
      )}
      {/* Craving Modal */}
      {isCravingModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-end justify-center sm:items-center">
          <div className="bg-white w-full sm:w-[390px] rounded-t-3xl sm:rounded-3xl p-6 pb-12 shadow-2xl animate-in slide-in-from-bottom-full duration-300">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-headline-2 font-bold text-on-surface">今天想吃点什么？</h3>
              <button 
                onClick={() => setIsCravingModalOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-container/50 text-secondary"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            
            <p className="text-[14px] text-secondary mb-4">为您推荐今天的人气选择：</p>
            
            <div className="flex flex-wrap gap-3 mb-8">
              {[
                { label: '减脂净食', icon: 'eco' },
                { label: '川湘麻辣', icon: 'local_fire_department' },
                { label: '清淡粤菜', icon: 'restaurant' },
                { label: '滋补靓汤', icon: 'soup_kitchen' },
                { label: '日韩料理', icon: 'sushi' },
                { label: '浓鲜海味', icon: 'phishing' }
              ].map(opt => (
                <button
                  key={opt.label}
                  onClick={() => handleCravingSubmit(undefined, opt.label)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-full border border-surface-container bg-surface-container-lowest hover:border-primary hover:bg-primary/5 transition-colors"
                >
                  <span className="material-symbols-outlined text-[16px] text-primary">{opt.icon}</span>
                  <span className="text-[14px] font-medium text-on-surface">{opt.label}</span>
                </button>
              ))}
            </div>

            <form onSubmit={handleCravingSubmit} className="relative">
              <input 
                type="text" 
                value={userCraving}
                onChange={(e) => setUserCraving(e.target.value)}
                disabled={isAiLoading}
                placeholder="或直接输入（如：想吃日料...）"
                className="w-full bg-surface-container/30 border border-surface-container focus:border-primary transition-all rounded-xl py-4 pl-4 pr-12 text-[15px] text-on-surface placeholder-secondary/70 outline-none"
                autoFocus
              />
              <button 
                type="submit"
                disabled={!userCraving.trim() || isAiLoading}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-lg bg-primary text-white disabled:opacity-50 transition-colors shadow-md"
              >
                {isAiLoading ? (
                  <span className="material-symbols-outlined text-[20px] animate-spin">sync</span>
                ) : (
                  <span className="material-symbols-outlined text-[20px]">send</span>
                )}
              </button>
            </form>
          </div>
        </div>
      )}
      {/* Record/Calendar Modal */}
      {isRecordModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[100] flex items-end justify-center sm:items-center">
          <div className="bg-[#1D1D1F]/90 backdrop-blur-xl w-full sm:w-[390px] h-[85vh] sm:h-[80vh] flex flex-col rounded-t-[32px] sm:rounded-[32px] p-6 pb-8 overflow-hidden shadow-2xl animate-in slide-in-from-bottom-full duration-500 ease-out border border-white/10">
            <div className="flex justify-between items-center mb-6 flex-shrink-0">
              <h3 className="text-[24px] font-serif font-black text-white tracking-wide">饮食记录日历</h3>
              <button 
                onClick={() => setIsRecordModalOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white/70 transition-colors cursor-pointer active:scale-95"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto no-scrollbar relative">
              {isTakingPhoto ? (
                <div className="flex flex-col h-full animate-in fade-in duration-300">
                  {tempPhoto ? (
                    <div className="flex-[1.5] mb-6 rounded-[24px] overflow-hidden bg-white/5 flex items-center justify-center relative shadow-inner border border-white/10">
                      <img src={tempPhoto} className="w-full h-full object-cover" alt="Preview" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent pointer-events-none"></div>
                    </div>
                  ) : (
                    <div className="flex-[1.5] mb-6 rounded-[24px] overflow-hidden bg-white/5 flex flex-col items-center justify-center border-2 border-dashed border-white/20">
                       <span className="material-symbols-outlined text-[48px] text-white/30 mb-3">add_a_photo</span>
                       <span className="text-[14px] text-white/50 font-medium pb-2">模拟相机拍照...</span>
                    </div>
                  )}
                  <textarea
                    value={newFeeling}
                    onChange={(e) => setNewFeeling(e.target.value)}
                    placeholder="这顿饭吃得如何？记录一下感受吧..."
                    className="w-full bg-white/5 border border-white/10 rounded-[20px] p-4 text-[15px] resize-none flex-1 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all shadow-sm mb-4 text-white placeholder:text-white/40"
                  />
                  <div className="flex gap-3">
                    <button 
                      onClick={() => {
                        setIsTakingPhoto(false);
                        setTempPhoto(null);
                        setNewFeeling("");
                      }}
                      className="flex-1 bg-white/10 text-white rounded-[24px] py-4 font-bold justify-center flex items-center transition-colors hover:bg-white/20 active:scale-95 cursor-pointer border border-white/5"
                    >
                      取消
                    </button>
                    <button 
                      onClick={() => {
                        if (tempPhoto) {
                          const newRecord: DietRecord = {
                            id: Math.random().toString(36).substr(2, 9),
                            image: tempPhoto,
                            feeling: newFeeling,
                            date: new Date().toISOString()
                          };
                          const newRecords = [newRecord, ...dietRecords];
                          setDietRecords(newRecords);
                          localStorage.setItem('dietRecords', JSON.stringify(newRecords));
                          setIsTakingPhoto(false);
                          setTempPhoto(null);
                          setNewFeeling("");
                        }
                      }}
                      disabled={!tempPhoto}
                      className="flex-[2] bg-primary disabled:bg-white/5 disabled:text-white/30 text-white rounded-[24px] py-4 font-bold tracking-widest uppercase justify-center flex items-center transition-colors shadow-[0_10px_30px_rgba(255,90,31,0.3)] disabled:shadow-none active:scale-95 cursor-pointer"
                    >
                      保存记录
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-4 pb-4">
                  {dietRecords.map((record) => (
                    <div key={record.id} className="bg-white/5 border border-white/10 rounded-[24px] p-2 shadow-sm flex flex-col gap-3">
                      <div className="aspect-[16/9] rounded-[18px] overflow-hidden bg-black/20 relative">
                        <img src={record.image} className="w-full h-full object-cover" alt="Diet record" />
                      </div>
                      <div className="flex justify-between items-start gap-3 px-2 pb-2">
                        <p className="text-[15px] font-medium text-white/90 flex-1 leading-relaxed">"{record.feeling || "未填写感受"}"</p>
                        <span className="text-[12px] font-bold text-white/50 whitespace-nowrap bg-white/10 px-2 py-1 rounded-lg">
                          {new Date(record.date).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  ))}
                  {dietRecords.length === 0 && (
                    <div className="py-20 flex flex-col items-center justify-center text-center">
                       <div className="w-24 h-24 rounded-full bg-white/5 flex items-center justify-center mb-6">
                         <span className="material-symbols-outlined text-[42px] text-white/20">no_photography</span>
                       </div>
                       <p className="text-[16px] font-bold text-white mb-2">暂无打卡记录</p>
                       <p className="text-[14px] text-white/50">记录你的健康饮食，看着自己一天天变得更好</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {!isTakingPhoto && (
              <div className="pt-6 flex-shrink-0 relative z-10">
                 <button 
                   onClick={() => {
                     const dummyPhotos = [
                       "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=400&fit=crop",
                       "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?q=80&w=400&fit=crop",
                       "https://images.unsplash.com/photo-1490645935967-10de6ba17061?q=80&w=400&fit=crop"
                     ];
                     const randomPhoto = dummyPhotos[Math.floor(Math.random() * dummyPhotos.length)];
                     setTempPhoto(randomPhoto);
                     setIsTakingPhoto(true);
                   }}
                   className="w-full bg-primary text-white rounded-[24px] py-4 font-bold tracking-widest justify-center flex items-center gap-2 active:scale-95 transition-transform shadow-[0_10px_30px_rgba(255,90,31,0.3)] cursor-pointer"
                 >
                   <span className="material-symbols-outlined text-[20px]">add_a_photo</span>
                   拍照打卡
                 </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
