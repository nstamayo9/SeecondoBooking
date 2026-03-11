const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const reportController = require('../controllers/report.controller');
const { ensureAuth, ensureStaff, ensureManager, ensureAdmin } = require('../middleware/auth.middleware');
const upload = require('../middleware/upload');

// ==========================================
// 1. CALENDAR & DASHBOARD (Must be at the top)
// ==========================================

// Main Dashboard
router.get('/', ensureAuth, ensureStaff, adminController.getAdminDashboard);

// Calendar API Routes (Moved up to prevent 404 shadowing)
// We add ensureStaff so only logged-in employees can see the booking data
router.get('/calendar-resources', ensureAuth, ensureStaff, adminController.getCalendarResources);
router.get('/calendar-events', ensureAuth, ensureStaff, adminController.getCalendarEvents);

// Analytics
router.get('/analytics', ensureAuth, ensureManager, adminController.getAnalyticsDashboard);


// ==========================================
// 2. BOOKING MANAGEMENT
// ==========================================
router.post('/booking/update-status', ensureAuth, ensureStaff, adminController.updateBookingStatus);
router.post('/booking/update-details', ensureAuth, ensureStaff, upload.any(), adminController.updateBookingDetails);


// ==========================================
// 3. REPORTS (Accessible by Manager+)
// ==========================================
router.get('/report/download', ensureAuth, ensureManager, reportController.generateReport);


// ==========================================
// 4. ROOM MANAGEMENT
// ==========================================
router.post('/room/create', ensureAuth, ensureManager, upload.array('images', 10), adminController.createRoom);
router.post('/room/update', ensureAuth, ensureManager, upload.array('images', 5), adminController.updateRoom);
router.get('/room/delete/:id', ensureAuth, ensureManager, adminController.deleteRoom);


// ==========================================
// 5. PROMO MANAGEMENT
// ==========================================
router.post('/promo/create', ensureAuth, ensureManager, adminController.createPromotion);
router.post('/promo/update', ensureAuth, ensureManager, adminController.updatePromotion); 
router.get('/promo/delete/:id', ensureAuth, ensureManager, adminController.deletePromo);


// ==========================================
// 6. USER MANAGEMENT (Admin only)
// ==========================================
router.post('/user/create', ensureAuth, ensureAdmin, adminController.createUser);
router.post('/user/update', ensureAuth, ensureAdmin, adminController.updateUser);
router.get('/user/delete/:id', ensureAuth, ensureAdmin, adminController.deleteUser);


// ==========================================
// 7. SITE CONFIG & AMENITIES
// ==========================================
router.post('/site-config/update', ensureAuth, ensureAdmin, upload.any(), adminController.updateSiteConfig);

router.post('/amenity/create', ensureAuth, ensureManager, upload.array('images', 10), adminController.createResortAmenity);
router.get('/amenity/delete/:id', ensureAuth, ensureManager, adminController.deleteResortAmenity);


// ==========================================
// 8. MAINTENANCE & REVIEWS
// ==========================================
router.post('/maintenance/create', ensureAuth, ensureStaff, adminController.createMaintenance);
router.post('/maintenance/update', ensureAuth, ensureStaff, adminController.updateMaintenance);
router.get('/maintenance/delete/:id', ensureAuth, ensureStaff, adminController.deleteMaintenance);

router.get('/review/approve/:id', ensureAuth, ensureStaff, adminController.approveReview);
router.get('/review/reject/:id', ensureAuth, ensureStaff, adminController.rejectReview);

module.exports = router;