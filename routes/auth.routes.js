const express = require('express');
const router = express.Router();
const passport = require('passport');
const authController = require('../controllers/auth.controller');
const { ensureAuth, ensureAdmin } = require('../middleware/auth.middleware');

// Protect Registration: Only Admins can create new users
router.post('/register', ensureAuth, ensureAdmin, authController.postRegister);

// Google Auth
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/google/callback', passport.authenticate('google', { failureRedirect: '/auth/login' }), (req, res) => res.redirect('/'));

// Local Auth
router.get('/login', authController.getLogin);
router.post('/login', authController.postLogin);
router.post('/register', authController.postRegister); // Usually protected for Admins

// Logout
router.get('/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) { return next(err); }
        res.redirect('/');
    });
});

module.exports = router;