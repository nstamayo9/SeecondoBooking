const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/booking.controller');
const { ensureAuth, ensureStaff } = require('../middleware/auth.middleware');
const upload = require('../middleware/upload');

router.get('/book', ensureAuth, ensureStaff, bookingController.getManualBooking);

// UPDATED: Add upload.any()
router.post('/book', ensureAuth, ensureStaff, upload.any(), bookingController.postManualBooking);

module.exports = router;