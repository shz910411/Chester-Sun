// 迈思美 AI 餐食识别 · 本地代理（密钥只存本机，不进网页/不进 Git）
// 用法：DASHSCOPE_API_KEY=sk-xxx node ai-proxy.mjs
// 手机与 Mac 同一 WiFi，用户端地址加 ?ai=http://<Mac局域网IP>:8799 即开启真调
import http from 'http';
import os from 'os';

const KEY = process.env.DASHSCOPE_API_KEY;
const PORT = 8799;
if (!KEY) { console.error('缺少环境变量 DASHSCOPE_API_KEY（阿里云百炼 API-KEY）'); process.exit(1); }

// 系统提示词 = 211 规则库 + 输出契约 + 合规约束（白名单原则）
const SYS = `你是「迈思美轻体记录」的餐食识别引擎。识别照片中的食物，只输出 JSON，不要任何其他文字：
{"items":[{"name":"食物名(中文,简短)","portion":"份量描述如 约1碗/2片/1掌心","kcal_est":整数估算千卡}],"remark":""}
规则：
- 逐样列出可辨认的食物（最多 8 项），份量按常见家用餐具估
- kcal_est 为该份量的合理估算整数
- 只输出食物事实。绝对禁止：医疗或营养建议、疾病相关词、"减肥/减脂/瘦/超标/不健康"等评价
- 无法辨认食物时输出 {"items":[],"remark":"unrecognized"}`;

http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  if (req.method === 'OPTIONS') { res.end(); return; }
  if (req.method !== 'POST' || req.url !== '/analyze') { res.writeHead(404); res.end('not found'); return; }
  try {
    let body = ''; for await (const c of req) body += c;
    const { image } = JSON.parse(body); // dataURL (jpeg, 前端已压缩)
    const t0 = Date.now();
    const r = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.AI_MODEL || 'qwen-vl-plus',
        messages: [
          { role: 'system', content: SYS },
          { role: 'user', content: [ { type: 'image_url', image_url: { url: image } }, { type: 'text', text: '识别这一餐' } ] }
        ]
      })
    });
    const data = await r.json();
    const raw = data?.choices?.[0]?.message?.content || '';
    const m = raw.match(/\{[\s\S]*\}/);
    let parsed = { items: [], remark: 'parse_error' };
    if (m) { try { parsed = JSON.parse(m[0]); } catch (e) {} }
    // 出口合规过滤：剔除越界词条目
    const BAN = /减肥|减脂|瘦|燃脂|超标|不健康|治疗|调理|疾病/;
    parsed.items = (parsed.items || []).filter(x => x && x.name && !BAN.test(JSON.stringify(x))).slice(0, 8)
      .map(x => ({ name: String(x.name).slice(0, 20), portion: String(x.portion || '1 份').slice(0, 16), kcal_est: Math.max(5, Math.min(2000, parseInt(x.kcal_est) || 100)) }));
    parsed.remark = '';
    console.log(`[${new Date().toLocaleTimeString()}] 识别 ${parsed.items.length} 项 · ${Date.now() - t0}ms`);
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(parsed));
  } catch (e) {
    console.error('analyze error:', e.message);
    res.writeHead(500); res.end(JSON.stringify({ items: [], remark: 'error' }));
  }
}).listen(PORT, () => {
  const ip = Object.values(os.networkInterfaces()).flat().find(i => i?.family === 'IPv4' && !i.internal)?.address || 'localhost';
  console.log(`✅ AI 代理已启动: http://${ip}:${PORT}`);
  console.log(`📱 iPhone 同 WiFi 打开: http://${ip}:8766/index.html?ai=http://${ip}:${PORT}`);
});
