"use client";

import { useState, useCallback } from "react";
import { Search, Download, Loader2, Mail, CheckCircle2, XCircle, Zap } from "lucide-react";

interface EmailResult {
  email: string;
  sourceUrl: string;
  sourceType: string;
  confidence: number;
  domainMatch: boolean;
}

interface ScrapeResult {
  domain: string;
  originalUrl: string;
  emails: EmailResult[];
  pagesChecked: string[];
  success: boolean;
  error?: string;
  durationMs: number;
}

export default function Home() {
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<ScrapeResult[]>([]);
  const [stats, setStats] = useState({ processed: 0, successful: 0, totalEmails: 0 });
  const [error, setError] = useState<string | null>(null);

  const handleScrape = useCallback(async () => {
    setError(null);
    const urls = input
      .split("\n")
      .map((u) => u.trim())
      .filter(Boolean);

    if (urls.length === 0) {
      setError("Paste at least one website");
      return;
    }
    if (urls.length > 100) {
      setError("Maximum 100 websites per run for now");
      return;
    }

    setIsLoading(true);
    setResults([]);
    setStats({ processed: 0, successful: 0, totalEmails: 0 });

    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Scraping failed");
      }

      setResults(data.results || []);
      setStats(data.stats || { processed: 0, successful: 0, totalEmails: 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  }, [input]);

  const downloadCSV = () => {
    const rows = ["Email,Domain,Source Type,Confidence,Source URL,Domain Match"];
    for (const r of results) {
      for (const e of r.emails) {
        rows.push(
          `"${e.email}","${r.domain}","${e.sourceType}",${e.confidence},"${e.sourceUrl}",${e.domainMatch}`
        );
      }
    }
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `scoutool-pro-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalFound = results.reduce((sum, r) => sum + r.emails.length, 0);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Scoutool Pro</h1>
              <p className="text-xs text-slate-500">Accurate • Fast • Shopify-first</p>
            </div>
          </div>
          <div className="text-sm text-slate-500">Privacy Policy prioritized</div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="grid gap-6 lg:grid-cols-5">
          {/* Left - Input */}
          <div className="lg:col-span-2 space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Websites (one per line)
              </label>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={`https://store1.com\nhttps://store2.com\nexample.myshopify.com`}
                className="h-64 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                disabled={isLoading}
              />
              <p className="mt-2 text-xs text-slate-400">
                {input.split("\n").filter(Boolean).length} sites • Max 100 per run
              </p>

              <button
                onClick={handleScrape}
                disabled={isLoading}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Scraping…
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4" />
                    Start Scraping
                  </>
                )}
              </button>

              {error && (
                <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}
            </div>

            {/* Stats */}
            {(stats.processed > 0 || isLoading) && (
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-slate-200 bg-white p-3 text-center">
                  <div className="text-xl font-bold text-slate-900">{stats.processed}</div>
                  <div className="text-xs text-slate-500">Processed</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3 text-center">
                  <div className="text-xl font-bold text-emerald-600">{stats.successful}</div>
                  <div className="text-xs text-slate-500">Successful</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3 text-center">
                  <div className="text-xl font-bold text-indigo-600">{stats.totalEmails}</div>
                  <div className="text-xs text-slate-500">Emails</div>
                </div>
              </div>
            )}
          </div>

          {/* Right - Results */}
          <div className="lg:col-span-3">
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <h2 className="font-semibold text-slate-900">
                  Results {totalFound > 0 && <span className="text-indigo-600">({totalFound})</span>}
                </h2>
                {totalFound > 0 && (
                  <button
                    onClick={downloadCSV}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download CSV
                  </button>
                )}
              </div>

              <div className="max-h-[600px] overflow-y-auto">
                {results.length === 0 && !isLoading && (
                  <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                    <Mail className="mb-3 h-10 w-10 opacity-40" />
                    <p className="text-sm">No results yet. Paste websites and start scraping.</p>
                  </div>
                )}

                {isLoading && results.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                    <Loader2 className="mb-3 h-8 w-8 animate-spin text-indigo-500" />
                    <p className="text-sm">Scanning Privacy Policy, Contact & About pages…</p>
                  </div>
                )}

                <div className="divide-y divide-slate-100">
                  {results.map((r) => (
                    <div key={r.domain} className="px-5 py-4">
                      <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {r.success ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-400" />
                          )}
                          <span className="font-medium text-slate-800">{r.domain}</span>
                          <span className="text-xs text-slate-400">{r.durationMs}ms</span>
                        </div>
                        <span className="text-xs text-slate-500">
                          {r.emails.length} email{r.emails.length !== 1 ? "s" : ""}
                        </span>
                      </div>

                      {r.emails.length > 0 ? (
                        <div className="space-y-1.5">
                          {r.emails.map((e) => (
                            <div
                              key={e.email}
                              className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"
                            >
                              <div className="flex items-center gap-2">
                                <Mail className="h-3.5 w-3.5 text-slate-400" />
                                <span className="font-medium text-slate-800">{e.email}</span>
                                {e.domainMatch && (
                                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                                    domain match
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-xs text-slate-500">
                                <span className="capitalize">{e.sourceType}</span>
                                <span
                                  className={`rounded px-1.5 py-0.5 font-medium ${
                                    e.confidence >= 90
                                      ? "bg-emerald-100 text-emerald-700"
                                      : e.confidence >= 75
                                      ? "bg-amber-100 text-amber-700"
                                      : "bg-slate-200 text-slate-600"
                                  }`}
                                >
                                  {e.confidence}%
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400">
                          {r.error || "No emails found on checked pages"}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
