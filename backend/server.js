require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { chromium } = require('playwright');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 🧠 AI SEMANTIC VALIDATOR (CONSOLIDATED + CHAIN OF THOUGHT)
async function validateAllWithAI(query, amazonCards, flipkartCards, blinkitCards) {
    console.log(`[🧠 AI Check] Validating all platforms in a single API call...`);
    
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    
    const prompt = `
    I searched an e-commerce site for: "${query}".
    Below is a JSON object containing up to 5 candidate products scraped from Amazon, Flipkart, and Blinkit.
    
    Your task: For each platform, find the index of the best product that is the EXACT base product I searched for.
    
    UNIVERSAL RULES:
    1. IDENTIFY THE CORE ENTITY: Determine exactly what type of product the user is looking for (e.g., a laptop, a shoe, a book, a grocery item, an accessory).
    2. CONTEXTUAL REJECTION: Reject any product that is an accessory, replacement part, or add-on for the core entity UNLESS the user explicitly searched for an accessory. (e.g., If the search is "MacBook Air", reject laptop sleeves. But if the search is "MacBook Air Sleeve", accept the sleeve).
    3. THIRD-PARTY TRAPS: Reject items that use phrases like "for [Brand]" or "compatible with [Brand]". The item must be the actual brand/product requested.
    4. STRICT VARIANT MATCHING: Do not select premium bundles, multi-packs, or upgraded versions (e.g., Pro, Max, Deluxe) UNLESS explicitly requested in the search.
    5. SPECIFICATION TOLERANCE: Do not reject products just because their title includes standard category specifications (e.g., "5G", "Hardcover", "1kg", "100% Cotton", "Bluetooth").
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
        if (error.message.includes('429')) console.log(`[⚠️ Rate Limit] Gemini quota exceeded.`);
        else console.error(`[⚠️ AI Error] JSON parsing or generation failed:`, error.message);
        
        console.log(`[🔄] Falling back to #1 relevance rankings...`);
        return {
            amazonData: amazonCards && amazonCards.length > 0 ? amazonCards[0] : null,
            flipkartData: flipkartCards && flipkartCards.length > 0 ? flipkartCards[0] : null,
            blinkitData: blinkitCards && blinkitCards.length > 0 ? blinkitCards[0] : null
        };
    }
}

