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
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Check if credentials are configured
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
        console.error('Cloudinary credentials not configured');
        return res.status(500).json({ 
            error: 'Cloudinary credentials not configured',
            details: 'Please add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET to Vercel environment variables'
        });
    }

    try {
        console.log('Fetching templates from Cloudinary...');
        console.log('Cloud name:', process.env.CLOUDINARY_CLOUD_NAME);
        
        // Get list of category folders under 'templates'
        let foldersResult;
        try {
            foldersResult = await cloudinary.api.sub_folders('templates');
            console.log('Found folders:', JSON.stringify(foldersResult.folders));
        } catch (folderError) {
            console.error('Error getting folders:', folderError.message);
            // If no templates folder exists, return empty
            return res.status(200).json({
                success: true,
                templates: [],
                categories: [],
                message: 'No templates folder found in Cloudinary'
            });
        }
        
        const categories = foldersResult.folders || [];

        if (categories.length === 0) {
            return res.status(200).json({
                success: true,
                templates: [],
                categories: [],
                message: 'No category folders found under templates/'
            });
        }

        const templates = [];

        // For each category folder, get the images
        for (const category of categories) {
            const categoryName = category.name;
            const categoryPath = category.path;
            
            console.log(`Searching in folder: ${categoryPath}`);

            // Get all images in this category folder using resources_by_asset_folder
            // This is more reliable than search for specific folders
            let resourcesResult;
            try {
                resourcesResult = await cloudinary.api.resources({
                    type: 'upload',
                    prefix: categoryPath + '/',
                    max_results: 100
                });
                console.log(`Found ${resourcesResult.resources.length} resources in ${categoryPath}`);
            } catch (searchError) {
                console.error(`Error searching ${categoryPath}:`, searchError.message);
                continue;
            }

            // Group images by design number (design1, design2, etc.)
            const designs = {};
            
            for (const resource of resourcesResult.resources) {
                // Extract design name from public_id
                // e.g., "templates/conference-badge/design1-front" -> "design1"
                const filename = resource.public_id.split('/').pop();
                const match = filename.match(/^(design\d+)-(.+)$/);
                
                console.log(`Processing: ${filename}, match: ${match ? 'yes' : 'no'}`);
                
                if (match) {
                    const designId = match[1];
                    const imageType = match[2]; // front, back, or preview
                    
                    if (!designs[designId]) {
                        designs[designId] = {
                            id: `${categoryName}-${designId}`,
                            category: categoryName,
                            categoryDisplay: formatCategoryName(categoryName),
                            name: `${formatCategoryName(categoryName)} ${designId.replace('design', 'Design ')}`,
                            front: null,
                            back: null,
                            preview: null
                        };
                    }
                    
                    // Store the secure URL for each image type
                    if (imageType === 'front') {
                        designs[designId].front = resource.secure_url;
                    } else if (imageType === 'back') {
                        designs[designId].back = resource.secure_url;
                    } else if (imageType === 'preview') {
                        designs[designId].preview = resource.secure_url;
                    }
                }
            }

            // Add all designs from this category to the templates array
            Object.values(designs).forEach(design => {
                // Only add if at least front or preview exists
                if (design.front || design.preview) {
                    templates.push(design);
                    console.log(`Added template: ${design.name}`);
                }
            });
        }

        console.log(`Total templates found: ${templates.length}`);

        return res.status(200).json({
            success: true,
            templates: templates,
            categories: categories.map(c => ({
                name: c.name,
                display: formatCategoryName(c.name)
            }))
        });

    } catch (error) {
        console.error('Error fetching templates:', error);
        return res.status(500).json({ 
            error: 'Failed to fetch templates',
            details: error.message 
        });
    }
};

// Format category name for display (e.g., "conference-badge" -> "Conference Badge")
function formatCategoryName(name) {
    return name
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}
