## AI Marketing Automation Dashboard

### What you get
- **Dark-mode Tailwind dashboard**: Sidebar with **Lead Finder**, **Funnel Builder**, **Email Campaigns**
- **Primary CTA**: “**Generate Leads using AI**” (demo interaction + metrics update)
- **Integration**: Slack / Trello / Zapier (Demo + Real modes)

### How to run
Open `index.html` in your browser.


### Notes
- Tailwind is loaded via CDN, so an internet connection is needed for styles.

### Git / GitHub
- Локално repo: в папката на проекта пусни `sync-github.bat` или `git init`, после commit + push към твоя remote (`Repository settings → Remote` в GitHub Desktop).

### Integrations (Real mode)
Set these environment variables in Vercel:
- `SLACK_WEBHOOK_URL` (Slack Incoming Webhook URL)
- `TRELLO_KEY`, `TRELLO_TOKEN`, `TRELLO_LIST_ID` (Trello API + target list)
- `ZAPIER_WEBHOOK_URL` (optional fallback; you can also paste webhook URL per company in the UI)

