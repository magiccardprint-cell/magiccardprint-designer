const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
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
        const { frontImage, backImage, referenceId, customerName, customerEmail, specifications } = req.body;

        if (!frontImage || !referenceId) {
            return res.status(400).json({ error: 'Missing required fields: frontImage and referenceId' });
        }

        const uploadResults = [];

        // Upload front image
        const frontResult = await cloudinary.uploader.upload(frontImage, {
            folder: `magiccardprint/${referenceId}`,
            public_id: 'front',
            resource_type: 'image',
            tags: [referenceId, customerEmail || 'no-email']
        });
        uploadResults.push({ side: 'front', url: frontResult.secure_url });

        // Upload back image if provided
        if (backImage) {
            const backResult = await cloudinary.uploader.upload(backImage, {
                folder: `magiccardprint/${referenceId}`,
                public_id: 'back',
                resource_type: 'image',
                tags: [referenceId, customerEmail || 'no-email']
            });
            uploadResults.push({ side: 'back', url: backResult.secure_url });
        }

        // Upload specifications as a text file
        if (specifications) {
            const specText = JSON.stringify({
                referenceId,
                customerName,
                customerEmail,
                specifications,
                uploadedAt: new Date().toISOString()
            }, null, 2);

            const specBuffer = Buffer.from(specText).toString('base64');
            const specDataUri = `data:application/json;base64,${specBuffer}`;

            await cloudinary.uploader.upload(specDataUri, {
                folder: `magiccardprint/${referenceId}`,
                public_id: 'specifications',
                resource_type: 'raw',
                tags: [referenceId, customerEmail || 'no-email']
            });
        }

        return res.status(200).json({
            success: true,
            referenceId,
            images: uploadResults,
            message: 'Design uploaded successfully'
        });

    } catch (error) {
        console.error('Upload error:', error);
        return res.status(500).json({ 
            error: 'Failed to upload design',
            details: error.message 
        });
    }
};
