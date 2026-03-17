// notifier.js
require('dotenv').config();
const twilio = require('twilio');

// Load credentials from a .env file
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioWhatsAppNumber = process.env.TWILIO_WHATSAPP_NUMBER; // e.g., 'whatsapp:+14155238886'

const client = twilio(accountSid, authToken);

async function sendWhatsAppAlert(userNumber, productName, productUrl, currentPrice, targetPrice) {
    // Format the number for Twilio (must include 'whatsapp:' prefix)
    const formattedToNumber = `whatsapp:${userNumber}`;
    
    // Construct the message body
    const messageBody = `🚨 *Price Drop Alert!*\n\n${productName} has dropped to ₹${currentPrice}!\n\nYour target was ₹${targetPrice}.\n\nGrab it here before it goes out of stock: ${productUrl}`;

    try {
        const message = await client.messages.create({
            body: messageBody,
            from: twilioWhatsAppNumber,
            to: formattedToNumber
        });

        console.log(`✅ WhatsApp alert sent successfully to ${userNumber}. Message SID: ${message.sid}`);
        return true;
    } catch (error) {
        console.error(`❌ Failed to send WhatsApp message to ${userNumber}:`, error.message);
        return false;
    }
}

module.exports = { sendWhatsAppAlert };