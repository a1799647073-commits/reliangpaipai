// ============================================================
// 热量拍拍 · Cloudflare Worker 识别后端（已填入 DeepSeek Key）
// ============================================================
// 使用：全选(Ctrl+A) → 复制(Ctrl+C) → 打开 Cloudflare Workers 编辑器
//       全选删除默认代码 → 粘贴(Ctrl+V) → 点 Deploy 部署
// 部署后记下网址 https://你的worker名.xxx.workers.dev
// ============================================================

const DEEPSEEK_KEY = "sk-142475cea46e4af980bf6c086fbe0851";

const MODEL = "deepseek-flash";
const BASE = "https://api.deepseek.com";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }
    if (request.method !== "POST") {
      return json({ code: 405, msg: "仅支持 POST" }, 405);
    }
    try {
      const body = await request.json();
      const url = new URL(request.url).pathname;

      // 拍照识别
      if (url.endsWith("/api/analyse") || url === "/") {
        const image = String(body.image || "").replace(/^data:image\/\w+;base64,/, "");
        if (!image) return json({ code: 400, msg: "缺少 image" }, 400);
        const result = await recognize(image);
        return json({ code: 0, data: result });
      }

      // 文本解析（语音转写 / 手动录入，含追问一轮）
      if (url.endsWith("/api/parse")) {
        const text = String(body.text || "").trim();
        if (!text) return json({ code: 400, msg: "缺少 text" }, 400);
        const result = await parseText(text, String(body.extra || "").trim());
        return json({ code: 0, data: result });
      }

      return json({ code: 404, msg: "未知接口" }, 404);
    } catch (e) {
      return json({ code: 500, msg: String(e && e.message || e) }, 500);
    }
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS }
  });
}

async function recognize(imageBase64) {
  const prompt = [
    '你是专业营养师，分析这张餐食照片中的食物并估算热量。',
    '要求：',
    '1) 只输出一个 JSON 对象，不要任何多余文字或 ``` 标记。',
    '2) 参考《中国食物成分表》常见数值；按"标准份/份量"估算，米饭约一碗200g、肉菜约180g。',
    '3) 分清每道菜，每项给出克重(gram)与千卡(kcal)。看不清油、调味料时按常见的估算，并在 tip 中说明误差。',
    '4) gram、kcal 都用纯数字，不含单位。若实在无法判断某物，可忽略，不要编造。',
    'JSON 格式固定为:',
    '{ "items":[ { "name":"菜品名", "gram":克数, "kcal":千卡 } ], "totalKcal":总千卡,',
    '  "confidence":"高|中|低", "tip":"一句中文控卡建议与误差提醒" }'
  ].join(' ');

  const resp = await fetch(BASE + "/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + DEEPSEEK_KEY
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.1,
      messages: [
        { role: "system", content: "你是食物营养与热量估算助手，输出必须为合法 JSON。" },
        { role: "user", content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: "data:image/jpeg;base64," + imageBase64 } }
        ]}
      ]
    })
  });

  if (!resp.ok) {
    const t = await resp.text();
    throw new Error("DeepSeek HTTP " + resp.status + ": " + t.slice(0, 200));
  }
  const r = await resp.json();
  const content = r.choices && r.choices[0] && r.choices[0].message && r.choices[0].message.content;
  if (!content) throw new Error("DeepSeek 未返回内容");
  const d = JSON.parse(content);
  return {
    items: (d.items || []).map(x => ({
      id: "f" + (x.name || ""),
      name: x.name || "未知食物",
      gram: Number(x.gram) || 0,
      kcal: Number(x.kcal) || 0
    })),
    totalKcal: Number(d.totalKcal) || 0,
    confidence: d.confidence || "中",
    tip: d.tip || "估算存在 ±20% 误差"
  };
}

// 文本解析（语音转写 / 手动录入）
// text: 用户描述（如"吃了牛肉面"）；extra: 追问补充（第二次调用时带）
// 第一轮信息不足（如没说克重/份量）→ 返回 needMore=true + question（只追问一次）
// 第二轮带 extra → 必须给出完整估算
async function parseText(text, extra) {
  const secondRound = !!extra;
  const prompt = secondRound
    ? [
        '你是营养师助手。以下是用户第一轮描述：' + text,
        '以下是用户补充的信息（第二轮，最后一次机会）：' + extra,
        '请结合补充信息，给出最终热量估算。必须输出 JSON，不要多余文字或 ```：',
        '{ "needMore":false, "items":[ { "name":"菜品名", "gram":克数, "kcal":千卡 } ],',
        '  "totalKcal":总千卡, "tip":"一句中文控卡建议" }',
        '参考《中国食物成分表》；克重/热量用纯数字；没有补充到克重就用常见标准份估算并在 tip 注明。'
      ].join(' ')
    : [
        '你是营养师助手。用户用一句话描述吃过的食物（可能信息不全）。',
        '规则：',
        '1) 判断信息是否足以估算热量：需要至少明确"吃了什么"（最好有份量/克重/碗盘大小）。',
        '2) 若信息不足（例如只说"吃了牛肉"，没说多重或多大盘）→ 只输出：',
        '   { "needMore":true, "question":"一句中文追问，只问最关键缺失的一项，如：大概多重，或一碗还是一大份？" }',
        '3) 若信息足够 → 输出：',
        '   { "needMore":false, "items":[ { "name":"菜品名", "gram":克数, "kcal":千卡 } ],',
        '     "totalKcal":总千卡, "tip":"一句中文控卡建议" }',
        '4) 参考《中国食物成分表》；克重/热量用纯数字；多个食物拆多项。',
        '用户描述：' + text
      ].join(' ');

  const resp = await fetch(BASE + "/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + DEEPSEEK_KEY
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      messages: [
        { role: "system", content: "你是食物营养与热量估算助手，输出必须为合法 JSON。" },
        { role: "user", content: prompt }
      ]
    })
  });

  if (!resp.ok) {
    const t = await resp.text();
    throw new Error("DeepSeek HTTP " + resp.status + ": " + t.slice(0, 200));
  }
  const r = await resp.json();
  const content = r.choices && r.choices[0] && r.choices[0].message && r.choices[0].message.content;
  if (!content) throw new Error("DeepSeek 未返回内容");
  const d = JSON.parse(content);

  if (d.needMore) {
    // 追问一次：若第二轮回仍 needMore，则按标准份兜底估算（由调用方处理）
    return {
      needMore: true,
      question: d.question || "这道菜大概多重？是一碗还是一大份？"
    };
  }
  return {
    needMore: false,
    items: (d.items || []).map(x => ({
      id: "f" + (x.name || ""),
      name: x.name || "未知食物",
      gram: Number(x.gram) || 0,
      kcal: Number(x.kcal) || 0
    })),
    totalKcal: Number(d.totalKcal) || 0,
    tip: d.tip || "估算存在 ±20% 误差"
  };
}