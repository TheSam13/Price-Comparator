require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { chromium } = require('playwright');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 10000; 

app.use(cors());
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 🧠 AI SEMANTIC VALIDATOR
async function validateAllWithAI(query, amazonCards, flipkartCards, blinkitCards) {
    console.log(`[🧠 AI Check] Validating all platforms in a single API call...`);
    
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" }); 
    
    const prompt = `
    I searched an e-commerce site for: "${query}".
    Below is a JSON object containing up to 5 candidate products scraped from Amazon, Flipkart, and Blinkit.
    
    Your task: For each platform, find the index of the best product that is the EXACT base product I searched for.
    
    UNIVERSAL RULES:
    1. IDENTIFY THE CORE ENTITY: Determine exactly what type of product the user is looking for.
    2. CONTEXTUAL REJECTION: Reject any product that is an accessory, replacement part, or add-on for the core entity UNLESS explicitly searched for.
    3. THIRD-PARTY TRAPS: Reject items that use phrases like "for [Brand]" or "compatible with [Brand]".
    4. STRICT VARIANT MATCHING: Do not select premium bundles, multi-packs, or upgraded versions UNLESS explicitly requested.
    5. SPECIFICATION TOLERANCE: Do not reject products just because their title includes standard specifications.
    6. PRICE PRIORITY: If multiple valid exact matches remain, pick the one with the lowest price.
    
    Data:
    {
        "amazon": ${JSON.stringify(amazonCards?.map((c, i) => ({ index: i, title: c.title, price: c.price })) || [])},
        "flipkart": ${JSON.stringify(flipkartCards?.map((c, i) => ({ index: i, title: c.title, price: c.price })) || [])},
        "blinkit": ${JSON.stringify(blinkitCards?.map((c, i) => ({ index: i, title: c.title, price: c.price })) || [])}
    }
    
    Return ONLY a raw JSON object matching this exact format:
    {
        "amazon": { "index": 0, "reason": "Brief reason for selection or rejection" },
        "flipkart": { "index": 2, "reason": "Brief reason..." },
        "blinkit": { "index": -1, "reason": "All items were incompatible" }
    }
    `;

    try {
        const result = await model.generateContent(prompt);
        let responseText = result.response.text().trim();
        
        responseText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(responseText);

        const getWinner = (cards, platformData, platformName) => {
            const index = platformData ? platformData.index : -1;
            const reason = platformData ? platformData.reason : "No reasoning provided";
            
            console.log(`[🤔 AI Thought - ${platformName}] ${reason}`);
            
            if (index >= 0 && cards && index < cards.length) {
                console.log(`[✅ AI Approved] ${platformName}: "${cards[index].title}"`);
                return cards[index];
            }
            console.log(`[❌ AI Rejected] ${platformName} (No valid matches found)`);
            return null;
        };

        return {
            amazonData: getWinner(amazonCards, parsed.amazon, 'Amazon'),
            flipkartData: getWinner(flipkartCards, parsed.flipkart, 'Flipkart'),
            blinkitData: getWinner(blinkitCards, parsed.blinkit, 'Blinkit')
        };

    } catch (error) {
        if (error.message.includes('429')) console.log(`[⚠️ Rate Limit] Gemini quota exceeded. Try again in 60s.`);
        else console.error(`[⚠️ AI Error] JSON parsing or generation failed:`, error.message);
        
        console.log(`[🔄] Falling back to #1 relevance rankings...`);
        return {
            amazonData: amazonCards && amazonCards.length > 0 ? amazonCards[0] : null,
            flipkartData: flipkartCards && flipkartCards.length > 0 ? flipkartCards[0] : null,
            blinkitData: blinkitCards && blinkitCards.length > 0 ? blinkitCards[0] : null
        };
    }
}

app.get('/health', (req, res) => {
  res.status(200).send('Server is alive and kicking!');
});