app.post('/api/compare', async (req, res) => {
    const { searchQuery, pincode } = req.body;
    if (!searchQuery) return res.status(400).json({ error: 'Please provide a search query.' });

    console.log(`\n[🤖 Engine] Starting sequential AI intelligence gather for: "${searchQuery}" (Pincode: ${pincode || 'None'})`);
    let browser;

    try {
        // 🚀 SERVER-OPTIMIZED LAUNCH
        browser = await chromium.launch({ 
            headless: true, 
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage', // 🧠 The REAL hero for free-tier servers
                '--disable-blink-features=AutomationControlled'
                // ❌ REMOVED: '--single-process' (Too unstable for heavy React sites)
            ]
        }); 
        
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            viewport: { width: 1280, height: 720 }
        });

        // --------------------------------------------------------
        // 🛒 AMAZON SCRAPER 
        // --------------------------------------------------------
        const scrapeAmazon = async () => {
            const page = await context.newPage();
            try {
                await page.goto(`https://www.amazon.in/s?k=${encodeURIComponent(searchQuery)}`, { waitUntil: 'domcontentloaded', timeout: 10000 });
                await page.waitForTimeout(2000);
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
                            for (let mw of modelWords) {
                                if (cleanTitle.includes(mw)) { hasModel = true; break; }
                            }
                            if (!hasModel) continue; 
                        }

                        if (item.textContent.toLowerCase().includes('currently unavailable')) continue;

                        let priceValue = null;
                        const priceNode = item.querySelector('.a-price-whole') || item.querySelector('.a-price .a-offscreen');
                        if (priceNode) {
                            priceValue = parseInt(priceNode.textContent.replace(/[^0-9]/g, ''), 10);
                        } else {
                            const priceLines = item.textContent.split('\n').filter(l => /(?:₹|rs\.?|inr)/i.test(l));
                            for (let line of priceLines) {
                                const pm = line.split('%')[0].match(/(?:₹|rs\.?|inr)\s*([0-9,]+)/i);
                                if (pm) { priceValue = parseInt(pm[1].replace(/[^0-9]/g, ''), 10); break; }
                            }
                        }

                        if (!priceValue || isNaN(priceValue)) continue;
                        const linkNode = titleBlock.querySelector('a') || item.querySelector('a');
                        
                        validProducts.push({
                            price: priceValue,
                            title: titleText,
                            link: linkNode ? (linkNode.getAttribute('href').startsWith('http') ? linkNode.getAttribute('href') : 'https://www.amazon.in' + linkNode.getAttribute('href')) : ''
                        });
                    }
                    
                    if (validProducts.length > 0) return validProducts.slice(0, 5); 
                    return null;
                }, searchQuery);
            } catch (e) {
                console.error(`[⚠️ Amazon Scraper Error] ${e.message}`);
                return null;
            } finally {
                await page.close(); // 🧹 FREE UP RAM!
            }
        };

        // --------------------------------------------------------
        // 🛍️ FLIPKART SCRAPER
        // --------------------------------------------------------
        const scrapeFlipkart = async () => {
            const page = await context.newPage();
            try {
                await page.goto(`https://www.flipkart.com/search?q=${encodeURIComponent(searchQuery)}`, { waitUntil: 'domcontentloaded', timeout: 10000 });
                await page.waitForTimeout(2000);

               return await page.evaluate((query) => {
                    const queryWords = query.toLowerCase().trim().split(/\s+/);
                    const firstWord = queryWords[0]; 
                    const modelWords = queryWords.filter(w => /\d/.test(w)); 
                    const rejectRegex = /\b(case|cover|protector|glass|tempered|skin|refurbished|renewed|cable|charger|adapter|strap|band|film|ring|guard)\b/i;
                    
                    const items = document.querySelectorAll('div[data-id]');
                    let validProducts = [];

                    for (let item of items) {
                        let isSponsored = false;
                        if (item.innerText.toLowerCase().includes('ad\n') || item.innerText.toLowerCase().includes('sponsored')) {
                            isSponsored = true;
                        }
                        if (isSponsored) continue;

                        const rawText = item.innerText || "";
                        if (!rawText || rawText.toLowerCase().includes('out of stock')) continue;
                        const cleanTitle = rawText.toLowerCase();
                        
                        if (!cleanTitle.includes(firstWord)) continue;
                        
                        if (modelWords.length > 0) {
                            let hasModel = false;
                            for (let mw of modelWords) {
                                if (cleanTitle.includes(mw)) { hasModel = true; break; }
                            }
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
                            
                            let finalLink = window.location.href; 
                            const anchor = item.tagName.toLowerCase() === 'a' ? item : (item.querySelector('a') || item.closest('a')); 
                            
                            if (anchor && anchor.getAttribute('href')) {
                                let extractedHref = anchor.getAttribute('href');
                                finalLink = extractedHref.startsWith('http') ? extractedHref : 'https://www.flipkart.com' + extractedHref;
                            }

                            validProducts.push({
                                price: priceValue,
                                title: img && img.getAttribute('alt') ? img.getAttribute('alt') : cleanTitle.split('\n')[0].trim(),
                                link: finalLink
                            });
                        }
                    }

                    if (validProducts.length > 0) return validProducts.slice(0, 8); 
                    return null;
                }, searchQuery);
            } catch (e) {
                console.error(`[⚠️ Flipkart Scraper Error] ${e.message}`);
                return null;
            } finally {
                await page.close(); // 🧹 FREE UP RAM!
            }
        };

        // --------------------------------------------------------
        // 🥦 BLINKIT SCRAPER
        // --------------------------------------------------------
        const scrapeBlinkit = async () => {
            const page = await context.newPage();
            
            page.on('console', msg => {
                if(msg.text().includes('[DEBUG]')) {
                    console.log(`🥦 Blinkit Log: ${msg.text()}`);
                }
            });

            try {
                const testPincode = pincode || "110001"; 
                await page.goto('https://blinkit.com/', { waitUntil: 'domcontentloaded', timeout: 15000 });
                
                const inputSelector = 'input[placeholder*="location" i], input[placeholder*="city" i], .SearchBarContainer input';
                try { await page.waitForSelector(inputSelector, { state: 'visible', timeout: 8000 }); } 
                catch (e) { await page.click('header [class*="location"], header button').catch(()=> {}); await page.waitForSelector(inputSelector, { state: 'visible', timeout: 5000 }); }

                await page.fill(inputSelector, ''); 
                await page.type(inputSelector, testPincode, { delay: 100 }); 
                await page.waitForTimeout(2000); 
                
                try {
                    const firstSuggestion = page.locator('div[class*="LocationSearchList"] > div, .LocationSearchListContainer > div').first();
                    await firstSuggestion.waitFor({ state: 'visible', timeout: 5000 });
                    await firstSuggestion.click();
                } catch (e) {
                    await page.keyboard.press('ArrowDown'); await page.waitForTimeout(500); await page.keyboard.press('Enter');
                }

                await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
                await page.waitForTimeout(2500); 
                await page.goto(`https://blinkit.com/s/?q=${encodeURIComponent(searchQuery)}`, { waitUntil: 'domcontentloaded' });
                await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
                
                await page.waitForSelector('img', { state: 'visible', timeout: 4000 }).catch(() => {});
                await page.waitForTimeout(1500); 

                return await page.evaluate((query) => {
                    console.log(`[DEBUG] Starting DOM evaluation for query: "${query}"`);
                    
                    const queryWords = query.toLowerCase().trim().split(/\s+/);
                    const firstWord = queryWords[0]; 
                    const modelWords = queryWords.filter(w => /\d/.test(w)); 

                    const addNodes = Array.from(document.querySelectorAll('div, button, a')).filter(el => {
                        return el.textContent && el.textContent.trim().toUpperCase() === 'ADD';
                    });
                    
                    console.log(`[DEBUG] Found ${addNodes.length} 'ADD' buttons on the page.`);

                    let validProducts = [];

                    for (let [index, node] of addNodes.entries()) {
                        let card = node.parentElement;
                        let found = false;
                        
                        for (let i = 0; i < 10; i++) {
                            const hasPrice = card && card.innerText && card.innerText.includes('₹');
                            const hasLinkOrImage = card && (card.querySelector('a') || card.tagName.toLowerCase() === 'a' || card.querySelector('img'));
                            
                            if (hasPrice && hasLinkOrImage) {
                                found = true;
                                break;
                            }
                            if (card) card = card.parentElement;
                        }

                        if (!found) continue;

                        const rawText = card.innerText || "";
                        const cleanTitle = rawText.toLowerCase();

                        if (cleanTitle.includes('out of stock') || cleanTitle.includes('sponsored')) continue;

                        if (!cleanTitle.includes(firstWord)) {
                            console.log(`[DEBUG] Item ${index}: Rejected (Missing '${firstWord}') -> Text seen: ${cleanTitle.replace(/\n/g, ' ').substring(0, 50)}...`);
                            continue;
                        }

                        if (modelWords.length > 0) {
                            let hasModel = false;
                            for (let mw of modelWords) {
                                if (cleanTitle.includes(mw)) { hasModel = true; break; }
                            }
                            if (!hasModel) continue; 
                        }

                        let priceValue = null;
                        const priceLines = rawText.split('\n').filter(l => /(?:₹|rs\.?|inr)/i.test(l));
                        for (let line of priceLines) {
                            const pm = line.split('%')[0].match(/(?:₹|rs\.?|inr)\s*([0-9,]+)/i);
                            if (pm) { priceValue = parseInt(pm[1].replace(/[^0-9]/g, ''), 10); break; }
                        }

                        if (!priceValue) continue;

                        const img = card.querySelector('img');
                        let title = img && img.getAttribute('alt') ? img.getAttribute('alt') : cleanTitle.split('₹')[0].replace(/\n/g, ' ').trim();
                        
                        let finalLink = window.location.href; 
                        const anchor = card.querySelector('a') || card.closest('a'); 
                        if (anchor && anchor.getAttribute('href')) {
                            let extractedHref = anchor.getAttribute('href');
                            finalLink = extractedHref.startsWith('http') ? extractedHref : 'https://blinkit.com' + extractedHref;
                        }

                        console.log(`[DEBUG] Item ${index}: SUCCESS -> ${title} | ₹${priceValue}`);

                        validProducts.push({
                            price: priceValue,
                            title: title,
                            link: finalLink
                        });
                    }

                    const uniqueProducts = Array.from(new Map(validProducts.map(item => [item.title, item])).values());
                    return uniqueProducts.length > 0 ? uniqueProducts.slice(0, 5) : null;
                }, searchQuery);

            } catch (e) {
                console.error(`[⚠️ Blinkit Scraper Error] ${e.message}`);
                return null;
            } finally {
                await page.close(); // 🧹 FREE UP RAM!
            }
        };

        // --- SEQUENTIAL EXECUTION & AI VALIDATION ---
        console.log(`[⚡] Executing scrapers sequentially to save RAM...`);
        
        console.log(`[🛒] Scraping Amazon...`);
        const rawAmazon = await scrapeAmazon() || null;
        
        console.log(`[🛍️] Scraping Flipkart...`);
        const rawFlipkart = await scrapeFlipkart() || null;
        
        console.log(`[🥦] Scraping Blinkit...`);
        const rawBlinkit = await scrapeBlinkit() || null;

        console.log(`[🤖] Passing all candidates to AI for consolidated validation...`);
        const { amazonData, flipkartData, blinkitData } = await validateAllWithAI(searchQuery, rawAmazon, rawFlipkart, rawBlinkit);

        // --- COMPARATIVE LOGIC ---
        const aPrice = amazonData ? amazonData.price : Infinity;
        const fPrice = flipkartData ? flipkartData.price : Infinity;
        const bPrice = blinkitData ? blinkitData.price : Infinity;
        
        if (aPrice === Infinity && fPrice === Infinity && bPrice === Infinity) {
            return res.status(404).json({ error: 'Data scramble detected or item out of stock/invalid across all platforms.' });
        }

        const minPrice = Math.min(aPrice, fPrice, bPrice);
        
        let winner = 'Draw';
        if (minPrice === aPrice) winner = 'Amazon';
        else if (minPrice === fPrice) winner = 'Flipkart';
        else if (minPrice === bPrice) winner = 'Blinkit';

        res.json({
            productName: searchQuery,
            amazon: amazonData || { price: 0, link: '#', title: 'Not found or rejected by AI' },
            flipkart: flipkartData || { price: 0, link: '#', title: 'Not found or rejected by AI' },
            blinkit: blinkitData || { price: 0, link: '#', title: 'Not found or rejected by AI' }, 
            recommendation: winner
        });

    } catch (error) {
        console.error("[❌ Engine Crash]", error);
        res.status(500).json({ error: 'Failed to gather comparative data.' });
    } finally {
        if (browser) {
            console.log(`[🧹] Closing browser to free up instance memory...`);
            await browser.close(); // 🧹 Nuke the instance entirely between searches
        }
    }
});

app.listen(PORT, () => console.log(`🚀 IntelliPrice AI Core Engine running on http://localhost:${PORT}`));