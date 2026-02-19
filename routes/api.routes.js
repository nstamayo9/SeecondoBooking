const express = require('express');
const router = express.Router();
const apiController = require('../controllers/api.controller');
const calendarController = require('../controllers/calendar.controller');
const { ensureAuth, ensureStaff } = require('../middleware/auth.middleware'); 

// 1. Calendar Data (For Admin Dashboard)
//router.get('/admin/calendar-events', calendarController.getAdminEvents);
router.get('/admin/calendar-events', ensureAuth, ensureStaff, calendarController.getAdminEvents);


// 2. Room Busy Times (For Date Picker)
router.get('/room/:id/busy-times', calendarController.getRoomBusyTimes);

// 3. Availability Check (For Reserve Button)
router.post('/check-availability', apiController.checkAvailability);

// 4. Get All Rooms (Optional Public API)
router.get('/rooms', apiController.getAllRooms);

router.get('/admin/calendar-events', ensureAuth, ensureStaff, calendarController.getAdminEvents);


// NEW WEATHER ROUTE
router.get('/weather', apiController.getWeatherForecast);

module.exports = router;