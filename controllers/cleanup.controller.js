const Booking = require('../models/Booking.model');
const cloudinary = require('cloudinary').v2;
const logger = require('../config/logger'); // Use your logger

// Configure Cloudinary (Ensure these are in your .env)
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Helper: Extract Public ID from URL
// Example URL: https://res.cloudinary.com/demo/image/upload/v1234/see-condo-uploads/abcde.jpg
// Result: see-condo-uploads/abcde
const getPublicIdFromUrl = (url) => {
    if (!url || !url.includes('cloudinary')) return null;
    try {
        const parts = url.split('/');
        const filename = parts.pop(); // abcde.jpg
        const folder = parts.pop();   // see-condo-uploads
        const id = filename.split('.')[0]; // abcde
        return `${folder}/${id}`;
    } catch (err) {
        return null;
    }
};

exports.deleteOldBookingImages = async () => {
    try {
        // 1. Find Bookings: Cancelled AND Updated more than 30 days ago
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);  //Change 30 * 24 * ... to 1000 (1 second ago).
        
        const oldBookings = await Booking.find({
            status: 'cancelled',
            updatedAt: { $lt: thirtyDaysAgo },
            // Only find ones that still have images
            $or: [
                { guestIdImage: { $ne: null } },
                { guestIdImage: { $ne: '' } }
            ]
        });

        if (oldBookings.length === 0) return;

        logger.info(`[Cleanup] Found ${oldBookings.length} old cancelled bookings to clean.`);

        for (const booking of oldBookings) {
            // A. Collect all Image IDs for this booking
            const imagesToDelete = [];

            // Primary Guest ID
            const primaryId = getPublicIdFromUrl(booking.guestIdImage);
            if (primaryId) imagesToDelete.push(primaryId);

            // Companion IDs
            if (booking.companions && booking.companions.length > 0) {
                booking.companions.forEach(comp => {
                    const compId = getPublicIdFromUrl(comp.idImage);
                    if (compId) imagesToDelete.push(compId);
                });
            }

            // B. Delete from Cloudinary
            if (imagesToDelete.length > 0) {
                for (const publicId of imagesToDelete) {
                    await cloudinary.uploader.destroy(publicId);
                }
            }

            // C. Remove URLs from Database (Data Privacy)
            booking.guestIdImage = '';
            booking.companions.forEach(c => c.idImage = '');
            await booking.save();
        }

        logger.info(`[Cleanup] Successfully cleaned images for ${oldBookings.length} bookings.`);

    } catch (error) {
        logger.error(`[Cleanup Error] ${error.message}`);
    }
};