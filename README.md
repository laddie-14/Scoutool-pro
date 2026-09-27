# Scoutool Pro

**Fast & Accurate Email Scraper** built for Shopify store outreach.

### Why this beats the old v2

- **Privacy Policy first** – prioritizes every common privacy path (confirmed as the highest-value location)
- **Smart link discovery** – finds privacy/contact/about links from the homepage footer & nav
- **Confidence scoring** – Privacy Policy emails score 90+, domain-matched emails ranked highest
- **Stronger filtering** – removes placeholders, disposable domains, and heavily penalizes pure legal role accounts (`privacy@`, `dpo@`, etc.) when better options exist
- **Footer-aware** – specially extracts from `<footer>` sections
- **De-obfuscation** – handles `[at]`, `(at)`, spaced dots, etc.
- **Fast** – Cheerio + native fetch + controlled concurrency (keeps the speed you liked)
- Clean modern UI + one-click CSV export
- Vercel-ready

### Tech Stack

- Next.js 15 (App Router) + TypeScript
- Tailwind CSS
- Cheerio + p-limit
- Deployable on Vercel with zero config

### Quick Start

```bash
cd scoutool-pro
npm install
npm run dev
```

Open http://localhost:3000

### Deploy to Vercel

```bash
npx vercel
```

Or connect the GitHub repo in the Vercel dashboard.

### Current Limits (v1.1)

- Max 100 websites per request
- ~9 high-value pages checked per domain
- 6 concurrent domains
- Timeout ~7.5s per page

### What was improved after real testing

- Expanded path list (privacy-notice, legal/privacy, support, help, etc.)
- Homepage link discovery
- Footer-specific extraction
- Better confidence algorithm
- Domain-match prioritization in final ranking
- Basic bot-wall detection
- Stronger junk filtering

### Roadmap

- [ ] Optional MX verification layer
- [ ] Real-time progress streaming
- [ ] Team accounts + history
- [ ] Multi-Gmail account auto-sender (next major phase)
- [ ] Shopify store detection badge

---

Built for speed **and** accuracy.
