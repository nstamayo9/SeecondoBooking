const passport = require('passport');
const User = require('../models/User.model');
const SiteConfig = require('../models/SiteConfig.model');
const bcrypt = require('bcryptjs');

// @desc Render Login Page
exports.getLogin = async (req, res) => {
    try {
        // Fetch Config to get the background image
        let config = await SiteConfig.findOne();
        if (!config) config = new SiteConfig();

        res.render('auth/login', { 
            title: 'Login',
            user: req.user,
            config: config // <--- Pass config to the view
        });
    } catch (error) {
        console.error(error);
        res.render('auth/login', { user: req.user, config: {} });
    }
};

// @desc Handle Local Login
exports.postLogin = (req, res, next) => {
    passport.authenticate('local', async (err, user, info) => {
        if (err) { return next(err); }
        if (!user) { return res.redirect('/auth/login?error=Invalid credentials'); }

        // --- NEW: STRICT SEPARATION CHECK ---
        // If the user has role 'user', they are a GUEST.
        // Guests should typically login via Google, but if they have a password,
        // we can allow it BUT redirect them to /dashboard, NOT /admin.
        
        req.logIn(user, (err) => {
            if (err) { return next(err); }

            // Check Role and Redirect Accordingly
            if (['staff', 'manager', 'admin', 'superadmin'].includes(user.role)) {
                return res.redirect('/admin'); // Staff go to Admin Panel
            } else {
                return res.redirect('/dashboard'); // Guests go to User Dashboard
            }
        });

    })(req, res, next);
};

// @desc Handle Registration (For Staff/Admins creating accounts)
exports.postRegister = async (req, res) => {
    try {
        const { firstName, lastName, email, password, role } = req.body;
        
        // Check if user exists
        let user = await User.findOne({ email: email });
        if (user) {
            return res.send('Email already exists');
        }

        // Hash Password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create User
        await User.create({
            firstName,
            lastName,
            displayName: `${firstName} ${lastName}`,
            email,
            password: hashedPassword,
            role: role || 'user', // Default to user if not specified
            image: 'https://ui-avatars.com/api/?name=' + firstName + '+' + lastName
        });

        res.redirect('/auth/login');
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
};