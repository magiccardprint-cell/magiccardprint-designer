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

    try {
        // Get list of category folders under 'templates'
        const foldersResult = await cloudinary.api.sub_folders('templates');
        const categories = foldersResult.folders;

        const templates = [];

        // For each category folder, get the images
        for (const category of categories) {
            const categoryName = category.name;
            const categoryPath = category.path;

            // Get all images in this category folder
            const resourcesResult = await cloudinary.search
                .expression(`folder:${categoryPath}`)
                .sort_by('public_id', 'asc')
                .max_results(100)
                .execute();

            // Group images by design number (design1, design2, etc.)
            const designs = {};
            
            for (const resource of resourcesResult.resources) {
                // Extract design name from public_id
                // e.g., "templates/conference-badge/design1-front" -> "design1"
                const filename = resource.public_id.split('/').pop();
                const match = filename.match(/^(design\d+)-(.+)$/);
                
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
                }
            });
        }

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
