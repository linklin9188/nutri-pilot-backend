import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('开始清除旧数据...');
  await prisma.order.deleteMany({});
  await prisma.dish.deleteMany({});
  await prisma.ingredient.deleteMany({});
  await prisma.user.deleteMany({});

  console.log('1. 正在创建初始用户 (雇主画像)...');
  const user1 = await prisma.user.create({
    data: {
      name: '林建校 (Lin)',
      whatsappId: '85298765432',
      dinerCount: 5, // 默认 5 人就餐基准
      healthTags: ['祛湿', '高蛋白'],
      tastePrefs: ['粤菜', '清淡']
    }
  });

  console.log('2. 正在创建 3+3 供应链基础食材...');
  // 高端肉类
  const beef = await prisma.ingredient.create({
    data: {
      nameZh: '日式蓝鳍金枪鱼片',
      nameEn: 'Bluefin Tuna Slices',
      namePh: 'Tuna Sliced',
      category: 'Seafood',
      watercolorUrl: 'https://qoyuafqqkfyrqlthsvws.supabase.co/storage/v1/object/public/food/tuna.png',
      storageProtocol: {
        zone: 'Chilled (0-4°C)',
        instruction_en: 'Store in chilled zone. Consume within 24 hours.',
        instruction_ph: 'Itabi sa malamig na lugar. Lutuin sa loob ng 24 oras.'
      },
      premiumPartnerId: 'Waves Pacific' // 自动路由到高端合作商家
    }
  });

  const porkBelly = await prisma.ingredient.create({
    data: {
      nameZh: '黑豚猪五花肉片',
      nameEn: 'Kurobuta Pork Belly Sliced',
      namePh: 'Liempo Sliced',
      category: 'Meat',
      watercolorUrl: 'https://qoyuafqqkfyrqlthsvws.supabase.co/storage/v1/object/public/food/pork.png',
      storageProtocol: {
        zone: 'Fridge (4°C)',
        instruction_en: 'Keep refrigerated in airtight container.',
        instruction_ph: 'Ilagay sa refrigerator sa saradong lalagyan.'
      },
      premiumPartnerId: 'Waves Pacific'
    }
  });

  // 基础配菜与调味
  const garlicScallion = await prisma.ingredient.create({
    data: {
      nameZh: '葱姜蒜组合配料',
      nameEn: 'Garlic & Ginger Set',
      namePh: 'Bawang at Luya Set',
      category: 'Veggie',
      watercolorUrl: 'https://qoyuafqqkfyrqlthsvws.supabase.co/storage/v1/object/public/food/garlic.png',
      storageProtocol: {
        zone: 'Dry Pantry',
        instruction_en: 'Store in dry and ventilated environment.',
        instruction_ph: 'Itabi sa tuyo at may hangin na lugar.'
      },
      dailyPartnerId: 'Wellcome Supermarket' // 自动路由到附近普通超市
    }
  });

  const choySum = await prisma.ingredient.create({
    data: {
      nameZh: '本地有机菜心',
      nameEn: 'Organic Choy Sum',
      namePh: 'Pechay Sliced',
      category: 'Veggie',
      watercolorUrl: 'https://qoyuafqqkfyrqlthsvws.supabase.co/storage/v1/object/public/food/choysum.png',
      storageProtocol: {
        zone: 'Vegetable Crisper (4°C)',
        instruction_en: 'Wash thoroughly before storing in vegetable crisper.',
        instruction_ph: 'Hugasan mabuti bago ilagay sa lalagyan ng gulay.'
      },
      premiumPartnerId: 'Eat FRESH' // 有机蔬菜路由到专属有机商家
    }
  });

  console.log('3. 正在创建精致菜谱并绑定食材关联...');
  await prisma.dish.create({
    data: {
      nameZh: '回锅黑豚肉',
      nameEn: 'Twice-cooked Kurobuta Pork',
      category: 'Meat',
      watercolorUrl: 'https://qoyuafqqkfyrqlthsvws.supabase.co/storage/v1/object/public/food/dish_pork.png',
      prepTimeMins: 15,
      cookTimeMins: 10,
      heatLevel: 'High-heat Stir-fry (大火爆炒)',
      helperTipEn: 'Slice pork to 2mm. Stir-fry with scallion quickly under high heat.',
      helperTipPh: 'Hiwain ang karne ng 2mm. Igisa kasama ang dahon ng sibuyas sa malakas na apoy.',
      traySlot: 'Tray_A', // 备菜归入 A 格盘
      robotCompatible: true, // 预留智能厨电接口
      robotInstructionId: 'robot_cmd_pork_9921',
      ingredients: {
        connect: [{ id: porkBelly.id }, { id: garlicScallion.id }]
      }
    }
  });

  await prisma.dish.create({
    data: {
      nameZh: '清蒸东星斑',
      nameEn: 'Steamed Coral Grouper',
      category: 'Seafood',
      watercolorUrl: 'https://qoyuafqqkfyrqlthsvws.supabase.co/storage/v1/object/public/food/dish_fish.png',
      prepTimeMins: 10,
      cookTimeMins: 8,
      heatLevel: 'Medium Steam (中火清蒸)',
      helperTipEn: 'Steam fish for exactly 8 minutes. Add hot oil and seasoned soy sauce.',
      helperTipPh: 'I-steam ang isda ng eksaktong 8 minuto. Buhusan ng mainit na mantika at toyo.',
      traySlot: 'Tray_B', // 备菜归入 B 格盘
      ingredients: {
        connect: [{ id: garlicScallion.id }]
      }
    }
  });

  await prisma.dish.create({
    data: {
      nameZh: '蒜蓉本地有机菜心',
      nameEn: 'Garlic Organic Choy Sum',
      category: 'Veggie',
      watercolorUrl: 'https://qoyuafqqkfyrqlthsvws.supabase.co/storage/v1/object/public/food/dish_choy.png',
      prepTimeMins: 5,
      cookTimeMins: 3,
      heatLevel: 'High-heat Stir-fry (大火爆炒)',
      helperTipEn: 'Keep fire high. Stir-fry Choy Sum for 3 mins to retain crispiness.',
      helperTipPh: 'Panatilihing malakas ang apoy. Igisa ang gulay ng 3 minuto para manatiling malutong.',
      traySlot: 'Tray_C', // 备菜归入 C 格盘
      ingredients: {
        connect: [{ id: choySum.id }, { id: garlicScallion.id }]
      }
    }
  });

  console.log('🎉 种子数据全部导入成功！');
}

main()
  .catch((e) => {
    console.error('导入失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
