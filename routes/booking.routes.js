const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/booking.controller');
const { ensureAuth } = require('../middleware/auth.middleware');
const reviewController = require('../controllers/review.controller');
const upload = require('../middleware/upload');

// Checkout
router.get('/checkout', ensureAuth, bookingController.getCheckout);
router.post('/confirm', ensureAuth, upload.any(), bookingController.postBooking);

// Edit
router.get('/edit/:id', ensureAuth, bookingController.getEditBooking);
router.post('/edit/:id', ensureAuth, upload.any(), bookingController.postEditBooking);

// Cancel
router.post('/cancel', ensureAuth, bookingController.cancelBooking);

// Download
router.get('/download/:id', ensureAuth, bookingController.downloadBookingPDF);

// Review Route
router.post('/review', ensureAuth, reviewController.createReview);

module.exports = router;