const express = require('express');
const dotenv = require('dotenv');
const path = require('path');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const morgan = require('morgan');
const passport = require('passport');
const cron = require('node-cron');
const helmet = require('helmet'); 
const rateLimit = require('express-rate-limit'); 
const compression = require('compression');
const cookieParser = require('cookie-parser');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const csrf = require('csurf');
const cleanupController = require('./controllers/cleanup.controller');
const mongoose = require('mongoose');
// Models & Config
const Booking = require('./models/Booking.model');
const logger = require('./config/logger');
const connectDB = require('./config/db');
const syncController = require('./controllers/sync.controller');

// 1. Load Config
dotenv.config();
require('./config/passport')(passport);
connectDB();


// --- ADD THIS BLOCK FOR BETTER DEBUGGING ---
mongoose.connection.on('disconnected', () => {
    console.log('⚠️  MongoDB Disconnected! Attempting to reconnect...');
});
mongoose.connection.on('reconnected', () => {
    console.log('✅ MongoDB Reconnected!');
});

const app = express();

// ==========================================
// 2. SECURITY & PERFORMANCE MIDDLEWARE
// ==========================================

// A. Compression (Faster Load Times)
app.use(compression());

// B. Secure Headers (Helmet)
app.use(helmet({
    contentSecurityPolicy: false, // Allow external scripts/images (Google, Cloudinary)
}));

// C. Rate Limiting (Prevent DDoS/Brute Force)
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.NODE_ENV === 'development' ? 1000 : 100, 
    message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// D. Body Parsers & Cookie Parser
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cookieParser());

// E. Data Sanitization (Prevent Injection Attacks)
app.use(mongoSanitize()); // Removes $ and . from input
app.use(xss()); // Cleans user input from HTML/Scripts

// F. Trust Proxy (Required for Heroku/Render/Nginx)
app.set('trust proxy', 1);

// G. Logging (Dev Mode)
if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
}

app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// 3. SESSION & AUTH SETUP
// ==========================================
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ 
        mongoUrl: process.env.MONGODB_URI,
        collectionName: 'sessions' 
    }),
    cookie: { 
        maxAge: 1000 * 60 * 60 * 24, // 1 Day
        httpOnly: true, // Prevents JS access to cookies
        secure: process.env.NODE_ENV === 'production', // HTTPS only in prod
        sameSite: 'lax' // CSRF protection helper
    }
}));

app.use(passport.initialize());
app.use(passport.session());

// Global Variables
app.use((req, res, next) => {
    res.locals.user = req.user || null;
    next();
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ==========================================
// 4. CRON JOBS
// ==========================================

// JOB 1: Auto-Cancel Unpaid Bookings (Every Minute)
cron.schedule('* * * * *', async () => {
    try {
        // Check if DB is connected before running query (1 = Connected)
        if (mongoose.connection.readyState !== 1) return;

        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        
        const expiredBookings = await Booking.updateMany(
            {
                status: 'pending',
                paymentStatus: 'unpaid',
                createdAt: { $lt: oneHourAgo }
            },
            {
                $set: { 
                    status: 'cancelled', 
                    adminNotes: 'System: Auto-cancelled due to non-payment within 1 hour.' 
                }
            }
        );

        if(expiredBookings.modifiedCount > 0) {
            logger.info(`[Cron] Auto-cancelled ${expiredBookings.modifiedCount} expired bookings.`);
        }
    } catch (err) {
        // Only log if it's NOT a connection reset (which is temporary)
        if (err.code !== 'ECONNRESET') {
            logger.error(`[Cron Error - AutoCancel] ${err.message}`);
        }
    }
});

// JOB 2: Sync Calendars with Airbnb/Agoda (Every 15 Minutes)
cron.schedule('*/15 * * * *', async () => {
    try {
        // console.log('[Cron] 🔄 Starting Calendar Sync...');
        await syncController.syncCalendars();
    } catch (err) {
        logger.error(`[Cron Error - Sync] ${err.message}`);
    }
});

// JOB 3: Cloudinary Cleanup (Runs every day at Midnight)
// Cron pattern: '0 0 * * *'
cron.schedule('0 0 * * *', async () => {
    try {
        // logger.info('[Cron] 🧹 Starting Cloudinary Image Cleanup...');
        await cleanupController.deleteOldBookingImages();
    } catch (err) {
        logger.error(`[Cron Error - Cleanup] ${err.message}`);
    }
});
// ==========================================
// 5. ROUTES
// ==========================================
app.use('/auth', require('./routes/auth.routes'));
app.use('/', require('./routes/room.routes'));
app.use('/booking', require('./routes/booking.routes'));
app.use('/api/v1', require('./routes/api.routes')); 
app.use('/admin', require('./routes/admin.routes'));
app.use('/promo', require('./routes/promo.routes'));
app.use('/staff', require('./routes/staff.routes'));
app.use('/sync', require('./routes/sync.routes'));
app.use('/legal', require('./routes/legal.routes'));

// ==========================================
// 6. GLOBAL ERROR HANDLERS
// ==========================================

// 404 Handler
app.use((req, res, next) => {
    // Log 404s as warnings
    // logger.warn(`404 - ${req.originalUrl} - ${req.method} - ${req.ip}`);
    res.status(404).render('error', { title: '404 Not Found', message: 'Page not found' });
});

// General Error Handler
app.use((err, req, res, next) => {
    // Log error to file via Winston
    logger.error(`${err.status || 500} - ${err.message} - ${req.originalUrl} - ${req.method} - ${req.ip}`);
    
    // Show in console only in dev
    if (process.env.NODE_ENV === 'development') {
        console.error(err.stack);
    }

    res.status(500).render('error', { 
        title: 'Server Error', 
        message: process.env.NODE_ENV === 'production' ? 'Something went wrong!' : err.message 
    });
});

const PORT = process.env.PORT || 3000;

// 1. Assign the running app to a variable named 'server'
const server = app.listen(PORT, () => {
   console.log(`Server running in ${process.env.NODE_ENV || 'production'} mode on port ${PORT}`);
    console.log(`🌐 App:     http://localhost:${PORT}/`);
    console.log(`🔍 Health:  http://localhost:${PORT}/health`);
});

// 2. Now you can safely set the timeout
server.setTimeout(900000); // 5 minutes to allow large file uploads