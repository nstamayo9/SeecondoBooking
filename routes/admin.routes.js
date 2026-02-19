const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const reportController = require('../controllers/report.controller');
const { ensureAuth, ensureStaff, ensureManager, ensureAdmin } = require('../middleware/auth.middleware');
const upload = require('../middleware/upload');

// 1. DASHBOARD & BOOKINGS (Accessible by Staff+)
router.get('/', ensureAuth, ensureStaff, adminController.getAdminDashboard);
router.post('/booking/update-status', ensureAuth, ensureStaff, adminController.updateBookingStatus);
router.post('/booking/update-details', ensureAuth, ensureStaff, upload.any(), adminController.updateBookingDetails);

// 2. REPORTS (Accessible by Manager+)
router.get('/report/download', ensureAuth, ensureManager, reportController.generateReport);

// 3. ROOM MANAGEMENT (Accessible by Manager+)
router.post('/room/create', ensureAuth, ensureManager, upload.array('images', 10), adminController.createRoom);
router.post('/room/update', ensureAuth, ensureManager, upload.array('images', 5), adminController.updateRoom);
router.get('/room/delete/:id', ensureAuth, ensureManager, adminController.deleteRoom);

// 4. PROMO MANAGEMENT (Accessible by Manager+)
router.post('/promo/create', ensureAuth, ensureManager, adminController.createPromotion);
router.post('/promo/update', ensureAuth, ensureManager, adminController.updatePromotion); 
router.get('/promo/delete/:id', ensureAuth, ensureManager, adminController.deletePromo);

// 5. USER MANAGEMENT (Accessible by Admin+)
router.post('/user/create', ensureAuth, ensureAdmin, adminController.createUser);
router.post('/user/update', ensureAuth, ensureAdmin, adminController.updateUser);
router.get('/user/delete/:id', ensureAuth, ensureAdmin, adminController.deleteUser);

// 6. SITE CONFIG (Accessible by Admin+)
router.post('/site-config/update', ensureAuth, ensureAdmin, upload.any(), adminController.updateSiteConfig);

// 7. RESORT AMENITIES
// Changed upload.any() to upload.array('images', 10) to allow up to 10 images
router.post('/amenity/create', ensureAuth, ensureManager, upload.array('images', 10), adminController.createResortAmenity);
router.get('/amenity/delete/:id', ensureAuth, ensureManager, adminController.deleteResortAmenity);

// 8. MAINTENANCE MANAGEMENT (Accessible by Staff+)
router.post('/maintenance/create', ensureAuth, ensureStaff, adminController.createMaintenance);
router.post('/maintenance/update', ensureAuth, ensureStaff, adminController.updateMaintenance);
router.get('/maintenance/delete/:id', ensureAuth, ensureStaff, adminController.deleteMaintenance);

// 9. REVIEW MANAGEMENT
router.get('/review/approve/:id', ensureAuth, ensureStaff, adminController.approveReview);
router.get('/review/reject/:id', ensureAuth, ensureStaff, adminController.rejectReview);

router.get('/analytics', ensureAuth, ensureManager, adminController.getAnalyticsDashboard);

module.exports = router;