/**
 * unsplash-scraper.js
 *
 * Scrapes Unsplash search results using Puppeteer to extract real image slugs
 * in the format: '1511707171634-5f897ff02aa9'
 *
 * Setup:
 *   npm install puppeteer
 *
 * Usage (CLI):
 *   node unsplash-scraper.js "home appliances" 5
 *
 * Usage (module):
 *   const { scrapeUnsplashSlugs } = require('./unsplash-scraper');
 *   const slugs = await scrapeUnsplashSlugs('home appliances', 5);
 */

const puppeteer = require("puppeteer");

// ─── Configuration ────────────────────────────────────────────────────────────

const UNSPLASH_SEARCH_URL = "https://unsplash.com/s/photos";

// Regex that matches the slug format in Unsplash photo URLs
// e.g. /photos/some-descriptive-text-1511707171634-5f897ff02aa9
const SLUG_REGEX = /\/photo-(\d{13}-[a-zA-Z0-9]+)\?/;

// How long to wait for images to load on the page (ms)
const PAGE_LOAD_TIMEOUT = 15000;

// Delay between scroll attempts to trigger lazy loading (ms)
const SCROLL_DELAY_MS = 1200;

// ─── Main Scraper ─────────────────────────────────────────────────────────────

/**
 * Scrapes Unsplash for image slugs matching a keyword.
 *
 * @param {string}  keyword   - Search term (e.g. "home appliances")
 * @param {number}  quantity  - Number of slugs to return
 * @param {boolean} headless  - Run browser in background (default: true)
 * @returns {Promise<string[]>}
 */
async function scrapeUnsplashSlugs(keyword, quantity, headless = true) {
  if (!keyword || typeof keyword !== "string" || keyword.trim() === "") {
    throw new Error("keyword must be a non-empty string.");
  }
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new Error("quantity must be a positive integer.");
  }

  const searchUrl = `${UNSPLASH_SEARCH_URL}/${encodeURIComponent(keyword.trim())}`;
  console.log(`\n🌐 Opening: ${searchUrl}`);

  const browser = await puppeteer.launch({
    headless,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage", // prevents crashes on Linux
    ],
  });

  const page = await browser.newPage();

  // Mask as a real browser to avoid bot detection
  await page.setUserAgent(
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  );

  // Block images/fonts to speed up page load — we only need the HTML/JS
 

  try {
    await page.goto(searchUrl, {
      waitUntil: "networkidle2",
      timeout: PAGE_LOAD_TIMEOUT,
    });

    // Wait for photo grid to appear
    await new Promise((r) => setTimeout(r, 4000)); // let JS finish rendering

    const slugs = new Set();

    // ── Scroll + collect loop ──────────────────────────────────────────────
    let attempts = 0;
    const maxAttempts = Math.ceil(quantity / 10) + 5; // generous scroll budget

    while (slugs.size < quantity && attempts < maxAttempts) {
      // Extract all photo hrefs currently in the DOM
      const srcsets = await page.$$eval(
  'img[srcset*="images.unsplash.com/photo-"]',
  (imgs) => imgs.map((img) => img.getAttribute("srcset"))
);

for (const srcset of srcsets) {
  if (slugs.size >= quantity) break;
  const match = srcset.match(SLUG_REGEX);
  if (match) slugs.add(match[1]);
}

      console.log(`  → Collected ${slugs.size}/${quantity} slugs…`);

      if (slugs.size >= quantity) break;

      // Scroll down to trigger lazy loading of more images
      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
      await new Promise((r) => setTimeout(r, SCROLL_DELAY_MS));

      attempts++;
    }

    if (slugs.size < quantity) {
      console.warn(
        `⚠️  Only found ${slugs.size} unique slugs for "${keyword}" (requested ${quantity}).`
      );
    }

    return Array.from(slugs).slice(0, quantity);

  } finally {
    await browser.close();
  }
}

// ─── CLI Entry Point ──────────────────────────────────────────────────────────

async function main() {
  const [, , keywordArg, quantityArg, modeArg] = process.argv;

  if (!keywordArg || !quantityArg) {
    console.error("Usage: node unsplash-scraper.js <keyword> <quantity> [--visible]");
    console.error('Example: node unsplash-scraper.js "home appliances" 5');
    process.exit(1);
  }

  const quantity = parseInt(quantityArg, 10);
  if (isNaN(quantity) || quantity < 1) {
    console.error("Error: quantity must be a positive integer.");
    process.exit(1);
  }

  // Pass --visible as third arg to watch the browser scrape in real time
  const headless = modeArg !== "--visible";

  console.log(`🔍 Scraping Unsplash for "${keywordArg}" × ${quantity} images…`);

  try {
    const slugs = await scrapeUnsplashSlugs(keywordArg, quantity, headless);

    console.log(`\n✅ Found ${slugs.length} slug(s):\n`);
    slugs.forEach((slug, i) => console.log(`  ${i + 1}. ${slug}`));

    console.log("\n📋 JSON output:");
    console.log(JSON.stringify(slugs, null, 2));

    // Bonus: print working image URLs
    console.log("\n🖼️  Image URLs:");
    slugs.forEach((slug) =>
      console.log(`  https://images.unsplash.com/photo-${slug}?w=800&auto=format&fit=crop`)
    );

  } catch (err) {
    console.error(`\n❌ Error: ${err.message}`);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { scrapeUnsplashSlugs };
