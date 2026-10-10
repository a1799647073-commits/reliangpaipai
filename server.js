// ============================================================================
// 热量拍拍 · 本地开发服务 + 豆包视觉识别代理
// ----------------------------------------------------------------------------
// 用途:
//   1. 用 Http 本地托管 index.html/styles.css/mock.js/api.js（解决 file:// 下
//      fetch 与 CORS 的限制，也便于将来 Capacitor 打包前的本地联调）
//   2. 代理 POST /api/analyse → 豆包(火山方舟)视觉模型，识别餐食热量
//      - 把 AI Key 放在服务端, 避免暴露在前端 JS 里(会被抓包)
//   3. 其余业务接口 apiVoice/apiSearchFood 等仍走前端 mock(本地)
//
// 运行:      node server.js
// 访问:      http://localhost:3000
// 前端代理:  http://localhost:3000/api/analyse
// ============================================================================

const http    = require('http');
const fs      = require('fs');
const path    = require('path');

const PORT = 3000;
const HOST = '127.0.0.1';                   // 本机联调绑定；如需手机访问改为 '0.0.0.0'
const ROOT = __dirname;                       // 本目录即静态根

// ---- 豆包(火山方舟)配置 ---- 在这里填入你的 Key
// ---- 视觉识别服务商配置 ---- 三选一，把用到的 Key 填上即可
// 选择方式：把 PROVIDER 设为 "doubao" 或 "deepseek"
const PROVIDER = "deepseek";   // <-- 改成你要用的服务商

// 1) 豆包（火山方舟）
const DOUBAO = {
  apiKey: process.env.ARK_API_KEY || "ARK_在这里填入你的火山方舟Key",
  base: "https://ark.cn-beijing.volces.com/api/v3",
  model: "doubao-1-5-vision-pro-32k-250115",
};
// 2) DeepSeek（deepseek-flash 支持图片输入）
const DEEPSEEK = {
  apiKey: process.env.DEEPSEEK_API_KEY || "sk-142475cea46e4af980bf6c086fbe0851",
  base: "https://api.deepseek.com",
  model: "deepseek-flash",
};

const VP = PROVIDER === "doubao" ? DOUBAO : DEEPSEEK;
const VNAME = PROVIDER === "doubao" ? "豆包" : "DeepSeek";

// 通用 JSON 响应
function sendJSON(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8',
                          'Access-Control-Allow-Origin': '*',
                          'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
                          'Access-Control-Allow-Headers': 'Content-Type' });
  res.end(JSON.stringify(obj));
}

// 静态文件托管
function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const file = path.join(ROOT, path.normalize(urlPath).replace(/^(\.\.[\/\\])+/, ''));
  if (!file.startsWith(ROOT)) return sendJSON(res, 403, { code: 403, msg: 'forbidden' });

  fs.readFile(file, (err, data) => {
    if (err) return sendJSON(res, 404, { code: 404, msg: 'not found: ' + urlPath });
    const ext = path.extname(file).toLowerCase();
    const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
                   '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml',
                   '.png':'image/png', '.jpg':'image/jpeg' }[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
}

// 读取请求 JSON body
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 6*1024*1024) { reject(new Error('payload too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch(e){ reject(e); } });
  });
}

// ============================================================
// 通用视觉识别：拍图 → 结构化热量（豆包 / DeepSeek 均走 OpenAI 兼容接口）
// ============================================================
async function callVision(imageBase64WithoutPrefix) {
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

  const body = {
    model: VP.model,
    temperature: 0.1,
    messages: [
      { role: 'system', content: '你是食物营养与热量估算助手，输出必须为合法 JSON。' },
      { role: 'user', content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + imageBase64WithoutPrefix } }
      ]}
    ],
    response_format: { type: 'json_object' }   // 部分模型支持，若报错可去掉
  };

  const resp = await fetch(VP.base + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + VP.apiKey },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(VNAME + '接口 HTTP ' + resp.status + ': ' + errText.slice(0, 300));
  }
  const json = await resp.json();
  const content = json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
  if (!content) throw new Error(VNAME + '未返回内容');
  return JSON.parse(content);
}

