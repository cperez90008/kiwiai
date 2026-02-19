# 🥝 KiwiAI — Your 24/7 Autonomous AI Agent

> A self-hosted autonomous AI assistant with smart model routing, persistent memory, scheduled tasks, Telegram integration, and a beautiful control panel. Powered by Agent Zero. Built for non-developers.

![KiwiAI Panel](https://img.shields.io/badge/status-active-brightgreen) ![License](https://img.shields.io/badge/license-MIT-blue) ![Docker](https://img.shields.io/badge/docker-required-blue)

---

## ✨ What KiwiAI Does

- **Always on** — runs 24/7 on your VPS, never sleeps
- **Smart model routing** — uses free models first (Groq Llama 3.3, Gemini Flash), routes complex reasoning tasks to Kimi K2 Thinking, falls back to paid only when needed
- **Persistent memory** — remembers who you are across every conversation
- **Scheduler** — set tasks in plain English ("Every day at 8am, send me a news briefing")
- **Telegram** — chat with your agent from your phone, receive proactive alerts
- **16 built-in skills** — research, email, writing, code, finance, social media, and more
- **Agent Zero powered** — full sandboxed code execution, web search, file management, voice, browser automation

---

## 🚀 One-Command Install

On a fresh Ubuntu 22.04 or 24.04 VPS, run:

```bash
curl -fsSL https://raw.githubusercontent.com/cperez90008/kiwiai/main/install.sh | sudo bash
```

That's it. The installer will ask you 3 questions (password, domain, timezone) and handle everything else in ~5 minutes.

---

## 💰 Cost

| Item | Cost |
|---|---|
| VPS (Hetzner CX22 recommended) | ~$5/month |
| Groq API (Llama 3.3 70B) | Free |
| Google Gemini Flash | Free tier |
| Kimi K2 Thinking (OpenRouter) | ~$1-3/month typical use |
| GPT-4o mini (optional fallback) | ~$0-2/month |
| **Total** | **~$5-10/month** |

---

## 🤖 Model Routing

KiwiAI automatically picks the best model for every task:

| Priority | Model | Cost | Used For |
|---|---|---|---|
| 1 | Llama 3.3 70B (Groq) | Free | Chat, writing, Q&A |
| 2 | Gemini 2.0 Flash | Free | Long context, research |
| 3 | **Kimi K2 Thinking** | $0.60/1M | Multi-step reasoning, analysis |
| 4 | GPT-4o mini | $0.15/1M | Reliable fallback |
| 5 | Claude 3.5 Haiku | $0.25/1M | Nuanced writing |
| 6 | GPT-4o | $3.00/1M | Maximum intelligence |

---

## 🧩 Built-in Skills

| Skill | What it does |
|---|---|
| 🔍 Web Research | Real-time web search via SearXNG |
| 📧 Email Manager | Draft, reply, summarize emails |
| 📅 Calendar | Schedule, find free time, create events |
| ✍️ Writing Assistant | Blog posts, reports, essays |
| 💻 Code Helper | Write, debug, review code |
| 📋 Summarizer | Condense anything into key points |
| 📱 Social Media | LinkedIn, Twitter, Instagram content |
| 💰 Finance | Budget analysis, expense tracking |
| 🎤 Meeting Notes | Transcript → summary + action items |
| 🌍 Translator | 100+ languages |
| 🎯 Goal Planner | Break goals into action plans |
| 📰 News Briefing | Daily digest to Telegram |
| 🔎 SEO Assistant | Keywords and content optimization |
| 📊 Data Analyst | Analyze spreadsheets and numbers |
| ⚖️ Contract Reviewer | Flag key clauses in documents |
| 🎨 Creative Writer | Stories, scripts, brainstorming |

---

## 📋 Requirements

- Ubuntu 22.04 or 24.04 VPS
- Minimum 2GB RAM (4GB recommended — Hetzner CX22 is perfect)
- At least one API key (Groq is free and takes 60 seconds to get)

---

## 🔑 API Keys

Get these to power your agent:

| Key | Cost | Get It |
|---|---|---|
| **Groq** (start here) | Free | [console.groq.com](https://console.groq.com) |
| **Google Gemini** | Free tier | [aistudio.google.com](https://aistudio.google.com/app/apikey) |
| **OpenRouter** (for Kimi K2) | Pay per use | [openrouter.ai](https://openrouter.ai/keys) |
| OpenAI (optional) | Pay per use | [platform.openai.com](https://platform.openai.com/api-keys) |
| Anthropic (optional) | Pay per use | [console.anthropic.com](https://console.anthropic.com) |

---

## 🛠 Management Commands

After install, use the `kiwiai` command on your VPS:

```bash
kiwiai status    # See all running services
kiwiai logs      # Watch agent activity live
kiwiai restart   # Restart everything
kiwiai update    # Update to latest version
kiwiai backup    # Backup all your data
kiwiai stop      # Pause the agent
kiwiai start     # Resume the agent
```

---

## 🏗 Architecture

```
Nginx (HTTPS)
    │
    ├── KiwiAI Panel (port 8080) ←── Your browser / phone
    │       │
    │       ├── Model Router (Free → Kimi K2 → Paid)
    │       ├── Scheduler (runs tasks 24/7)
    │       ├── Memory (remembers you)
    │       └── Telegram Bridge
    │
    └── Agent Zero (port 50001) ←── The AI brain
            ├── SearXNG (web search)
            ├── Code execution sandbox
            ├── File management
            ├── Voice (STT/TTS)
            ├── MCP integrations
            └── Vector memory (FAISS)
```

---

## 📱 Telegram Setup

1. Open Telegram, search `@BotFather`, send `/newbot`
2. Copy your bot token
3. Paste it in KiwiAI Panel → Telegram
4. Get your Chat ID from `api.telegram.org/bot<TOKEN>/getUpdates`
5. Paste Chat ID, save, test

Once set up, you can chat with your agent from your phone anywhere in the world.

---

## 🔒 Security

- All API keys stored on your VPS only — never transmitted to third parties
- HTTPS with free Let's Encrypt SSL (if you provide a domain)
- Rate limiting on all endpoints
- Fail2ban blocks brute force attempts
- UFW firewall — only ports 80, 443, SSH open
- Agent Zero runs in isolated Docker container

---

## 📄 License

MIT — use it, modify it, share it.

---

## 🙏 Built On

- [Agent Zero](https://github.com/agent0ai/agent-zero) — The autonomous agent framework
- [Groq](https://groq.com) — Fast free LLM inference
- [Moonshot AI / Kimi K2 Thinking](https://huggingface.co/moonshotai/Kimi-K2-Thinking) — Open-source reasoning model
- [OpenRouter](https://openrouter.ai) — Multi-model API routing
