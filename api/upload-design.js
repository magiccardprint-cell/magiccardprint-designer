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
        const { 
            frontImage, 
            backImage, 
            referenceId, 
            customerName, 
            customerEmail, 
            specifications,
            // Bulk order data
            isBulkOrder,
            excelData,
            excelFile,
            excelFileName,
            bulkPhotos,
            // Artwork files
            artworkFiles,
            hasArtwork
        } = req.body;

        if (!frontImage || !referenceId) {
            return res.status(400).json({ error: 'Missing required fields: frontImage and referenceId' });
        }

        const uploadResults = [];
        const folder = `magiccardprint/${referenceId}`;

        // Upload front image
        const frontResult = await cloudinary.uploader.upload(frontImage, {
            folder: folder,
            public_id: 'front',
            resource_type: 'image',
            tags: [referenceId, customerEmail || 'no-email', isBulkOrder ? 'bulk-order' : 'single-order']
        });
        uploadResults.push({ side: 'front', url: frontResult.secure_url });

        // Upload back image if provided
        if (backImage) {
            const backResult = await cloudinary.uploader.upload(backImage, {
                folder: folder,
                public_id: 'back',
                resource_type: 'image',
                tags: [referenceId, customerEmail || 'no-email']
            });
            uploadResults.push({ side: 'back', url: backResult.secure_url });
        }

        // Upload Excel file if bulk order
        if (isBulkOrder && excelFile) {
            try {
                const excelResult = await cloudinary.uploader.upload(excelFile, {
                    folder: folder,
                    public_id: `bulk-data_${excelFileName || 'data'}`,
                    resource_type: 'raw',
                    tags: [referenceId, 'excel', 'bulk-order']
                });
                uploadResults.push({ type: 'excel', url: excelResult.secure_url });
            } catch (excelError) {
                console.error('Excel upload error:', excelError);
                // Continue even if Excel upload fails
            }
        }

        // Upload bulk photos if provided
        if (isBulkOrder && bulkPhotos && bulkPhotos.length > 0) {
            const photosFolder = `${folder}/photos`;
            for (const photo of bulkPhotos) {
                try {
                    // Remove extension from name for public_id
                    const photoName = photo.name.replace(/\.[^/.]+$/, '');
                    const photoResult = await cloudinary.uploader.upload(photo.data, {
                        folder: photosFolder,
                        public_id: photoName,
                        resource_type: 'image',
                        tags: [referenceId, 'bulk-photo']
                    });
                    uploadResults.push({ type: 'photo', name: photo.name, url: photoResult.secure_url });
                } catch (photoError) {
                    console.error(`Photo upload error for ${photo.name}:`, photoError);
                    // Continue with other photos
                }
            }
        }

        // Upload artwork files if provided
        if (hasArtwork && artworkFiles && artworkFiles.length > 0) {
            const artworkFolder = `${folder}/artwork`;
            for (const artwork of artworkFiles) {
                try {
                    // Remove extension from name for public_id
                    const artworkName = artwork.name.replace(/\.[^/.]+$/, '');
                    const artworkResult = await cloudinary.uploader.upload(artwork.data, {
                        folder: artworkFolder,
                        public_id: artworkName,
                        resource_type: 'image',
                        tags: [referenceId, 'artwork']
                    });
                    uploadResults.push({ type: 'artwork', name: artwork.name, url: artworkResult.secure_url });
                } catch (artworkError) {
                    console.error(`Artwork upload error for ${artwork.name}:`, artworkError);
                    // Continue with other artwork files
                }
            }
        }

        // Upload specifications as a JSON file
        const specContent = {
            referenceId,
            customerName,
            customerEmail,
            specifications,
            isBulkOrder,
            bulkRecordCount: excelData ? excelData.length : 0,
            excelFileName: excelFileName || null,
            bulkPhotosCount: bulkPhotos ? bulkPhotos.length : 0,
            hasArtwork: hasArtwork || false,
            artworkFilesCount: artworkFiles ? artworkFiles.length : 0,
            uploadedAt: new Date().toISOString(),
            uploadedFiles: uploadResults
        };

        const specBuffer = Buffer.from(JSON.stringify(specContent, null, 2)).toString('base64');
        const specDataUri = `data:application/json;base64,${specBuffer}`;

        await cloudinary.uploader.upload(specDataUri, {
            folder: folder,
            public_id: 'specifications',
            resource_type: 'raw',
            tags: [referenceId, customerEmail || 'no-email']
        });

        // Send email notification
        try {
            await sendEmailNotification({
                referenceId,
                customerName,
                customerEmail,
                specifications,
                isBulkOrder,
                excelData,
                excelFileName,
                bulkPhotosCount: bulkPhotos ? bulkPhotos.length : 0,
                hasArtwork: hasArtwork || false,
                artworkFilesCount: artworkFiles ? artworkFiles.length : 0,
                uploadResults
            });
        } catch (emailError) {
            console.error('Email notification error:', emailError);
            // Continue even if email fails - Cloudinary has the data
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

// Email notification function
async function sendEmailNotification(data) {
    const {
        referenceId,
        customerName,
        customerEmail,
        specifications,
        isBulkOrder,
        excelData,
        excelFileName,
        bulkPhotosCount,
        hasArtwork,
        artworkFilesCount,
        uploadResults
    } = data;

    // Build email content
    const emailSubject = `New Order: ${referenceId} - ${customerName}`;
    
    let emailBody = `
NEW MAGICCARDPRINT ORDER
========================

Reference ID: ${referenceId}
Customer Name: ${customerName}
Customer Email: ${customerEmail}
Order Type: ${specifications.orderType || 'Single Badge'}
Date: ${new Date().toLocaleString()}

BADGE SPECIFICATIONS
--------------------
Badge Style: ${specifications.badgeStyle}
Card Type: ${specifications.cardType}
Orientation: ${specifications.orientation}
Hole/Slot: ${specifications.holeSlot}
Proof Approval: ${specifications.proofApproval ? 'YES - Send proof before printing' : 'No'}
Delivery Date: ${specifications.deliveryDate}
Additional Instructions: ${specifications.additionalInstructions}
`;

    if (isBulkOrder) {
        emailBody += `
BULK ORDER DETAILS
------------------
Total Badges: ${excelData ? excelData.length : 'N/A'}
Excel File: ${excelFileName || 'Uploaded'}
Photos Uploaded: ${bulkPhotosCount}
`;
    }

    if (hasArtwork) {
        emailBody += `
COMPLETE ARTWORK
----------------
Artwork Files Uploaded: ${artworkFilesCount}
Note: Customer has uploaded complete artwork design files.
`;
    }

    emailBody += `
CLOUDINARY FILES
----------------
`;
    uploadResults.forEach(file => {
        if (file.side) {
            emailBody += `${file.side.toUpperCase()} Design: ${file.url}\n`;
        } else if (file.type === 'excel') {
            emailBody += `Excel Data: ${file.url}\n`;
        } else if (file.type === 'photo') {
            emailBody += `Photo (${file.name}): ${file.url}\n`;
        } else if (file.type === 'artwork') {
            emailBody += `Artwork (${file.name}): ${file.url}\n`;
        }
    });

    emailBody += `
------------------------
View all files in Cloudinary:
Folder: magiccardprint/${referenceId}

MagicCardPrint Badge Designer
`;

    // Try to send via Resend API if configured
    if (process.env.RESEND_API_KEY) {
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: 'MagicCardPrint <orders@resend.dev>',
                to: ['magiccardprint@gmail.com'],
                subject: emailSubject,
                text: emailBody
            })
        });

        if (!response.ok) {
            throw new Error('Failed to send email via Resend');
        }
        
        console.log('Email sent successfully via Resend');
    } else {
        // Log email content if no email service configured
        console.log('=== EMAIL NOTIFICATION (No email service configured) ===');
        console.log('To: magiccardprint@gmail.com');
        console.log('Subject:', emailSubject);
        console.log('Body:', emailBody);
        console.log('========================================================');
    }
}
