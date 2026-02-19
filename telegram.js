'use strict';

const https = require('https');
const http  = require('http');
const fs    = require('fs');

const CONFIG_PATH = '/app/config/.env';
const DATA_DIR    = '/app/data';
const PANEL_URL   = `http://kiwiai-panel:${process.env.PORT || 8080}`;

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

// ── Telegram API ────────────────────────────────────────────────
function tgRequest(method, params, token) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(params);
    const opts = {
      hostname: 'api.telegram.org',
      path: `/bot${token}/${method}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    };
    const req = https.request(opts, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({}); } });
    });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

async function sendMessage(chatId, text, token) {
  // Split into chunks (Telegram max 4096 chars)
  const chunks = [];
  for (let i = 0; i < text.length; i += 4000) chunks.push(text.slice(i, i + 4000));
  for (const chunk of chunks) {
    await tgRequest('sendMessage', {
      chat_id: chatId,
      text: chunk,
      parse_mode: 'Markdown'
    }, token);
  }
}

async function sendTyping(chatId, token) {
  await tgRequest('sendChatAction', { chat_id: chatId, action: 'typing' }, token);
}

// ── Send to KiwiAI Panel ────────────────────────────────────────
function askPanel(message) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ message });
    const opts = {
      hostname: 'kiwiai-panel',
      port: process.env.PORT || 8080,
      path: '/api/chat',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    };
    const req = http.request(opts, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => {
        try {
          const parsed = JSON.parse(d);
          resolve(parsed.response || parsed.error || 'Done.');
        } catch { resolve('Response received.'); }
      });
    });
    req.on('error', () => resolve('⚠️ Agent connection error. Please try again.'));
    req.setTimeout(120000, () => { req.destroy(); resolve('⚠️ Request timed out.'); });
    req.write(body); req.end();
  });
}

// ── Main polling loop ───────────────────────────────────────────
let offset = 0;
let lastEnvCheck = 0;
let BOT_TOKEN = '';
let CHAT_ID = '';

async function checkConfig() {
  const now = Date.now();
  if (now - lastEnvCheck < 30000) return; // Recheck every 30s
  lastEnvCheck = now;
  const env = readEnv();
  BOT_TOKEN = env.TELEGRAM_BOT_TOKEN || '';
  CHAT_ID   = env.TELEGRAM_CHAT_ID || '';
}

async function poll() {
  await checkConfig();

  if (!BOT_TOKEN) {
    // No token yet — wait quietly
    setTimeout(poll, 15000);
    return;
  }

  try {
    const updates = await tgRequest('getUpdates', {
      offset,
      timeout: 25,
      allowed_updates: ['message', 'callback_query']
    }, BOT_TOKEN);

    if (updates.ok && updates.result?.length > 0) {
      for (const update of updates.result) {
        offset = update.update_id + 1;

        const msg = update.message;
        if (!msg?.text) continue;

        const chatId   = String(msg.chat.id);
        const text     = msg.text.trim();
        const fromName = msg.from?.first_name || 'User';

        // Security check
        if (CHAT_ID && chatId !== String(CHAT_ID)) {
          await sendMessage(chatId, '⛔ Unauthorized access.', BOT_TOKEN);
          continue;
        }

        console.log(`[Telegram] ${fromName}: ${text.slice(0, 80)}`);

        // Handle commands
        if (text === '/start') {
          await sendMessage(chatId,
            `🥝 *KiwiAI is online!*\n\nYour 24/7 autonomous AI agent is ready.\n\n` +
            `Just send me any message and I'll get to work.\n\n` +
            `Commands:\n/status — check agent status\n/tasks — view scheduled tasks\n/costs — today's API costs`,
            BOT_TOKEN);
          continue;
        }

        if (text === '/status') {
          const env = readEnv();
          const hasKey = !!(env.GROQ_API_KEY || env.OPENAI_API_KEY || env.ANTHROPIC_API_KEY);
          await sendMessage(chatId,
            `🥝 *KiwiAI Status*\n\n` +
            `Agent: ✅ Online\n` +
            `Models: ${hasKey ? '✅ Configured' : '⚠️ No API keys'}\n` +
            `Telegram: ✅ Connected\n\n` +
            `Send any message to get started!`,
            BOT_TOKEN);
          continue;
        }

        if (text === '/tasks') {
          try {
            const tasks = JSON.parse(fs.readFileSync(`${DATA_DIR}/tasks.json`, 'utf8') || '[]');
            if (tasks.length === 0) {
              await sendMessage(chatId, '📋 No scheduled tasks yet.\n\nAdd them at your KiwiAI panel.', BOT_TOKEN);
            } else {
              const list = tasks.map(t => `• *${t.name}* — ${t.when} ${t.active ? '✅' : '⏸'}`).join('\n');
              await sendMessage(chatId, `📋 *Scheduled Tasks*\n\n${list}`, BOT_TOKEN);
            }
          } catch {
            await sendMessage(chatId, '📋 Could not load tasks.', BOT_TOKEN);
          }
          continue;
        }

        if (text === '/costs') {
          try {
            const costs = JSON.parse(fs.readFileSync(`${DATA_DIR}/costs.json`, 'utf8'));
            await sendMessage(chatId,
              `💰 *Cost Report*\n\nTotal all time: $${(costs.total || 0).toFixed(4)}\nMessages: ${(costs.entries || []).length}`,
              BOT_TOKEN);
          } catch {
            await sendMessage(chatId, '💰 No cost data yet.', BOT_TOKEN);
          }
          continue;
        }

        // Send to agent
        await sendTyping(chatId, BOT_TOKEN);
        const reply = await askPanel(text);
        await sendMessage(chatId, reply, BOT_TOKEN);
      }
    }
  } catch (e) {
    console.error('[Telegram Poll]', e.message);
  }

  setTimeout(poll, 1000);
}

console.log('🤖 KiwiAI Telegram bridge starting...');
poll();
