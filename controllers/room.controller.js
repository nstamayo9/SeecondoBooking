const Room = require('../models/Room.model');
const Booking = require('../models/Booking.model');
const User = require('../models/User.model');
const SiteConfig = require('../models/SiteConfig.model');
const ResortAmenity = require('../models/ResortAmenity.model');
const Review = require('../models/Review.model');
const Promotion = require('../models/Promotion.model');
const { createRoomValidationRules, updateRoomValidationRules, validate } = require('../Validator/room.validator');

// ============================================================
// HELPER: SMART SEARCH BUILDER
// ============================================================
const buildSearchQuery = (search, guests, minPrice, maxPrice) => {
    let query = { isActive: true };
    let orConditions = [];

    // 1. Text Search (Name, Category, Description)
    if (search) {
        const searchRegex = new RegExp(search, 'i');
        
        orConditions.push(
            { name: searchRegex },
            { category: searchRegex },
            { description: searchRegex }
        );

        // 2. Numeric Search (If user types a number like "4" or "5000")
        if (!isNaN(search) && search.trim() !== '') {
            const numVal = parseFloat(search);
            orConditions.push(
                { capacity: { $gte: numVal } }, // Matches capacity >= search
                { pricePerNight: { $lte: numVal + 1000, $gte: numVal - 1000 } } // Matches price within +/- 1000 range
            );
        }
        
        query.$or = orConditions;
    }

    // 3. Specific Filters (from URL params like ?guests=4)
    if (guests) query.capacity = { $gte: parseInt(guests) };
    if (minPrice || maxPrice) {
        query.pricePerNight = {};
        if (minPrice) query.pricePerNight.$gte = parseInt(minPrice);
        if (maxPrice) query.pricePerNight.$lte = parseInt(maxPrice);
    }

    return query;
};

// ============================================================
// CONTROLLERS
// ============================================================