// ============================================================
// 文本解析（语音转写 / 手动录入）：AI 解析食物 → 追问一轮 → 结果
// ============================================================
async function callParse(text, extra) {
  const secondRound = !!extra;
  const prompt = secondRound
    ? '你是营养师助手。第一轮描述：' + text + '；用户补充（最后一次机会）：' + extra
      + ' 请结合补充信息给出最终估算。必须输出 JSON，不要多余文字或 ```：'
      + '{ "needMore":false, "items":[ { "name":"菜品名", "gram":克数, "kcal":千卡 } ], "totalKcal":总千卡, "tip":"一句中文控卡建议" }'
      + ' 参考《中国食物成分表》；克重/热量用纯数字；没有补充到克重就用常见标准份估算并在 tip 注明。'
    : '你是营养师助手。用户用一句话描述吃过的食物（可能信息不全）。规则：'
      + '1) 判断信息是否足以估算热量：需要至少明确吃了什么（最好有份量/克重/碗盘大小）。'
      + '2) 若信息不足（如只说"吃了牛肉"没说多重/多大盘）→ 只输出：{ "needMore":true, "question":"一句中文追问，只问最关键缺失的一项，如：大概多重，或一碗还是一大份？" }'
      + '3) 若信息足够 → 输出：{ "needMore":false, "items":[ { "name":"菜品名", "gram":克数, "kcal":千卡 } ], "totalKcal":总千卡, "tip":"一句中文控卡建议" }'
      + '4) 参考《中国食物成分表》；克重/热量用纯数字；多个食物拆多项。用户描述：' + text;

  const body = {
    model: VP.model,
    temperature: 0.2,
    messages: [
      { role: 'system', content: '你是食物营养与热量估算助手，输出必须为合法 JSON。' },
      { role: 'user', content: prompt }
    ],
    response_format: { type: 'json_object' }
  };

  const resp = await fetch(VP.base + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + VP.apiKey },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(VNAME + '接口 HTTP ' + resp.status + ': ' + errText.slice(0, 300));
  }
  const json = await resp.json();
  const content = json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
  if (!content) throw new Error(VNAME + '未返回内容');
  return JSON.parse(content);
}

const server = http.createServer(async (req, res) => {
  // CORS 预检
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin':'*',
      'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers':'Content-Type' });
    return res.end();
  }

  // ---- 业务接口 ----
  if (req.url.startsWith('/api/analyse') && req.method === 'POST') {
    try {
      const b  = await readBody(req);
      const img = (b.image || '').replace(/^data:image\/\w+;base64,/, '');
      if (!img) return sendJSON(res, 400, { code: 400, msg: '缺少 image(base64)' });

      // 未填 Key 时给出可读的提示
      if (VP.apiKey.includes('在这里填入') || VP.apiKey.includes('你的')) {
        return sendJSON(res, 200, { code: 0, mock: true,
          data: { items:[{ id:'f1', name:'示例·宫保鸡丁饭（大份）', kcal:650, gram:380 },
                         { id:'f2', name:'示例·清炒时蔬', kcal:85, gram:180 }],
                  totalKcal:735,
                  tip:'已在 server.js 填写 '+VNAME+' 的 Key 后将启用真实识别（当前为 mock）。' } });
      }

      const d = await callVision(img);
      return sendJSON(res, 200, { code: 0, mock: false,
        data: { items: (d.items||[]).map(x => ({ id:'f'+(x.name||''), name:x.name, kcal:Number(x.kcal)||0, gram:Number(x.gram)||0 })),
                totalKcal: Number(d.totalKcal)||0, tip: d.tip || '' } });
    } catch (e) {
      return sendJSON(res, 500, { code: 500, msg: String(e && e.message || e) });
    }
  }

  if (req.url.startsWith('/api/parse') && req.method === 'POST') {
    try {
      const b = await readBody(req);
      const text = String(b.text || '').trim();
      const extra = String(b.extra || '').trim();
      if (!text) return sendJSON(res, 400, { code: 400, msg: '缺少 text' });

      if (VP.apiKey.includes('在这里填入') || VP.apiKey.includes('你的')) {
        return sendJSON(res, 200, { code: 0, mock: true,
          data: { needMore: false,
                  items: [{ id:'f1', name:'示例·牛肉荞麦面（中碗）', gram:320, kcal:610 }],
                  totalKcal:610, tip:'在 server.js 填写 '+VNAME+' Key 后启用真实解析（当前为 mock）。' } });
      }

      const d = await callParse(text, extra);
      if (d.needMore) return sendJSON(res, 200, { code: 0, data: { needMore: true, question: d.question || '这道菜大概多重？' } });
      return sendJSON(res, 200, { code: 0, data: {
        needMore: false,
        items: (d.items||[]).map(x => ({ id:'f'+(x.name||''), name:x.name, gram:Number(x.gram)||0, kcal:Number(x.kcal)||0 })),
        totalKcal: Number(d.totalKcal)||0, tip: d.tip || '' } });
    } catch (e) {
      return sendJSON(res, 500, { code: 500, msg: String(e && e.message || e) });
    }
  }

  if (req.url.startsWith('/api/')) {            // 其余 api 由前端 mock 处理
    return sendJSON(res, 200, { code: 0, data: null, mock: true });
  }

  // ---- 静态文件 ----
  if (req.method === 'GET') return serveStatic(req, res);
  return sendJSON(res, 405, { code: 405, msg: 'method not allowed' });
});

server.listen(PORT, HOST, () => {
  console.log('热量拍拍 local dev server -> http://' + HOST + ':' + PORT);
  const keyOK = !(VP.apiKey.includes('在这里填入') || VP.apiKey.includes('你的'));
  console.log('识别服务商: ' + VNAME + ' / 模型: ' + VP.model + (keyOK ? '' : '  [未配置Key, 识别将走 mock]'));
});