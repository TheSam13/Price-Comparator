const { chromium } = require('playwright');

async function scrapeProduct(url) {
    // 1. Launch a headless browser
    const browser = await chromium.launch({ headless: false });
    
    // 2. Create a context with a realistic User-Agent to avoid immediate bot detection
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    
    const page = await context.newPage();
    let result = { status: 'FAILED', url: url };

    try {
        console.log(`Navigating to: ${url}`);
        // Wait until the network is mostly idle, ensuring dynamic pricing scripts have loaded
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

        if (url.includes('amazon.')) {
            result = await parseAmazon(page);
        } else if (url.includes('flipkart.')) {
            result = await parseFlipkart(page);
        } else {
            throw new Error('Unsupported platform');
        }

        result.url = url;
        result.status = 'SUCCESS';

    } catch (error) {
        console.error(`Scraping failed for ${url}:`, error.message);
        result.error = error.message;
    } finally {
        await browser.close();
    }

    return result;
}

// --- Platform Specific Parsers ---

async function parseAmazon(page) {
    // Wait for the specific price element to render on the DOM
    await page.waitForSelector('.a-price-whole', { timeout: 5000 });

    // Extract raw text
   const title = await page.locator('span#productTitle').first().innerText();
    const rawPrice = await page.locator('.a-price-whole').first().innerText();
    
    // Clean data: Remove commas, whitespace, and convert to integer/float
    const cleanPrice = parseFloat(rawPrice.replace(/,/g, '').trim());

    return {
        platform: 'AMAZON',
        title: title.trim(),
        price: cleanPrice
    };
}

async function parseFlipkart(page) {
    // 1. The Title Bypass: Read the Browser Tab
    const rawTitle = await page.title();
    const title = rawTitle.split('- Buy')[0].trim();

    // 2. Wait for the page to render the Rupee symbol anywhere on the screen
    await page.waitForFunction(() => document.body.innerText.includes('₹'), { timeout: 15000 });

    // 3. Extract ALL visible text from the entire webpage
    const bodyText = await page.locator('body').innerText();

    // 4. Use RegEx to find the first instance of "₹" followed by numbers/commas
    // This looks for: ₹, optional spaces, and then a group of digits and commas
    const priceMatch = bodyText.match(/₹\s*([0-9,]+)/);

    if (!priceMatch) {
        throw new Error('Could not find a price on the page. Flipkart might be blocking us visually.');
    }

    // 5. Clean the Data (priceMatch[1] contains just the extracted number string)
    const cleanPrice = parseFloat(priceMatch[1].replace(/,/g, '').trim());

    return {
        platform: 'FLIPKART',
        title: title || 'Flipkart Product',
        price: cleanPrice
    };
}

module.exports = { scrapeProduct };