// @desc    Home Page
// @route   GET /
exports.getHome = async (req, res) => {
    try {
        let config = await SiteConfig.findOne();
        if (!config) config = await SiteConfig.create({});

        // Build Query using Helper
        const { search, guests, minPrice, maxPrice } = req.query;
        const query = buildSearchQuery(search, guests, minPrice, maxPrice);

        // Fetch Data
        const rooms = await Room.find(query).limit(6);
        const totalRooms = await Room.countDocuments(query);
        const hasMore = totalRooms > 6;

        const resortAmenities = await ResortAmenity.find({ isActive: true });
        const reviews = await Review.find({ isVisible: true })
            .populate('user', 'firstName lastName image')
            .sort({ createdAt: -1 })
            .limit(6);

        res.render('Room/index', { 
            title: 'Welcome',
            rooms, user: req.user, config, query: req.query, hasMore,
            resortAmenities, reviews
        });

    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
};

// @desc    See All Rooms Page
// @route   GET /rooms/all
// @desc    See All Rooms Page
// @route   GET /rooms/all
exports.getAllRooms = async (req, res) => {
    try {
        const { search, guests, minPrice, maxPrice } = req.query;
        
        // Pagination Setup
        const page = parseInt(req.query.page) || 1;
        const limit = 6; // Show 6 rooms per page
        const skip = (page - 1) * limit;

        // Build Query
        let query = { isActive: true };
        
        if (search) {
            const searchRegex = new RegExp(search, 'i');
            query.$or = [
                { name: searchRegex },
                { category: searchRegex },
                { description: searchRegex }
            ];
        }

        // Fetch Data with Pagination
        const totalRooms = await Room.countDocuments(query);
        const totalPages = Math.ceil(totalRooms / limit);
        
        const rooms = await Room.find(query)
            .skip(skip)
            .limit(limit);

        // Fetch Config
        let config = await SiteConfig.findOne();
        if (!config) config = await SiteConfig.create({});

        res.render('Room/all', { 
            title: 'All Rooms',
            rooms: rooms,
            user: req.user,
            query: req.query,
            config: config,
            
            // Pagination Data
            currentPage: page,
            totalPages: totalPages
        });

    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
};

// @desc    Get single room details
// @route   GET /room/:id
exports.getRoomDetails = async (req, res) => {
    try {
        const room = await Room.findById(req.params.id);
        if (!room) return res.status(404).render('error', { message: 'Room not found', title: 'Error' });

        res.render('Room/details', { 
            title: room.name,
            room, user: req.user
        });
    } catch (error) {
        if (error.kind === 'ObjectId') return res.status(404).send('Room not found');
        res.status(500).send('Server Error');
    }
};

// @desc    Public Promos Page
// @route   GET /promos
exports.getPromosPage = async (req, res) => {
    try {
        // 1. Fetch Config (to get hero image)
        let config = await SiteConfig.findOne();
        if (!config) config = await SiteConfig.create({});

        // 2. Fetch Promos
        const promotions = await Promotion.find({ isActive: true });

        // 3. Render
        res.render('promos', { 
            title: 'Current Promotions', 
            promotions, 
            config, // <--- PASS THIS
            user: req.user 
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
};

// @desc    User Dashboard (My Bookings / All Bookings for Staff)
// @route   GET /dashboard
exports.getDashboard = async (req, res) => {
    try {
        // 1. AUTO-CANCELLATION LOGIC (Cleanup expired bookings)
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        await Booking.updateMany(
            {
                status: 'pending',
                paymentStatus: 'unpaid',
                createdAt: { $lt: oneHourAgo }
            },
            {
                $set: { 
                    status: 'cancelled', 
                    adminNotes: 'System: Auto-cancelled due to non-payment within 1-hour window.' 
                }
            }
        );

        const page = parseInt(req.query.page) || 1;
        const limit = 5; // Updated to 5 per page for better UI
        const search = req.query.search ? req.query.search.trim() : '';

        // 2. Determine Base Query based on Role
        let query = {};
        const isStaffOrHigher = ['staff', 'manager', 'admin', 'superadmin'].includes(req.user.role);

        if (!isStaffOrHigher) {
            query.user = req.user._id;
        }

        // 3. Handle Search
        if (search) {
            const searchRegex = new RegExp(search, 'i');
            const foundUsers = await User.find({
                $or: [{ firstName: searchRegex }, { lastName: searchRegex }, { email: searchRegex }]
            }).select('_id');
            const foundRooms = await Room.find({ name: searchRegex }).select('_id');

            const searchConditions = {
                $or: [
                    { user: { $in: foundUsers.map(u => u._id) } },
                    { room: { $in: foundRooms.map(r => r._id) } },
                    { guestPhone: searchRegex },
                    { _id: search.match(/^[0-9a-fA-F]{24}$/) ? search : null }
                ]
            };

            if (query.user) query = { $and: [{ user: req.user._id }, searchConditions] };
            else query = searchConditions;
        }

        // 4. Fetch Site Configuration
        let config = await SiteConfig.findOne();
        if (!config) config = await SiteConfig.create({});

        // 5. Pagination & Execution
        const totalBookings = await Booking.countDocuments(query);
        const totalPages = Math.ceil(totalBookings / limit);

        const bookings = await Booking.find(query)
            .populate('room')
            .populate('user')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit);

        // --- NEW: FETCH REVIEWED BOOKING IDs ---
        // This allows the view to hide the "Rate Stay" button if already rated.
        let reviewedBookingIds = [];
        if (!isStaffOrHigher) {
            const userReviews = await Review.find({ user: req.user._id }).select('booking');
            reviewedBookingIds = userReviews.map(r => r.booking.toString());
        }
        // ---------------------------------------

        res.render('dashboard', {
            title: isStaffOrHigher ? 'All Bookings' : 'My Bookings',
            bookings: bookings,
            user: req.user,
            config: config, 
            currentPage: page,
            totalPages: totalPages,
            search: search,
            isStaff: isStaffOrHigher,
            reviewedBookingIds: reviewedBookingIds // <--- Pass this to the view
        });

    } catch (error) {
        console.error("Dashboard Error:", error);
        res.status(500).send('Server Error');
    }
};