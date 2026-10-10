// 热量拍拍 · API 桩层（形状等同真实后端，仅返回 mock）
// 接真实后端时仅替换各函数内 TODO 处实现；方法/路径/请求响应形状保持不变

function _delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// POST /api/analyse —— 拍照识热量（走本地 Node 代理 → 豆包视觉）
// req: { image: base64字符串 }  res: { code, data:{ items[], totalKcal, tip } }
// 前端直连豆包会被 CORS 拦截且 Key 会泄露，故统一走同源代理 server.js。
const API_BASE = (location.hostname && location.hostname !== 'file') ? '' : 'http://localhost:3000';
async function apiRecognize(imageData) {
  const base64 = typeof imageData === 'string' ? imageData
               : (imageData && imageData.base64) || '';
  const payload = { image: base64 };

  try {
    const resp = await fetch(API_BASE + '/api/analyse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const r = await resp.json();
    if (r.code === 0) return r;
    throw new Error(r.msg || '识别服务异常');
  } catch (e) {
    // 代理不可用或识别报错 → 回退 mock，但把原因透出，避免误以为是真实结果
    console.warn('[apiRecognize] fallback mock:', e);
    return { code:0, data:{ items:[
      { id:"f1", name:"宫保鸡丁饭（大份）[演示]", kcal:650, gram:380 },
      { id:"f2", name:"清炒时蔬[演示]", kcal:85, gram:180 },
    ], totalKcal:735, tip:"识别失败，回退演示数据。原因: " + (e && e.message ? e.message : e) } };
  }
}

// POST /api/voice —— 语音转文字 + 提取食物
// req: { text }  res: { code, data:{ name, kcal, gram } }
async function apiVoice(text) {
  await _delay(700);
  // TODO: 换成真实 ASR + 语义抽取
  return { code:0, data:{ name: text || "牛肉荞麦面", kcal:610, gram:320 } };
}

// GET /api/foods/search?q= —— 食物库搜索（手动录入）
// req: { q }  res: { code, data:[{name, kcal, per}] }
async function apiSearchFood(q) {
  await _delay(300);
  const pool = [
    { name:"白米饭（一碗）", kcal:232, per:"碗" },
    { name:"牛肉面", kcal:610, per:"碗" },
    { name:"鸡胸肉", kcal:133, per:"100g" },
    { name:"水煮蛋", kcal:72, per:"个" },
    { name:"西兰花", kcal:34, per:"100g" },
    { name:"苹果（一个）", kcal:85, per:"个" },
  ];
  return { code:0, data: pool.filter(f => !q || f.name.includes(q)).slice(0,6) };
}

// POST /api/meals —— 新增一条餐食
async function apiAddMeal(name, kcal, scale) {
  await _delay(120);
  return { code:0, data:{ id:"m"+Date.now(), name, kcal, scale: scale||"1份" } };
}

// DELETE /api/meals/:id —— 删除
async function apiDeleteMeal(id) { await _delay(100); return {code:0}; }

// PUT /api/meals/:id —— 编辑
async function apiEditMeal(id, patch) { await _delay(100); return { code:0, data:patch }; }

// POST /api/weights —— 记录体重
async function apiAddWeight(kg) { await _delay(150); return { code:0, data:{date:"10-10", kg} }; }

// GET /api/plans · POST /api/purchase —— 订阅
async function apiPurchase(planId) { await _delay(600); return { code:0, data:{ planId } }; }

// PUT /api/goal —— 更新每日目标
async function apiUpdateGoal(patch) { await _delay(120); return { code:0, data:patch }; }

// POST /api/redeem —— 兑换会员码
// req: { code }  res: { code, data:{ ok, used?, level? } }
async function apiRedeem(code) {
  await _delay(600);
  // TODO: 换成真实后端校验兑换码
  const key=(code||"").trim().toUpperCase();
  if(!key) return { code:0, data:{ ok:false } };
  if(DB.usedCodes.includes(key)) return { code:0, data:{ ok:false, used:true } }; // 已被使用
  const level=DB.redeemCodes[key];
  if(!level) return { code:0, data:{ ok:false } };                          // 无效码
  delete DB.redeemCodes[key]; DB.usedCodes.push(key);                        // 标记已用
  return { code:0, data:{ ok:true, level } };
}