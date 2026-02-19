const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

console.log("✅ UPLOAD MIDDLEWARE LOADED: Limit set to 100MB"); // <--- Check for this in your terminal

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    timeout: 600000 // 10 Minutes
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'see-condo-uploads',
        allowed_formats: ['jpg', 'png', 'jpeg', 'webp'],
        transformation: [{ width: 1920, crop: "limit", quality: "auto" }] 
    },
});

module.exports = multer({ 
    storage: storage,
    limits: {
        fileSize: 100 * 1024 * 1024 // 100MB
    }
});