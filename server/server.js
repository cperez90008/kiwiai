'use strict';

const http    = require('http');
const fs      = require('fs');
const path    = require('path');
const url     = require('url');

const PORT        = process.env.PORT || 8080;
const CONFIG_PATH = '/app/config/.env';
const DATA_DIR    = '/app/data';
const PUBLIC_DIR  = '/app/public';
const LOG_DIR     = '/app/logs';

[DATA_DIR, LOG_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// ── Env helpers ────────────────────────────────────────────────
function readEnv() {
  try {
    return fs.readFileSync(CONFIG_PATH, 'utf8')
      .split('\n')
      .reduce((acc, line) => {
        const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
        if (m) acc[m[1].trim()] = m[2].trim();
        return acc;
      }, {});
  } catch { return {}; }
}

function writeEnv(updates) {
  let content = '';
  try { content = fs.readFileSync(CONFIG_PATH, 'utf8'); } catch {}
  Object.entries(updates).forEach(([key, val]) => {
    const re = new RegExp(`^${key}=.*$`, 'm');
    if (re.test(content)) content = content.replace(re, `${key}=${val}`);
    else content += `\n${key}=${val}`;
  });
  fs.writeFileSync(CONFIG_PATH, content);
  // Sync to process env for live changes
  Object.entries(updates).forEach(([k, v]) => { process.env[k] = v; });
}

// ── Model priority list ─────────────────────────────────────────
const MODELS = [
  { id:'groq-llama',    name:'Llama 3.3 70B',    provider:'groq',       tier:'free', costPer1M:0,    inputKey:'GROQ_API_KEY' },
  { id:'gemini-flash',  name:'Gemini 2.0 Flash',  provider:'gemini',     tier:'free', costPer1M:0,    inputKey:'GEMINI_API_KEY' },
  { id:'kimi-k2',       name:'Kimi K2 Thinking',  provider:'openrouter', tier:'mid',  costPer1M:0.60, inputKey:'OPENROUTER_API_KEY' },
  { id:'gpt4o-mini',    name:'GPT-4o mini',        provider:'openai',     tier:'paid', costPer1M:0.15, inputKey:'OPENAI_API_KEY' },
  { id:'claude-haiku',  name:'Claude 3.5 Haiku',   provider:'anthropic',  tier:'paid', costPer1M:0.25, inputKey:'ANTHROPIC_API_KEY' },
  { id:'gpt4o',         name:'GPT-4o',             provider:'openai',     tier:'paid', costPer1M:3.00, inputKey:'OPENAI_API_KEY' },
];

function classifyComplexity(text) {
  if (text.length > 800) return 'complex';
  if (/analyz|research|compar|in depth|explain.*detail|write.*report|essay/i.test(text)) return 'complex';
  if (/reason|think.*step|multi.?step|plan.*project/i.test(text)) return 'reasoning';
  return 'simple';
}

function selectModel(text = '') {
  const env = readEnv();
  const complexity = classifyComplexity(text);
  const available = MODELS.filter(m => {
    const key = env[m.inputKey] || process.env[m.inputKey] || '';
    return key.length > 8;
  });
  if (available.length === 0) return null;

  // Reasoning tasks → prefer Kimi K2 if available
  if (complexity === 'reasoning') {
    const kimi = available.find(m => m.id === 'kimi-k2');
    if (kimi) return kimi;
  }

  // Complex → skip free models, use first mid/paid
  if (complexity === 'complex') {
    const upgraded = available.find(m => m.tier !== 'free');
    if (upgraded) return upgraded;
  }

  // Default: always cheapest first
  return available[0];
}

// ── API callers ────────────────────────────────────────────────
async function callGroq(messages, apiKey) {
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages, max_tokens: 2048, temperature: 0.7 })
  });
  if (!r.ok) throw new Error(`Groq ${r.status}: ${await r.text()}`);
  const d = await r.json();
  return { content: d.choices[0].message.content, usage: d.usage };
}

