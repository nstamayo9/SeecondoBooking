const GoogleStrategy = require('passport-google-oauth20').Strategy;
const LocalStrategy = require('passport-local').Strategy; // NEW
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs'); // NEW
const User = require('../models/User.model');

module.exports = function (passport) {
    
    // ============================================================
    // 1. LOCAL STRATEGY (Email/Password)
    // ============================================================
    // LOCAL STRATEGY
    passport.use(new LocalStrategy({ usernameField: 'username' }, async (username, password, done) => {
        try {
            // Match User by Username
            const user = await User.findOne({ username: username });
            
            if (!user) {
                return done(null, false, { message: 'Username not found' });
            }

            // Match Password
            const isMatch = await bcrypt.compare(password, user.password);
            if (isMatch) {
                return done(null, user);
            } else {
                return done(null, false, { message: 'Password incorrect' });
            }
        } catch (err) {
            return done(err);
        }
    }));


    // ============================================================
    // 2. GOOGLE STRATEGY (Existing)
    // ============================================================
passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        // Change this to an absolute URL or use a variable
        callbackURL: process.env.NODE_ENV === 'production' 
            ? 'https://yourdomain.com/auth/google/callback' 
            : 'http://localhost:3000/auth/google/callback',
        proxy: true // Trust headers if you are behind a proxy (like Heroku/Nginx)
    },
    async (accessToken, refreshToken, profile, done) => {
        const newUser = {
            googleId: profile.id,
            displayName: profile.displayName,
            firstName: profile.name.givenName,
            lastName: profile.name.familyName,
            image: profile.photos[0].value,
            email: profile.emails[0].value
        };

        try {
            let user = await User.findOne({ googleId: profile.id });
            if (user) return done(null, user);

            user = await User.findOne({ email: profile.emails[0].value });
            if (user) {
                user.googleId = profile.id;
                user.image = profile.photos[0].value;
                await user.save();
                return done(null, user);
            }

            user = await User.create(newUser);
            done(null, user);
            return null;
        } catch (err) {
            console.error(err);
            done(err, null);
            return null;
        }
    }));

    passport.serializeUser((user, done) => done(null, user.id));
    passport.deserializeUser(async (id, done) => {
        try {
            const user = await User.findById(id);
            done(null, user);
        } catch (err) {
            done(err, null);
        }
    });
};