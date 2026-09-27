import * as cheerio from "cheerio";
import pLimit from "p-limit";

// ============================================================
// TYPES
// ============================================================

export interface EmailResult {
  email: string;
  sourceUrl: string;
  sourceType: "privacy" | "contact" | "about" | "terms" | "footer" | "homepage" | "other";
  confidence: number; // 0-100
  domainMatch: boolean;
}

export interface ScrapeResult {
  domain: string;
  originalUrl: string;
  emails: EmailResult[];
  pagesChecked: string[];
  success: boolean;
  error?: string;
  durationMs: number;
}

export interface ScrapeOptions {
  concurrency?: number;
  timeoutMs?: number;
  maxPagesPerSite?: number;
}

// ============================================================
// CONSTANTS – Expanded from real-world testing
// ============================================================

const HIGH_VALUE_PATHS = [
  // Privacy Policy (highest priority – confirmed gold)
  "/policies/privacy-policy",
  "/pages/privacy-policy",
  "/pages/privacy-notice",
  "/privacy-policy",
  "/privacy",
  "/policies/privacy",
  "/legal/privacy-policy",
  "/legal/privacy",
  "/pages/privacy",
  "/en/privacy-policy",
  "/privacy-notice",

  // Contact
  "/pages/contact",
  "/pages/contact-us",
  "/contact",
  "/contact-us",
  "/pages/get-in-touch",
  "/pages/support",
  "/support",
  "/pages/customer-service",
  "/customer-service",
  "/pages/help",
  "/help",

  // About
  "/pages/about",
  "/pages/about-us",
  "/pages/our-story",
  "/about",
  "/about-us",
  "/pages/our-story",
  "/pages/team",
  "/pages/meet-the-team",

  // Terms (sometimes contains contact)
  "/policies/terms-of-service",
  "/pages/terms-of-service",
  "/terms",
  "/terms-of-service",
  "/policies/terms",
  "/legal/terms",
];

// Role accounts that are usually low value for outreach
const LOW_VALUE_LOCAL_PARTS = new Set([
  "privacy",
  "legal",
  "compliance",
  "dpo",
  "gdpr",
  "noreply",
  "no-reply",
  "donotreply",
  "mailer-daemon",
  "postmaster",
  "webmaster",
  "hostmaster",
  "abuse",
]);

const GENERIC_EMAILS = new Set([
  "example@example.com",
  "test@test.com",
  "email@example.com",
  "name@example.com",
  "your@email.com",
  "you@example.com",
  "user@example.com",
  "admin@example.com",
  "noreply@example.com",
  "no-reply@example.com",
  "info@example.com",
  "contact@example.com",
]);

const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "tempmail.com",
  "10minutemail.com",
  "throwaway.email",
  "yopmail.com",
  "sharklasers.com",
]);

const EMAIL_REGEX = /([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/gi;

const OBFUSCATION_PATTERNS = [
  { regex: /([a-zA-Z0-9._%+\-]+)\s*\[\s*at\s*\]\s*([a-zA-Z0-9.\-]+)\s*\[\s*dot\s*\]\s*([a-zA-Z]{2,})/gi, replace: "$1@$2.$3" },
  { regex: /([a-zA-Z0-9._%+\-]+)\s*\(\s*at\s*\)\s*([a-zA-Z0-9.\-]+)\s*\(\s*dot\s*\)\s*([a-zA-Z]{2,})/gi, replace: "$1@$2.$3" },
  { regex: /([a-zA-Z0-9._%+\-]+)\s+at\s+([a-zA-Z0-9.\-]+)\s+dot\s+([a-zA-Z]{2,})/gi, replace: "$1@$2.$3" },
  { regex: /([a-zA-Z0-9._%+\-]+)@([a-zA-Z0-9.\-]+)\s*\[\s*dot\s*\]\s*([a-zA-Z]{2,})/gi, replace: "$1@$2.$3" },
  { regex: /([a-zA-Z0-9._%+\-]+)\s*@\s*([a-zA-Z0-9.\-]+)\s*\.\s*([a-zA-Z]{2,})/gi, replace: "$1@$2.$3" },
];

// ============================================================
// HELPERS
// ============================================================

function normalizeDomain(input: string): string {
  let url = input.trim().toLowerCase();
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = "https://" + url;
  }
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return input.replace(/^(https?:\/\/)?(www\.)?/, "").split("/")[0];
  }
}