async function callGemini(messages, apiKey) {
  const system = messages.find(m => m.role === 'system');
  const contents = messages.filter(m => m.role !== 'system').map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));
  const body = { contents };
  if (system) body.system_instruction = { parts: [{ text: system.content }] };
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${await r.text()}`);
  const d = await r.json();
  return {
    content: d.candidates[0].content.parts[0].text,
    usage: { prompt_tokens: d.usageMetadata?.promptTokenCount || 0, completion_tokens: d.usageMetadata?.candidatesTokenCount || 0 }
  };
}

async function callOpenAI(messages, apiKey, model = 'gpt-4o-mini') {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, max_tokens: 2048 })
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${await r.text()}`);
  const d = await r.json();
  return { content: d.choices[0].message.content, usage: d.usage };
}

async function callAnthropic(messages, apiKey) {
  const system = messages.find(m => m.role === 'system')?.content || '';
  const chat = messages.filter(m => m.role !== 'system');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 2048, system, messages: chat })
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${await r.text()}`);
  const d = await r.json();
  return { content: d.content[0].text, usage: { prompt_tokens: d.usage.input_tokens, completion_tokens: d.usage.output_tokens } };
}

async function callOpenRouter(messages, apiKey, model = 'moonshotai/kimi-k2-thinking') {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://github.com/cperez90008/kiwiai',
      'X-Title': 'KiwiAI'
    },
    body: JSON.stringify({ model, messages, max_tokens: 2048 })
  });
  if (!r.ok) throw new Error(`OpenRouter ${r.status}: ${await r.text()}`);
  const d = await r.json();
  return { content: d.choices[0].message.content, usage: d.usage || { prompt_tokens: 0, completion_tokens: 0 } };
}

async function callModel(model, messages) {
  const env = readEnv();
  const key = env[model.inputKey] || process.env[model.inputKey] || '';
  switch (model.provider) {
    case 'groq':       return callGroq(messages, key);
    case 'gemini':     return callGemini(messages, key);
    case 'openai':     return callOpenAI(messages, key, model.id === 'gpt4o' ? 'gpt-4o' : 'gpt-4o-mini');
    case 'anthropic':  return callAnthropic(messages, key);
    case 'openrouter': return callOpenRouter(messages, key);
    default:           throw new Error(`Unknown provider: ${model.provider}`);
  }
}

// ── Cost tracking ───────────────────────────────────────────────
const COST_FILE = path.join(DATA_DIR, 'costs.json');

function logCost(model, usage) {
  const cost = ((usage.prompt_tokens || 0) + (usage.completion_tokens || 0)) / 1_000_000 * (model.costPer1M || 0);
  let store = { total: 0, session: 0, entries: [] };
  try { store = JSON.parse(fs.readFileSync(COST_FILE, 'utf8')); } catch {}
  store.total  = (store.total  || 0) + cost;
  store.session = (store.session || 0) + cost;
  store.entries.push({ ts: Date.now(), model: model.name, tier: model.tier, cost,
    tokens: (usage.prompt_tokens || 0) + (usage.completion_tokens || 0) });
  if (store.entries.length > 2000) store.entries = store.entries.slice(-1000);
  fs.writeFileSync(COST_FILE, JSON.stringify(store));
  return cost;
}

// ── Memory ──────────────────────────────────────────────────────
const MEMORY_FILE = path.join(DATA_DIR, 'memory.json');

function extractMemory(text) {
  const patterns = [
    { re: /my name is ([A-Z][a-zA-Z\s]+)/i,              key: 'name' },
    { re: /i(?:'m| am) (?:a |an )?([a-z][\w\s]{2,30})/i, key: 'role' },
    { re: /i (?:work|am based) (?:at|in|for) ([\w\s]+)/i, key: 'workplace' },
    { re: /i (?:live|am) in ([\w\s,]+)/i,                key: 'location' },
    { re: /my (?:email|gmail) is ([\w.@]+)/i,             key: 'email' },
    { re: /call me ([A-Z][a-z]+)/i,                       key: 'name' },
  ];
  let mem = {};
  try { mem = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8')); } catch {}
  let changed = false;
  patterns.forEach(({ re, key }) => {
    const m = text.match(re);
    if (m && m[1]) { mem[key] = m[1].trim(); changed = true; }
  });
  if (changed) fs.writeFileSync(MEMORY_FILE, JSON.stringify(mem));
  return mem;
}

function getMemory() {
  try { return JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8')); } catch { return {}; }
}

function buildSystemPrompt(skills = []) {
  const mem = getMemory();
  const memCtx = Object.keys(mem).length
    ? '\n\nWhat I know about you:\n' + Object.entries(mem).map(([k,v]) => `- ${k}: ${v}`).join('\n')
    : '';
  const skillCtx = skills.length
    ? '\n\nActive skills: ' + skills.join(', ')
    : '';
  return `You are KiwiAI, a 24/7 autonomous AI agent running on a personal server. You are helpful, proactive, and efficient. You can execute tasks, remember context, and work autonomously.${memCtx}${skillCtx}`;
}

// ── Scheduler ───────────────────────────────────────────────────
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');

function getTasks() {
  try { return JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8')); } catch { return []; }
}

function saveTasks(tasks) {
  fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
}

// Simple cron-like scheduler (checks every minute)
const CRON_PATTERNS = {
  'every minute':           () => true,
  'every hour':             () => new Date().getMinutes() === 0,
  'every day':              () => new Date().getHours() === 8 && new Date().getMinutes() === 0,
  'every morning':          () => new Date().getHours() === 8 && new Date().getMinutes() === 0,
  'every evening':          () => new Date().getHours() === 18 && new Date().getMinutes() === 0,
  'every monday':           () => new Date().getDay() === 1 && new Date().getHours() === 9 && new Date().getMinutes() === 0,
  'every friday':           () => new Date().getDay() === 5 && new Date().getHours() === 17 && new Date().getMinutes() === 0,
  'every weekday':          () => new Date().getDay() >= 1 && new Date().getDay() <= 5 && new Date().getHours() === 9 && new Date().getMinutes() === 0,
};

function shouldRunTask(task) {
  if (!task.active) return false;
  const when = (task.when || '').toLowerCase().trim();
  // Check exact time patterns like "every day at 8am"
  const timeMatch = when.match(/at (\d+)(?::(\d+))?\s*(am|pm)?/i);
  if (timeMatch) {
    let hour = parseInt(timeMatch[1]);
    const min  = parseInt(timeMatch[2] || '0');
    const ampm = (timeMatch[3] || '').toLowerCase();
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    const now = new Date();
    if (now.getHours() !== hour || now.getMinutes() !== min) return false;
    // Check day pattern
    if (/monday/i.test(when) && now.getDay() !== 1) return false;
    if (/tuesday/i.test(when) && now.getDay() !== 2) return false;
    if (/wednesday/i.test(when) && now.getDay() !== 3) return false;
    if (/thursday/i.test(when) && now.getDay() !== 4) return false;
    if (/friday/i.test(when) && now.getDay() !== 5) return false;
    if (/saturday/i.test(when) && now.getDay() !== 6) return false;
    if (/sunday/i.test(when) && now.getDay() !== 0) return false;
    return true;
  }
  // Check keyword patterns
  for (const [pattern, check] of Object.entries(CRON_PATTERNS)) {
    if (when.includes(pattern)) return check();
  }
  return false;
}

async function runScheduledTask(task) {
  console.log(`[Scheduler] Running: ${task.name}`);
  const model = selectModel(task.task);
  if (!model) { console.log('[Scheduler] No model available'); return; }
  try {
    const messages = [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: task.task }
    ];
    const result = await callModel(model, messages);
    logCost(model, result.usage || {});
    // Log to file
    const logEntry = { ts: Date.now(), task: task.name, model: model.name, result: result.content };
    const logFile = path.join(LOG_DIR, 'scheduled.log');
    fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
    // Telegram notification if configured
    await notifyTelegram(`✅ *${task.name}*\n\n${result.content.slice(0, 3000)}`);
    console.log(`[Scheduler] Done: ${task.name}`);
  } catch (e) {
    console.error(`[Scheduler] Error in ${task.name}:`, e.message);
    await notifyTelegram(`⚠️ Scheduled task failed: *${task.name}*\nError: ${e.message}`);
  }
}

// Run scheduler every minute
setInterval(async () => {
  const tasks = getTasks();
  for (const task of tasks) {
    if (shouldRunTask(task)) await runScheduledTask(task);
  }
}, 60 * 1000);

// ── Telegram notifier ───────────────────────────────────────────
async function notifyTelegram(text) {
  const env = readEnv();
  const token = env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    const chunks = [];
    for (let i = 0; i < text.length; i += 4000) chunks.push(text.slice(i, i + 4000));
    for (const chunk of chunks) {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: chunk, parse_mode: 'Markdown' })
      });
    }
  } catch (e) { console.error('[Telegram notify]', e.message); }
}

// ── Static file server ──────────────────────────────────────────
function serveStatic(filePath, res) {
  const ext = path.extname(filePath);
  const mime = { '.html':'text/html', '.js':'application/javascript',
                 '.css':'text/css', '.json':'application/json', '.ico':'image/x-icon' };
  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': mime[ext] || 'text/plain' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
}

// ── HTTP Server ─────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // Collect body
  let body = '';
  req.on('data', d => body += d);
  req.on('end', async () => {
    const json = () => { try { return JSON.parse(body); } catch { return {}; } };
    const ok = (data) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
    const err = (msg, code = 500) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: msg })); };

    try {
      // ── Health ──────────────────────────────────────────────
      if (pathname === '/health') { res.writeHead(200); res.end('OK'); return; }

      // ── Serve panel HTML ────────────────────────────────────
      if (pathname === '/' || pathname === '/index.html') {
        serveStatic(path.join(PUBLIC_DIR, 'index.html'), res); return;
      }

      // ── Status ──────────────────────────────────────────────
      if (pathname === '/api/status') {
        const env = readEnv();
        const model = selectModel('');
        const costs = (() => { try { return JSON.parse(fs.readFileSync(COST_FILE)); } catch { return { total: 0 }; } })();
        ok({
          status: 'running',
          version: env.KIWI_VERSION || '1.0.0',
          activeModel: model?.name || 'None configured',
          activeTier: model?.tier || 'none',
          totalCost: costs.total || 0,
          uptime: process.uptime()
        });
        return;
      }

      // ── Chat ────────────────────────────────────────────────
      if (pathname === '/api/chat' && req.method === 'POST') {
        const { message, history = [], skills = [] } = json();
        if (!message) { err('No message', 400); return; }

        const model = selectModel(message);
        if (!model) { err('No API keys configured. Go to Setup to add a key.', 503); return; }

        extractMemory(message);

        const messages = [
          { role: 'system', content: buildSystemPrompt(skills) },
          ...history.slice(-10),
          { role: 'user', content: message }
        ];

        const result = await callModel(model, messages);
        const cost = logCost(model, result.usage || {});

        ok({ response: result.content, model: { name: model.name, tier: model.tier }, cost });
        return;
      }

      // ── Keys GET ────────────────────────────────────────────
      if (pathname === '/api/keys' && req.method === 'GET') {
        const env = readEnv();
        const masked = {};
        ['GROQ_API_KEY','OPENAI_API_KEY','ANTHROPIC_API_KEY','GEMINI_API_KEY',
         'OPENROUTER_API_KEY','TOGETHER_API_KEY','TELEGRAM_BOT_TOKEN','TELEGRAM_CHAT_ID',
         'USER_NAME','USER_ROLE'].forEach(k => {
          const v = env[k] || '';
          masked[k] = v.length > 4 ? '•'.repeat(Math.max(0, v.length - 4)) + v.slice(-4) : v;
        });
        ok(masked); return;
      }

      // ── Keys POST ───────────────────────────────────────────
      if (pathname === '/api/keys' && req.method === 'POST') {
        writeEnv(json());
        ok({ ok: true }); return;
      }

      // ── Models ──────────────────────────────────────────────
      if (pathname === '/api/models') {
        const env = readEnv();
        ok(MODELS.map(m => ({
          ...m,
          available: (env[m.inputKey] || process.env[m.inputKey] || '').length > 8
        })));
        return;
      }

      // ── Costs ───────────────────────────────────────────────
      if (pathname === '/api/costs') {
        try { ok(JSON.parse(fs.readFileSync(COST_FILE))); }
        catch { ok({ total: 0, session: 0, entries: [] }); }
        return;
      }

      // ── Memory GET ──────────────────────────────────────────
      if (pathname === '/api/memory' && req.method === 'GET') {
        ok(getMemory()); return;
      }

      // ── Memory DELETE ───────────────────────────────────────
      if (pathname === '/api/memory' && req.method === 'DELETE') {
        const { key } = json();
        const mem = getMemory();
        if (key) delete mem[key];
        else Object.keys(mem).forEach(k => delete mem[k]);
        fs.writeFileSync(MEMORY_FILE, JSON.stringify(mem));
        ok({ ok: true }); return;
      }

      // ── Tasks GET ───────────────────────────────────────────
      if (pathname === '/api/tasks' && req.method === 'GET') {
        ok(getTasks()); return;
      }

      // ── Tasks POST ──────────────────────────────────────────
      if (pathname === '/api/tasks' && req.method === 'POST') {
        const tasks = getTasks();
        const task = { ...json(), id: Date.now(), created: new Date().toISOString(), active: true };
        tasks.push(task);
        saveTasks(tasks);
        ok({ ok: true, id: task.id }); return;
      }

      // ── Tasks DELETE ─────────────────────────────────────────
      if (pathname.startsWith('/api/tasks/') && req.method === 'DELETE') {
        const id = parseInt(pathname.split('/').pop());
        const tasks = getTasks().filter(t => t.id !== id);
        saveTasks(tasks);
        ok({ ok: true }); return;
      }

      // ── Tasks toggle ─────────────────────────────────────────
      if (pathname.startsWith('/api/tasks/') && pathname.endsWith('/toggle') && req.method === 'POST') {
        const id = parseInt(pathname.split('/')[3]);
        const tasks = getTasks().map(t => t.id === id ? { ...t, active: !t.active } : t);
        saveTasks(tasks);
        ok({ ok: true }); return;
      }

      // ── Telegram test ────────────────────────────────────────
      if (pathname === '/api/telegram/test' && req.method === 'POST') {
        const env = readEnv();
        if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
          err('Telegram not configured', 400); return;
        }
        await notifyTelegram('🥝 *KiwiAI Test Message*\n\nYour agent is online and ready! 24/7 autonomous AI is active.');
        ok({ ok: true }); return;
      }

      // ── Telegram send ─────────────────────────────────────────
      if (pathname === '/api/telegram/send' && req.method === 'POST') {
        const { text } = json();
        await notifyTelegram(text);
        ok({ ok: true }); return;
      }

      // ── Logs ─────────────────────────────────────────────────
      if (pathname === '/api/logs') {
        try {
          const logFile = path.join(LOG_DIR, 'scheduled.log');
          const lines = fs.readFileSync(logFile, 'utf8')
            .trim().split('\n').filter(Boolean)
            .slice(-50)
            .map(l => { try { return JSON.parse(l); } catch { return null; } })
            .filter(Boolean)
            .reverse();
          ok(lines);
        } catch { ok([]); }
        return;
      }

      // 404 fallback
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));

    } catch (e) {
      console.error('[Server Error]', e);
      err(e.message || 'Internal error');
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🥝 KiwiAI Panel running on :${PORT}`);
  console.log(`📁 Data: ${DATA_DIR}`);
  console.log(`🔑 Config: ${CONFIG_PATH}`);
});
