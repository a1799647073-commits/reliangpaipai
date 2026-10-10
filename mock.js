// 热量拍拍 · mock 数据（单一数据源）
// 结构对应未来后端实体：Meal / MealRecord / WeightRecord / Goal / Plan
window.DB = {
  // 每日目标
  goal: { targetKcal: 1800, weightGoal: 62, unitKcal: "kcal", unitKg: "kg" },

  // 餐食记录（按天分组；每条含餐别、名称、热量、份量系数）
  days: [
    {
      date: "今天", sum: 845,
      meals: [
        { id: "m01", meal: "早餐", name: "全麦吐司 + 煎蛋 + 黑咖啡", kcal: 385, scale: "1份", time: "07:42" },
        { id: "m02", meal: "午餐", name: "鸡胸肉沙拉（约350g）", kcal: 460, scale: "1份", time: "12:18" },
      ],
    },
    {
      date: "昨天", sum: 1380,
      meals: [
        { id: "m03", meal: "早餐", name: "燕麦粥 + 水煮蛋", kcal: 342, scale: "1份", time: "08:05" },
        { id: "m04", meal: "午餐", name: "牛肉荞麦面", kcal: 610, scale: "中份", time: "13:02" },
        { id: "m05", meal: "晚餐", name: "清蒸鱼 + 杂粮饭 + 西兰花", kcal: 428, scale: "1份", time: "19:20" },
      ],
    },
    {
      date: "10-08", sum: 1675,
      meals: [
        { id: "m06", meal: "早餐", name: "菜包 + 豆浆", kcal: 310, scale: "1份", time: "07:55" },
        { id: "m07", meal: "午餐", name: "番茄牛肉饭", kcal: 720, scale: "大份", time: "12:40" },
        { id: "m08", meal: "晚餐", name: "凉拌鸡丝 + 玉米", kcal: 645, scale: "1份", time: "18:50" },
      ],
    },
  ],

  // 体重历史（后一条最新，用于折线图）
  weight: [
    { date: "09-10", kg: 67.6 }, { date: "09-13", kg: 67.4 }, { date: "09-16", kg: 67.2 },
    { date: "09-19", kg: 67.0 }, { date: "09-22", kg: 66.9 }, { date: "09-25", kg: 66.6 },
    { date: "09-28", kg: 66.4 }, { date: "10-01", kg: 66.5 }, { date: "10-04", kg: 66.3 },
    { date: "10-07", kg: 66.1 }, { date: "10-10", kg: 66.0 },
  ],
  latestWeight: 66.0,

  // 订阅方案（面向出海为主，双币种展示）
  plans: [
    { id: "lifetime", label: "终身买断", priceCNY: "¥38", priceUSD: "$5.99", best: false, desc: "一次付费，永久使用全部功能" },
    { id: "year", label: "年度订阅", priceCNY: "¥68/年", priceUSD: "$9.99/年", best: true, desc: "更适合按年管理，含自动续费" },
  ],
  subscribed: false,
  memberLevel: "free",   // free=普通 / pro=PRO会员

  // 可用的兑换码（演示：含一个有效码）
  redeemCodes: { "HEATPRO10": "pro", "WELCOME-KL": "pro" },
  usedCodes: [],   // 已用过的码（防重复兑换）

  // 商店评分 & 用户信息（展示用）
  meta: { rating: "4.9", reviews: "1,204", users: "2.3万", stores: "App Store · Google Play" },
  profile: { nickname: "健康记录者", avatar: 0 },

  // 可选头像（emoji + 背景色）
  avatars: [
    { emoji:"🦊", bg:"#f0a23a" }, { emoji:"🐱", bg:"#e0803a" }, { emoji:"🐻", bg:"#8a7a5c" },
    { emoji:"🐼", bg:"#2e9e6b" }, { emoji:"🐰", bg:"#5cc08a" }, { emoji:"🐶", bg:"#4a90d9" },
    { emoji:"🐯", bg:"#d05252" }, { emoji:"🦉", bg:"#6a6df0" },
  ],
};

// 近期记录馈给首页时间线的简化结构
window.NEARLY_RECORDS = DB.days.slice(0, 2).map(g => ({
  date: g.date, meals: g.meals.map(m => ({ time: m.time, name: m.name, kcal: m.kcal })),
}));