function buildUrl(domain: string, path: string): string {
  const cleanDomain = domain.replace(/\/$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `https://${cleanDomain}${cleanPath}`;
}

function isValidEmailFormat(email: string): boolean {
  if (!email || email.length > 254) return false;
  if (GENERIC_EMAILS.has(email.toLowerCase())) return false;
  const parts = email.split("@");
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  if (!local || !domain) return false;
  if (local.length > 64 || local.length < 1) return false;
  if (DISPOSABLE_DOMAINS.has(domain.toLowerCase())) return false;
  if (!/\.[a-zA-Z]{2,}$/.test(domain)) return false;
  // Reject obvious placeholders
  if (/^(test|example|sample|demo|placeholder|yourname|email)/i.test(local)) return false;
  return true;
}

function deobfuscateText(text: string): string {
  let result = text;
  for (const pattern of OBFUSCATION_PATTERNS) {
    result = result.replace(pattern.regex, pattern.replace);
  }
  return result;
}

function getLocalPart(email: string): string {
  return email.split("@")[0]?.toLowerCase() || "";
}

function calculateConfidence(
  sourceType: EmailResult["sourceType"],
  domainMatch: boolean,
  localPart: string
): number {
  let score = 55;

  // Source priority (Privacy Policy is king)
  if (sourceType === "privacy") score = 90;
  else if (sourceType === "contact") score = 82;
  else if (sourceType === "about") score = 72;
  else if (sourceType === "terms") score = 68;
  else if (sourceType === "footer") score = 70;
  else if (sourceType === "homepage") score = 60;

  // Strong boost for domain match
  if (domainMatch) score = Math.min(100, score + 12);

  // Penalty for pure legal/role accounts
  if (LOW_VALUE_LOCAL_PARTS.has(localPart)) {
    score = Math.max(30, score - 25);
  }

  // Small boost for common good outreach locals
  if (["hello", "hi", "team", "founder", "owner", "support", "help", "info", "contact", "sales", "customercare", "care"].includes(localPart)) {
    score = Math.min(100, score + 5);
  }

  return Math.min(100, Math.max(0, score));
}

function extractEmailsFromHtml(
  html: string,
  sourceUrl: string,
  sourceType: EmailResult["sourceType"],
  siteDomain: string
): EmailResult[] {
  const $ = cheerio.load(html);
  const found = new Map<string, EmailResult>();

  // 1. mailto: links (very high signal)
  $("a[href^='mailto:']").each((_, el) => {
    const href = $(el).attr("href") || "";
    const email = href.replace(/^mailto:/i, "").split("?")[0].trim().toLowerCase();
    if (isValidEmailFormat(email)) {
      const domainMatch = email.endsWith("@" + siteDomain) || email.endsWith("." + siteDomain);
      const local = getLocalPart(email);
      const confidence = calculateConfidence(sourceType, domainMatch, local);
      const existing = found.get(email);
      if (!existing || confidence > existing.confidence) {
        found.set(email, { email, sourceUrl, sourceType, confidence, domainMatch });
      }
    }
  });

  // 2. Footer-specific extraction (common place for contact emails)
  const footerSelectors = ["footer", "[role='contentinfo']", ".footer", "#footer", ".site-footer"];
  for (const sel of footerSelectors) {
    const footerText = deobfuscateText($(sel).text() || "");
    const matches = footerText.match(EMAIL_REGEX) || [];
    for (const raw of matches) {
      const email = raw.toLowerCase().trim();
      if (!isValidEmailFormat(email)) continue;
      const domainMatch = email.endsWith("@" + siteDomain) || email.endsWith("." + siteDomain);
      const local = getLocalPart(email);
      // Treat pure footer finds as "footer" type for scoring
      const conf = calculateConfidence("footer", domainMatch, local);
      const existing = found.get(email);
      if (!existing || conf > existing.confidence) {
        found.set(email, {
          email,
          sourceUrl,
          sourceType: sourceType === "homepage" ? "footer" : sourceType,
          confidence: conf,
          domainMatch,
        });
      }
    }
  }

  // 3. Full body text + deobfuscation
  const bodyText = deobfuscateText($("body").text() || "");
  const matches = bodyText.match(EMAIL_REGEX) || [];
  for (const raw of matches) {
    const email = raw.toLowerCase().trim();
    if (!isValidEmailFormat(email)) continue;

    const domainMatch = email.endsWith("@" + siteDomain) || email.endsWith("." + siteDomain);
    const local = getLocalPart(email);
    const confidence = calculateConfidence(sourceType, domainMatch, local);

    const existing = found.get(email);
    if (!existing || confidence > existing.confidence) {
      found.set(email, { email, sourceUrl, sourceType, confidence, domainMatch });
    }
  }

  // 4. data attributes
  $("[data-email], [data-mail], [data-contact-email]").each((_, el) => {
    const email = (
      $(el).attr("data-email") ||
      $(el).attr("data-mail") ||
      $(el).attr("data-contact-email") ||
      ""
    )
      .toLowerCase()
      .trim();
    if (isValidEmailFormat(email)) {
      const domainMatch = email.endsWith("@" + siteDomain);
      const local = getLocalPart(email);
      const confidence = calculateConfidence(sourceType, domainMatch, local);
      const existing = found.get(email);
      if (!existing || confidence > existing.confidence) {
        found.set(email, { email, sourceUrl, sourceType, confidence, domainMatch });
      }
    }
  });

  return Array.from(found.values());
}

function detectSourceType(path: string): EmailResult["sourceType"] {
  const p = path.toLowerCase();
  if (p.includes("privacy") || p.includes("privacy-notice")) return "privacy";
  if (p.includes("contact") || p.includes("get-in-touch") || p.includes("support") || p.includes("help") || p.includes("customer-service")) return "contact";
  if (p.includes("about") || p.includes("our-story") || p.includes("team") || p.includes("meet-the-team")) return "about";
  if (p.includes("terms") || p.includes("legal")) return "terms";
  if (p === "/" || p === "") return "homepage";
  return "other";
}

// Discover additional high-value links from homepage
function discoverLinks($: cheerio.CheerioAPI, baseDomain: string): string[] {
  const discovered: string[] = [];
  const keywords = ["privacy", "contact", "about", "terms", "support", "help", "legal"];

  $("a[href]").each((_, el) => {
    const href = ($(el).attr("href") || "").toLowerCase();
    const text = ($(el).text() || "").toLowerCase();

    for (const kw of keywords) {
      if (href.includes(kw) || text.includes(kw)) {
        try {
          let full = href;
          if (href.startsWith("/")) {
            full = `https://${baseDomain}${href}`;
          } else if (!href.startsWith("http")) {
            full = `https://${baseDomain}/${href}`;
          }
          const url = new URL(full);
          if (url.hostname.replace(/^www\./, "") === baseDomain) {
            discovered.push(url.origin + url.pathname);
          }
        } catch {
          // ignore invalid
        }
        break;
      }
    }
  });

  return [...new Set(discovered)].slice(0, 6); // limit discoveries
}

// ============================================================
// CORE FETCH
// ============================================================

async function fetchPage(
  url: string,
  timeoutMs: number
): Promise<{ html: string; finalUrl: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Upgrade-Insecure-Requests": "1",
      },
      redirect: "follow",
    });

    clearTimeout(timer);

    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return null;
    }

    const html = await res.text();
    // Basic bot-wall detection
    if (
      html.includes("Vercel Security Checkpoint") ||
      html.includes("Just a moment...") ||
      html.includes("cf-browser-verification") ||
      html.length < 400
    ) {
      return null;
    }

    return { html, finalUrl: res.url };
  } catch {
    clearTimeout(timer);
    return null;
  }
}