app.post('/api/compare', async (req, res) => {
    const { searchQuery, pincode } = req.body;
    if (!searchQuery) return res.status(400).json({ error: 'Please provide a search query.' });

    console.log(`\n[🤖 Engine] Starting sequential AI intelligence gather for: "${searchQuery}"`);
    let browser;

    try {
        browser = await chromium.launch({ 
            headless: true, 
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled'
            ]
        }); 
        
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            viewport: { width: 1280, height: 720 },
            extraHTTPHeaders: { 'Accept-Language': 'en-IN,en-US;q=0.9,en;q=0.8' } // Helps bypass some basic geo/bot blocks
        });

        // 🛒 AMAZON SCRAPER (HARDENED)
        const scrapeAmazon = async () => {
            const page = await context.newPage();
            try {
                await page.goto(`https://www.amazon.in/s?k=${encodeURIComponent(searchQuery)}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
                await page.waitForTimeout(2000);
                
                // Anti-Bot X-Ray for Amazon
                const pageTitle = await page.title();
                if (pageTitle.toLowerCase().includes('bot') || pageTitle.toLowerCase().includes('captcha')) {
                    console.log(`[🚨 Amazon] CAPTCHA hit! Amazon blocked the headless browser.`);
                    return null;
                }

                await page.evaluate(() => window.scrollBy(0, 1500));
                await page.waitForTimeout(1000);

                return await page.evaluate((query) => {
                    const items = document.querySelectorAll('[data-component-type="s-search-result"]');
                    if (items.length === 0) return null;
                    const queryWords = query.toLowerCase().trim().split(/\s+/);
                    const firstWord = queryWords[0]; 
                    const modelWords = queryWords.filter(w => /\d/.test(w)); 
                    let validProducts = [];
                    
                    for (let item of items) {
                        if (item.querySelector('.puis-sponsored-label-text, .s-sponsored-label-info, [data-component-type="sp-sponsored-result"]')) continue;
                        
                        const titleBlock = item.querySelector('[data-cy="title-recipe"]') || item.querySelector('h2');
                        if (!titleBlock) continue;
                        const titleText = titleBlock.innerText.replace(/\n/g, ' ').trim();
                        const cleanTitle = titleText.toLowerCase();
                        
                        if (!cleanTitle.includes(firstWord)) continue;
                        if (modelWords.length > 0) {
                            let hasModel = false;
                            for (let mw of modelWords) { if (cleanTitle.includes(mw)) { hasModel = true; break; } }
                            if (!hasModel) continue; 
                        }
                        if (item.textContent.toLowerCase().includes('currently unavailable')) continue;
                        
                        // 🔥 STABILITY TWEAK: Hardened Price Extraction
                        let priceValue = null;
                        const priceNode = item.querySelector('.a-price-whole');
                        if (priceNode) { 
                            priceValue = parseInt(priceNode.textContent.replace(/[^0-9]/g, ''), 10); 
                        } else {
                            // Fallback: Scan the entire item's text for a rupee format
                            const rawText = item.innerText || "";
                            const pm = rawText.match(/(?:₹|rs\.?|inr)\s*([0-9,]+)/i);
                            if (pm) priceValue = parseInt(pm[1].replace(/[^0-9]/g, ''), 10);
                        }

                        if (!priceValue || isNaN(priceValue)) continue;
                        
                        const linkNode = titleBlock.querySelector('a') || item.querySelector('a');
                        validProducts.push({
                            price: priceValue,
                            title: titleText,
                            link: linkNode ? (linkNode.getAttribute('href').startsWith('http') ? linkNode.getAttribute('href') : 'https://www.amazon.in' + linkNode.getAttribute('href')) : ''
                        });
                    }
                    return validProducts.length > 0 ? validProducts.slice(0, 5) : null;
                }, searchQuery);
            } catch (e) { 
                console.error(`[⚠️ Amazon Scraper Error] ${e.message}`); 
                return null; 
            } finally { 
                await page.close(); 
            }
        };

        // 🛍️ FLIPKART SCRAPER
        const scrapeFlipkart = async () => {
            const page = await context.newPage();
            try {
                await page.goto(`https://www.flipkart.com/search?q=${encodeURIComponent(searchQuery)}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
                await page.waitForTimeout(2000);
               return await page.evaluate((query) => {
                    const queryWords = query.toLowerCase().trim().split(/\s+/);
                    const firstWord = queryWords[0]; 
                    const modelWords = queryWords.filter(w => /\d/.test(w)); 
                    const rejectRegex = /\b(case|cover|protector|glass|tempered|skin|refurbished|renewed|cable|charger|adapter|strap|band|film|ring|guard)\b/i;
                    const items = document.querySelectorAll('div[data-id]');
                    let validProducts = [];
                    for (let item of items) {
                        if (item.innerText.toLowerCase().includes('ad\n') || item.innerText.toLowerCase().includes('sponsored')) continue;
                        const rawText = item.innerText || "";
                        if (!rawText || rawText.toLowerCase().includes('out of stock')) continue;
                        const cleanTitle = rawText.toLowerCase();
                        if (!cleanTitle.includes(firstWord)) continue;
                        if (modelWords.length > 0) {
                            let hasModel = false;
                            for (let mw of modelWords) { if (cleanTitle.includes(mw)) { hasModel = true; break; } }
                            if (!hasModel) continue; 
                        }
                        if (rejectRegex.test(cleanTitle)) continue;
                        let priceValue = null;
                        const priceLines = rawText.split('\n').filter(l => /(?:₹|rs\.?|inr)/i.test(l));
                        for (let line of priceLines) {
                            const pm = line.split('%')[0].match(/(?:₹|rs\.?|inr)\s*([0-9,]+)/i);
                            if (pm) { priceValue = parseInt(pm[1].replace(/[^0-9]/g, ''), 10); break; }
                        }
                        if (priceValue) {
                            const img = item.querySelector('img'); 
                            const anchor = item.tagName.toLowerCase() === 'a' ? item : (item.querySelector('a') || item.closest('a')); 
                            let finalLink = anchor && anchor.getAttribute('href') ? (anchor.getAttribute('href').startsWith('http') ? anchor.getAttribute('href') : 'https://www.flipkart.com' + anchor.getAttribute('href')) : window.location.href;
                            validProducts.push({
                                price: priceValue,
                                title: img && img.getAttribute('alt') ? img.getAttribute('alt') : cleanTitle.split('\n')[0].trim(),
                                link: finalLink
                            });
                        }
                    }
                    return validProducts.length > 0 ? validProducts.slice(0, 8) : null;
                }, searchQuery);
            } catch (e) { console.error(`[⚠️ Flipkart Scraper Error] ${e.message}`); return null; }
            finally { await page.close(); }
        };

        // 🥦 BLINKIT SCRAPER (TEMPORARILY DISABLED)
        const scrapeBlinkit = async () => {
            console.log(`[🥦] Skipping Blinkit (Temporarily disabled for stability)`);
            return null; // Instantly returns nothing to skip this step
        };

        // --- SEQUENTIAL EXECUTION ---
        console.log(`[🛒] Scraping Amazon...`);
        const rawAmazon = await scrapeAmazon();
        
        console.log(`[🛍️] Scraping Flipkart...`);
        const rawFlipkart = await scrapeFlipkart();
        
        const rawBlinkit = await scrapeBlinkit(); // Will instantly resolve to null

        console.log(`[🤖] Validating with AI...`);
        const { amazonData, flipkartData, blinkitData } = await validateAllWithAI(searchQuery, rawAmazon, rawFlipkart, rawBlinkit);

        const aPrice = amazonData ? amazonData.price : Infinity;
        const fPrice = flipkartData ? flipkartData.price : Infinity;
        const bPrice = blinkitData ? blinkitData.price : Infinity;
        
        if (aPrice === Infinity && fPrice === Infinity && bPrice === Infinity) {
            return res.status(404).json({ error: 'No valid matches found across platforms.' });
        }

        const minPrice = Math.min(aPrice, fPrice, bPrice);
        let winner = 'Draw';
        if (minPrice === aPrice) winner = 'Amazon';
        else if (minPrice === fPrice) winner = 'Flipkart';
        else if (minPrice === bPrice) winner = 'Blinkit';

        res.json({
            productName: searchQuery,
            amazon: amazonData || { price: 0, link: '#', title: 'Not found' },
            flipkart: flipkartData || { price: 0, link: '#', title: 'Not found' },
            blinkit: blinkitData || { price: 0, link: '#', title: 'Not found' }, 
            recommendation: winner
        });

    } catch (error) {
        console.error("[❌ Engine Crash]", error);
        res.status(500).json({ error: 'Internal engine failure.' });
    } finally {
        if (browser) {
            console.log(`[🧹] Closing browser...`);
            await browser.close(); 
        }
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 IntelliPrice AI Core Engine running on port ${PORT}`);
});
                   
