const express = require('express');
const router = express.Router();
const promoController = require('../controllers/promo.controller');
const { ensureAuth } = require('../middleware/auth.middleware');

// API endpoint to validate code
router.post('/validate', ensureAuth, promoController.validatePromo);

module.exports = router;