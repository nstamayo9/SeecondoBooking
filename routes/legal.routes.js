const express = require('express');
const router = express.Router();
const legalController = require('../controllers/legal.controller');

router.get('/terms', legalController.getTerms);
router.get('/privacy', legalController.getPrivacy);

module.exports = router;