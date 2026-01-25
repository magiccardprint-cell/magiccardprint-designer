const { Client, Environment } = require('square');

// Initialize Square client
const client = new Client({
    accessToken: process.env.SQUARE_ACCESS_TOKEN,
    environment: process.env.SQUARE_ENVIRONMENT === 'production' 
        ? Environment.Production 
        : Environment.Sandbox
});

module.exports = async (req, res) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { 
            referenceId, 
            customerName, 
            customerEmail, 
            quantity, 
            unitPrice, 
            itemName,
            specifications,
            redirectUrl 
        } = req.body;

        if (!referenceId || !quantity || !unitPrice) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Get location ID (fetch from Square if not set in env)
        let locationId = process.env.SQUARE_LOCATION_ID;
        
        if (!locationId) {
            const locationsResponse = await client.locationsApi.listLocations();
            if (locationsResponse.result && locationsResponse.result.locations && locationsResponse.result.locations.length > 0) {
                locationId = locationsResponse.result.locations[0].id;
            } else {
                throw new Error('No Square location found');
            }
        }

        // Convert price to cents (Square uses smallest currency unit)
        const priceInCents = Math.round(unitPrice * 100);
        const totalAmount = priceInCents * quantity;

        // Create checkout using Square Checkout API
        const response = await client.checkoutApi.createPaymentLink({
            idempotencyKey: `${referenceId}-${Date.now()}`,
            quickPay: {
                name: itemName || 'Custom ID Badge',
                priceMoney: {
                    amount: BigInt(totalAmount),
                    currency: 'USD'
                },
                locationId: locationId
            },
            checkoutOptions: {
                redirectUrl: redirectUrl || 'https://magiccardprint-designer.vercel.app/thank-you.html',
                askForShippingAddress: true
            },
            prePopulatedData: {
                buyerEmail: customerEmail || undefined
            },
            paymentNote: `MagicCardPrint Order | Ref: ${referenceId} | Qty: ${quantity} | Customer: ${customerName || 'N/A'}`
        });

        if (response.result && response.result.paymentLink) {
            return res.status(200).json({
                success: true,
                checkoutUrl: response.result.paymentLink.url,
                orderId: response.result.paymentLink.orderId,
                referenceId: referenceId
            });
        } else {
            throw new Error('Failed to create payment link');
        }

    } catch (error) {
        console.error('Checkout error:', error);
        return res.status(500).json({ 
            error: 'Failed to create checkout',
            details: error.message 
        });
    }
};
