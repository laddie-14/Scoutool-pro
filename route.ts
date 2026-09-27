import { NextRequest, NextResponse } from "next/server";
import { scrapeBulk, type ScrapeResult } from "@/lib/scraper";

export const maxDuration = 60; // Vercel pro allows higher, free is 10-60s depending on plan

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { urls } = body as { urls: string[] };

    if (!Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json({ error: "Please provide an array of urls" }, { status: 400 });
    }

    if (urls.length > 100) {
      return NextResponse.json({ error: "Maximum 100 URLs per request for now" }, { status: 400 });
    }

    // Clean & dedupe
    const cleanUrls = [...new Set(urls.map((u) => u.trim()).filter(Boolean))];

    const results: ScrapeResult[] = await scrapeBulk(cleanUrls, {
      concurrency: 6,
      timeoutMs: 7500,
      maxPagesPerSite: 9,
    });

    // Aggregate stats
    const totalEmails = results.reduce((sum, r) => sum + r.emails.length, 0);
    const successful = results.filter((r) => r.success).length;

    return NextResponse.json({
      success: true,
      stats: {
        processed: results.length,
        successful,
        totalEmails,
      },
      results,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