// ============================================================
// MAIN SCRAPER FOR ONE DOMAIN
// ============================================================

export async function scrapeDomain(
  inputUrl: string,
  options: ScrapeOptions = {}
): Promise<ScrapeResult> {
  const start = Date.now();
  const timeoutMs = options.timeoutMs ?? 7500;
  const maxPages = options.maxPagesPerSite ?? 9;

  const domain = normalizeDomain(inputUrl);
  const originalUrl = inputUrl.startsWith("http") ? inputUrl : `https://${domain}`;

  const result: ScrapeResult = {
    domain,
    originalUrl,
    emails: [],
    pagesChecked: [],
    success: false,
    durationMs: 0,
  };

  try {
    const allEmails = new Map<string, EmailResult>();
    const pagesToCheck = new Set<string>();

    // 1. Always start with homepage
    pagesToCheck.add(buildUrl(domain, "/"));

    // 2. Add all high-value known paths
    for (const path of HIGH_VALUE_PATHS) {
      pagesToCheck.add(buildUrl(domain, path));
    }

    // 3. Fetch homepage first to discover more links
    const home = await fetchPage(buildUrl(domain, "/"), timeoutMs);
    if (home) {
      result.pagesChecked.push(home.finalUrl);
      const $ = cheerio.load(home.html);
      const discovered = discoverLinks($, domain);
      for (const link of discovered) {
        pagesToCheck.add(link);
      }

      // Extract from homepage immediately
      const homeEmails = extractEmailsFromHtml(home.html, home.finalUrl, "homepage", domain);
      for (const e of homeEmails) {
        allEmails.set(e.email, e);
      }
    }

    // 4. Limit total pages and fetch the rest concurrently
    const remaining = [...pagesToCheck]
      .filter((u) => !result.pagesChecked.includes(u))
      .slice(0, maxPages - 1);

    const limit = pLimit(5); // balanced for speed + politeness

    const pagePromises = remaining.map((pageUrl) =>
      limit(async () => {
        const fetched = await fetchPage(pageUrl, timeoutMs);
        if (!fetched) return null;

        result.pagesChecked.push(fetched.finalUrl);
        const sourceType = detectSourceType(new URL(fetched.finalUrl).pathname);
        return extractEmailsFromHtml(fetched.html, fetched.finalUrl, sourceType, domain);
      })
    );

    const pageResults = await Promise.all(pagePromises);

    for (const emails of pageResults) {
      if (!emails) continue;
      for (const e of emails) {
        const existing = allEmails.get(e.email);
        if (!existing || e.confidence > existing.confidence) {
          allEmails.set(e.email, e);
        }
      }
    }

    // Final ranking: domain match first, then confidence
    result.emails = Array.from(allEmails.values()).sort((a, b) => {
      if (a.domainMatch && !b.domainMatch) return -1;
      if (!a.domainMatch && b.domainMatch) return 1;
      return b.confidence - a.confidence;
    });

    result.success = true;
  } catch (err) {
    result.error = err instanceof Error ? err.message : "Unknown error";
  }

  result.durationMs = Date.now() - start;
  return result;
}

// ============================================================
// BULK SCRAPER
// ============================================================

export async function scrapeBulk(
  urls: string[],
  options: ScrapeOptions = {},
  onProgress?: (done: number, total: number, latest: ScrapeResult) => void
): Promise<ScrapeResult[]> {
  const concurrency = options.concurrency ?? 6;
  const limit = pLimit(concurrency);
  const results: ScrapeResult[] = [];
  let done = 0;

  const promises = urls.map((url) =>
    limit(async () => {
      const res = await scrapeDomain(url, options);
      results.push(res);
      done++;
      if (onProgress) onProgress(done, urls.length, res);
      return res;
    })
  );

  await Promise.all(promises);
  return results;
}
