const express = require('express');
const router = express.Router();
const roomController = require('../controllers/room.controller');
const { ensureAuth } = require('../middleware/auth.middleware');


// Home Page Route
router.get('/', roomController.getHome);

// Single Room Page
router.get('/room/:id', roomController.getRoomDetails);

// NEW: Dashboard Route (Protected)
router.get('/dashboard', ensureAuth, roomController.getDashboard);
router.get('/rooms/all', roomController.getAllRooms);

// Promo Routes
router.get('/promos', roomController.getPromosPage);
module.exports = router;

