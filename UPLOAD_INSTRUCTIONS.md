# How to Upload KiwiAI to GitHub
# For: github.com/cperez90008/kiwiai

Follow these steps IN ORDER. Each step is copy-paste.

═══════════════════════════════════════════════════════
STEP 1 — Go to your repo and create each file
═══════════════════════════════════════════════════════

Open: https://github.com/cperez90008/kiwiai

You'll add files one at a time using GitHub's web editor.
For each file:
  1. Click "Add file" → "Create new file"
  2. Type the filename (including any folder path)
  3. Paste the content
  4. Click "Commit changes"

═══════════════════════════════════════════════════════
FILE LIST — Create these files in this order:
═══════════════════════════════════════════════════════

1.  README.md                    ← Already exists (was auto-created)
                                   Click it → Edit (pencil icon) → replace with new content

2.  install.sh                   ← Root of repo
3.  docker-compose.yml           ← Root of repo

4.  server/server.js             ← Type "server/server.js" as filename
                                   GitHub auto-creates the folder
5.  server/telegram.js
6.  server/package.json

7.  panel/index.html             ← Type "panel/index.html"

8.  skills/research.md           ← Type "skills/research.md"
9.  skills/email.md
10. skills/writing.md
11. skills/code.md
12. skills/finance.md
13. skills/social.md
14. skills/meetings.md
15. skills/calendar.md

16. config/.env.example          ← Type "config/.env.example"

═══════════════════════════════════════════════════════
STEP 2 — Verify the structure looks like this:
═══════════════════════════════════════════════════════

kiwiai/
├── README.md
├── install.sh
├── docker-compose.yml
├── server/
│   ├── server.js
│   ├── telegram.js
│   └── package.json
├── panel/
│   └── index.html
├── skills/
│   ├── research.md
│   ├── email.md
│   ├── writing.md
│   ├── code.md
│   ├── finance.md
│   ├── social.md
│   ├── meetings.md
│   └── calendar.md
└── config/
    └── .env.example

═══════════════════════════════════════════════════════
STEP 3 — Make install.sh executable
═══════════════════════════════════════════════════════

GitHub doesn't set file permissions by default.
You need to do this once from a terminal (Mac/Linux) OR
use GitHub Actions. The easiest way:

If you have a Mac or Linux computer:
  git clone https://github.com/cperez90008/kiwiai
  cd kiwiai
  git update-index --chmod=+x install.sh
  git commit -m "make install.sh executable"
  git push

If you only have Windows, skip this step for now —
the installer will still work if users run it as:
  bash <(curl -fsSL https://raw.githubusercontent.com/cperez90008/kiwiai/main/install.sh)

═══════════════════════════════════════════════════════
STEP 4 — Your install command is now live:
═══════════════════════════════════════════════════════

curl -fsSL https://raw.githubusercontent.com/cperez90008/kiwiai/main/install.sh | sudo bash

Share this with anyone to give them their own KiwiAI.

═══════════════════════════════════════════════════════
STEP 5 — Get your VPS
═══════════════════════════════════════════════════════

Recommended: Hetzner CX22 (~$5/month, 4GB RAM)
  1. Go to hetzner.com → Cloud → Create Server
  2. Location: Any (closest to you)
  3. Image: Ubuntu 24.04
  4. Type: CX22 (4GB RAM, 2 vCPU)
  5. SSH Key: Add yours OR use root password
  6. Create server

Copy the server IP address.

═══════════════════════════════════════════════════════
STEP 6 — Deploy KiwiAI
═══════════════════════════════════════════════════════

SSH into your server:
  ssh root@YOUR_SERVER_IP

Then run:
  curl -fsSL https://raw.githubusercontent.com/cperez90008/kiwiai/main/install.sh | sudo bash

Answer the 3 questions, wait ~5 minutes, open your browser.

═══════════════════════════════════════════════════════
FIRST THING TO DO AFTER INSTALL:
═══════════════════════════════════════════════════════

1. Open http://YOUR_SERVER_IP in browser
2. Click "Setup" in the sidebar
3. Add your Groq API key (free at console.groq.com)
4. Click "Save & Apply"
5. Go back to Chat and say "Hello!"
6. Set up Telegram for phone access (optional but great)

═══════════════════════════════════════════════════════
