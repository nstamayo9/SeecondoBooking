const express = require('express');
const router = express.Router();
const syncController = require('../controllers/sync.controller');

// External sites call this URL to get OUR bookings
router.get('/room/:roomId.ics', syncController.exportIcal);

module.exports = router;