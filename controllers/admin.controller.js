const Booking = require('../models/Booking.model');
const Room = require('../models/Room.model');
const Promotion = require('../models/Promotion.model');
const SiteConfig = require('../models/SiteConfig.model');
const User = require('../models/User.model');
const ResortAmenity = require('../models/ResortAmenity.model');
const bcrypt = require('bcryptjs');
const Maintenance = require('../models/Maintenance.model');
const Review = require('../models/Review.model');
const mongoose = require('mongoose');
const { createUserValidationRules, updateUserValidationRules, siteConfigValidationRules, validate } = require('../Validator/admin.validator');

// @desc    Admin Dashboard (Stats, Bookings, Search, Filter)
// @route   GET /admin
exports.getAdminDashboard = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        
        // Filter Inputs
        const search = req.query.search ? req.query.search.trim() : '';
        const statusFilter = req.query.status || '';
        const dateRange = req.query.dateRange || ''; 

        let query = {};

        // 1. STATUS FILTER
        if (statusFilter) {
            query.status = statusFilter;
        }

        // 2. ADVANCED SEARCH (Name, Room, ID, Phone, Ref)
        if (search) {
            const searchRegex = new RegExp(search, 'i'); 

            // A. Find Users matching Name/Email
            const foundUsers = await User.find({
                $or: [{ firstName: searchRegex }, { lastName: searchRegex }, { email: searchRegex }]
            }).select('_id');
            const userIds = foundUsers.map(u => u._id);

            // B. Find Rooms matching Name
            const foundRooms = await Room.find({ name: searchRegex }).select('_id');
            const roomIds = foundRooms.map(r => r._id);

            // C. Build the OR Condition
            let orConditions = [
                { user: { $in: userIds } },       
                { room: { $in: roomIds } },       
                { guestPhone: searchRegex },      
                { paymentRef: searchRegex }       
            ];

            // D. Exact ID Match 
            if (mongoose.Types.ObjectId.isValid(search)) {
                orConditions.push({ _id: search });
            }

            query.$or = orConditions;
        }

        // 3. DATE RANGE FILTER
        if (dateRange && dateRange.includes(' to ')) {
            const [startStr, endStr] = dateRange.split(' to ');
            const startDate = new Date(startStr);
            const endDate = new Date(endStr);
            endDate.setHours(23, 59, 59, 999);

            query.checkInDate = { $gte: startDate, $lte: endDate };
        }
            
        // 4. FETCH COUNTS & BOOKINGS
        const totalBookingsCount = await Booking.countDocuments(query);
        const bookings = await Booking.find(query)
            .populate('user', 'firstName middleName lastName email')
            .populate('room')
            .populate('promoApplied')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit);

        // 5. REVENUE CALCULATION
        const revenueStats = await Booking.aggregate([
            { 
                $match: { 
                    status: { $ne: 'cancelled' },       
                    paymentStatus: { $ne: 'refunded' }  
                } 
            },
            { 
                $group: { 
                    _id: null, 
                    totalSales: { $sum: "$totalPrice" },
                    cashCollected: { $sum: "$amountPaid" },
                    receivables: { $sum: { $subtract: ["$totalPrice", "$amountPaid"] } }
                } 
            }
        ]);

        const stats = revenueStats.length > 0 ? revenueStats[0] : { totalSales: 0, cashCollected: 0, receivables: 0 };
        const activeCount = await Booking.countDocuments({
            status: { $in: ['confirmed', 'pending'] }
        });

        // 6. FETCH OTHER DATA
        const rooms = await Room.find();
        const promotions = await Promotion.find().sort({ createdAt: -1 });
        const resortAmenities = await ResortAmenity.find();
        
        const pendingReviews = await Review.find({ isVisible: false })
        .populate('user', 'firstName lastName')
        .populate('booking', 'room')
        .sort({ createdAt: -1 });
        
        const maintenanceRecords = await Maintenance.find()
            .populate('room')
            .sort({ status: 1, startDate: 1 });
            
        // 7. SEPARATE USER FETCHING (Staff vs Guests)
        // A. Staff/Admins
        const staffUsers = await User.find({ 
            role: { $in: ['staff', 'manager', 'admin', 'superadmin'] } 
        }).sort({ role: 1, firstName: 1 });

        // B. Guests
        const guestUsers = await User.find({ 
            role: 'user' 
        }).sort({ createdAt: -1 });

        // 8. FETCH SITE CONFIG
        let config = await SiteConfig.findOne();
        if (!config) {
            config = await SiteConfig.create({});
        }

        const appUrl = `${req.protocol}://${req.get('host')}`;
        const configWithUrl = { ...config._doc, appUrl };

        res.render('Admin/dashboard', {
            title: 'Admin Dashboard',
            bookings,
            rooms,
            promotions,
            users: staffUsers,      
            guestUsers: guestUsers, 
            pendingReviews,
            stats,
            activeCount,
            config: configWithUrl,
            resortAmenities,
            user: req.user,
            currentPage: page,
            totalPages: Math.ceil(totalBookingsCount / limit),
            search,
            statusFilter,
            maintenanceRecords,
            dateRange
        });
    } catch (error) {
        console.error("Admin Dashboard Error:", error);
        res.status(500).send('Server Error');
    }
};

// @desc    Approve Review
// @route   GET /admin/review/approve/:id
exports.approveReview = async (req, res) => {
    try {
        await Review.findByIdAndUpdate(req.params.id, { isVisible: true });
        res.redirect('/admin');
    } catch (error) {
        res.status(500).send('Error approving review');
    }
};

// @desc    Reject (Delete) Review
// @route   GET /admin/review/reject/:id
exports.rejectReview = async (req, res) => {
    try {
        await Review.findByIdAndDelete(req.params.id);
        res.redirect('/admin');
    } catch (error) {
        res.status(500).send('Error rejecting review');
    }
};

// @desc    Update Booking Status
// @route   POST /admin/booking/update-status
exports.updateBookingStatus = async (req, res) => {
    try {
        const { bookingId, status, paymentStatus, adminNotes } = req.body;
        await Booking.findByIdAndUpdate(bookingId, { status, paymentStatus, adminNotes });
        res.redirect('/admin');
    } catch (error) {
        res.status(500).send('Error updating status');
    }
};

// @desc    Update Booking Details (Manual Edit)
// @route   POST /admin/booking/update-details
exports.updateBookingDetails = async (req, res) => {
    try {
        const { 
            bookingId, 
            guestFirstName, guestMiddleName, guestLastName, guestEmail, // Added Email
            guestPhone, specialRequests,
            compName, compAge, compGender, compContact,
            guests, roomId, newCheckIn, newCheckOut, 
            newTotalPrice, extraFee, 
            amountPaid,
            status, paymentStatus, paymentRef, adminNotes,
            promoApplied 
        } = req.body;

        const booking = await Booking.findById(bookingId).populate('user');
        if (!booking) return res.status(404).send('Booking not found');

        // Update Primary Guest (User Model)
        if (booking.user) {
            if(guestFirstName) booking.user.firstName = guestFirstName;
            if(guestMiddleName) booking.user.middleName = guestMiddleName;
            if(guestLastName) booking.user.lastName = guestLastName;
            
            // Update Email if changed
            if(guestEmail && guestEmail !== booking.user.email) {
                booking.user.email = guestEmail;
            }

            await booking.user.save();
        }

        // Update Booking Fields
        booking.guestPhone = guestPhone;
        booking.specialRequests = specialRequests;
        booking.guests = parseInt(guests);
        booking.room = roomId;
        booking.checkInDate = new Date(newCheckIn);
        booking.checkOutDate = new Date(newCheckOut);
        
        booking.totalPrice = parseFloat(newTotalPrice);
        booking.extraFee = parseFloat(extraFee) || 0; 
        booking.amountPaid = parseFloat(amountPaid) || 0;

        booking.status = status;
        booking.paymentStatus = paymentStatus;
        booking.paymentRef = paymentRef;
        booking.adminNotes = adminNotes;
        booking.promoApplied = (promoApplied && promoApplied !== "") ? promoApplied : null;

        // Handle ID Image
        if (req.files && req.files.length > 0) {
            const primaryFile = req.files.find(f => f.fieldname === 'primaryIdImage');
            if (primaryFile) {
                booking.guestIdImage = primaryFile.path || ('/uploads/' + primaryFile.filename);
            }
        }

        // Handle Companions
        let companionsList = [];
        const names = compName ? (Array.isArray(compName) ? compName : [compName]) : [];
        const ages = compAge ? (Array.isArray(compAge) ? compAge : [compAge]) : [];
        const genders = compGender ? (Array.isArray(compGender) ? compGender : [compGender]) : [];
        const contacts = compContact ? (Array.isArray(compContact) ? compContact : [compContact]) : [];

        for (let i = 0; i < names.length; i++) {
            if (names[i] && names[i].trim() !== '') {
                let idImageUrl = '';
                const fileKey = `compIdImage_${i}`;
                const newFile = req.files ? req.files.find(f => f.fieldname === fileKey) : null;

                if (newFile) {
                    idImageUrl = newFile.path || ('/uploads/' + newFile.filename);
                } else {
                    if (booking.companions && booking.companions[i]) {
                        idImageUrl = booking.companions[i].idImage;
                    }
                }

                companionsList.push({
                    name: names[i],
                    age: parseInt(ages[i]) || 0,
                    gender: genders[i] || 'Male',
                    contact: contacts[i] || '',
                    idImage: idImageUrl
                });
            }
        }

        booking.companions = companionsList;
        await booking.save();
        
        res.redirect('/admin');

    } catch (error) {
        console.error("Update Booking Error:", error);
        res.status(500).send(`Error updating booking: ${error.message}`);
    }
};

// @desc    Create New Room
// @route   POST /admin/room/create
exports.createRoom = async (req, res) => {
    try {
        const { name, description, pricePerNight, capacity, amenities, category } = req.body;
        let imagePaths = [];
        if (req.files && req.files.length > 0) {
            imagePaths = req.files.map(file => file.path || '/uploads/' + file.filename);
        } else {
            imagePaths.push('https://via.placeholder.com/800x600?text=No+Image');
        }
        const amenitiesArray = amenities ? amenities.split(',').map(item => item.trim()) : [];

        await Room.create({
            name, category, description, pricePerNight, capacity,
            amenities: amenitiesArray, images: imagePaths, isActive: true
        });
        res.redirect('/admin');
    } catch (error) {
        res.status(500).send('Error creating room');
    }
};

// @desc    Update Room Details
// @route   POST /admin/room/update
exports.updateRoom = async (req, res) => {
    try {
        const { roomId, name, description, pricePerNight, capacity, amenities, category, airbnbIcalUrl, agodaIcalUrl } = req.body;
        
        let updateData = { 
            name, category, description, pricePerNight, capacity,
            airbnbIcalUrl, agodaIcalUrl 
        };
        
        if (amenities) updateData.amenities = amenities.split(',').map(item => item.trim());
        
        if (req.files && req.files.length > 0) {
            updateData.images = req.files.map(file => file.path || '/uploads/' + file.filename);
        }
        
        await Room.findByIdAndUpdate(roomId, updateData);
        res.redirect('/admin');
    } catch (error) {
        res.status(500).send('Error updating room');
    }
};

// @desc    Delete Room
// @route   GET /admin/room/delete/:id
exports.deleteRoom = async (req, res) => {
    try {
        await Room.findByIdAndDelete(req.params.id);
        res.redirect('/admin');
    } catch (error) {
        res.status(500).send('Error deleting room');
    }
};

// @desc    Create Promotion
// @route   POST /admin/promo/create
exports.createPromotion = async (req, res) => {
    try {
        const { code, name, type, value, eligibleDates, allowedEmails } = req.body;

        let datesArray = [];
        if (eligibleDates && eligibleDates.trim() !== '') {
            datesArray = eligibleDates.split(',').map(d => d.trim());
        }

        // Process Allowed Emails
        let emailsArray = [];
        if (allowedEmails && allowedEmails.trim() !== '') {
            emailsArray = allowedEmails.split(',').map(e => e.trim().toLowerCase());
        }

        let promoData = {
            code: code.toUpperCase(),
            name,
            type,
            eligibleDates: datesArray,
            allowedEmails: emailsArray,
            isActive: true
        };

        if (type === 'percentage' || type === 'fixed') {
            promoData.discountValue = parseFloat(value);
        } else if (type === 'extension') {
            promoData.extensionHours = parseFloat(value);
        }

        await Promotion.create(promoData);
        res.redirect('/admin');

    } catch (error) {
        console.error("PROMO CREATE ERROR:", error);
        res.status(500).send(`Error creating promo: ${error.message}`);
    }
};

// @desc    Update Promotion
// @route   POST /admin/promo/update
exports.updatePromotion = async (req, res) => {
    try {
        const { promoId, code, name, type, value, eligibleDates, allowedEmails } = req.body;

        let datesArray = [];
        if (eligibleDates && eligibleDates.trim() !== '') {
            datesArray = eligibleDates.split(',').map(d => d.trim());
        }

        // Process Allowed Emails
        let emailsArray = [];
        if (allowedEmails && allowedEmails.trim() !== '') {
            emailsArray = allowedEmails.split(',').map(e => e.trim().toLowerCase());
        }

        let updateData = {
            code: code.toUpperCase(),
            name,
            type,
            eligibleDates: datesArray,
            allowedEmails: emailsArray
        };

        // Reset values to avoid conflict
        updateData.discountValue = 0;
        updateData.extensionHours = 0;

        if (type === 'percentage' || type === 'fixed') {
            updateData.discountValue = parseFloat(value);
        } else if (type === 'extension') {
            updateData.extensionHours = parseFloat(value);
        }

        await Promotion.findByIdAndUpdate(promoId, updateData);
        res.redirect('/admin');

    } catch (error) {
        console.error("PROMO UPDATE ERROR:", error);
        res.status(500).send(`Error updating promo: ${error.message}`);
    }
};

// @desc    Delete Promo
// @route   GET /admin/promo/delete/:id
exports.deletePromo = async (req, res) => {
    try {
        await Promotion.findByIdAndDelete(req.params.id);
        res.redirect('/admin');
    } catch (error) {
        res.status(500).send('Error deleting promo');
    }
};

// @desc    Create Staff/Admin User
// @route   POST /admin/user/create
exports.createUser = [
    createUserValidationRules(),
    validate,
    async (req, res) => {
        try {
            const { firstName, lastName, username, email, password, role } = req.body;

            if (role === 'superadmin' && req.user.role !== 'superadmin') {
                return res.status(403).send("Access Denied: Only Superadmin can create another Superadmin.");
            }

            if(username) {
                const existingUser = await User.findOne({ username });
                if (existingUser) return res.send('<script>alert("Username taken"); window.location="/admin";</script>');
            }
            
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);

            await User.create({
                firstName, lastName, displayName: `${firstName} ${lastName}`,
                username, email, password: hashedPassword, role,
                image: `https://ui-avatars.com/api/?name=${firstName}+${lastName}&background=random`
            });
            res.redirect('/admin');
        } catch (error) {
            console.error(error);
            res.status(500).send('Server Error creating user');
        }
    }
];

// @desc    Update User
// @route   POST /admin/user/update
exports.updateUser = [
    updateUserValidationRules(),
    validate,
    async (req, res) => {
        try {
            const { userId, firstName, lastName, username, email, role, password } = req.body;
            const user = await User.findById(userId);
            if (!user) return res.status(404).send("User not found");

            user.firstName = firstName;
            user.lastName = lastName;
            user.role = role;
            if (username) user.username = username;
            if (email) user.email = email;

            if (password && password.trim() !== "") {
                const salt = await bcrypt.genSalt(10);
                user.password = await bcrypt.hash(password, salt);
            }

            await user.save();
            res.redirect('/admin');
        } catch (error) {
            res.status(500).send("Server Error updating user");
        }
    }
];

// @desc    Delete User
// @route   GET /admin/user/delete/:id
exports.deleteUser = async (req, res) => {
    try {
        const targetUser = await User.findById(req.params.id);
        
        if (!targetUser) return res.status(404).send("User not found");

        if (req.params.id === req.user.id) {
            return res.send('<script>alert("Cannot delete self"); window.location="/admin";</script>');
        }

        if (targetUser.role === 'superadmin' && req.user.role !== 'superadmin') {
            return res.status(403).send("Access Denied: You cannot delete a Superadmin.");
        }

        await User.findByIdAndDelete(req.params.id);
        res.redirect('/admin');
    } catch (error) {
        res.status(500).send('Error deleting user');
    }
};

// @desc    Update Site Config
// @route   POST /admin/site-config/update
exports.updateSiteConfig = [
    siteConfigValidationRules(),
    validate,
    async (req, res) => {
        try {
            const { 
                heroTitle, heroSubtitle, heroDescription, contactNumber,
                feeSmallRoom, feeLargeRoom,
                ownerName, ownerEmail, membershipNo, ownerAddress, ownerTel,
                propertyAddress, propertyTel,
                aboutTitle, aboutDescription,
                socialFacebook, socialViber, socialInstagram, socialTiktok,
                videoUrl, legalPrivacy, legalTerms
            } = req.body;
            
            let config = await SiteConfig.findOne();
            if (!config) config = new SiteConfig();

            // 1. Update Basic Info
            config.heroTitle = heroTitle;
            config.heroSubtitle = heroSubtitle;
            config.heroDescription = heroDescription;
            config.contactNumber = contactNumber;
            config.feeSmallRoom = parseInt(feeSmallRoom) || 500;
            config.feeLargeRoom = parseInt(feeLargeRoom) || 1000;
            
            // 2. Update Ticket/Owner Info
            config.ownerName = ownerName;
            config.ownerEmail = ownerEmail;
            config.membershipNo = membershipNo;
            config.ownerAddress = ownerAddress;
            config.ownerTel = ownerTel;
            config.propertyAddress = propertyAddress;
            config.propertyTel = propertyTel;

            // 3. Update About Us Info
            config.aboutTitle = aboutTitle;
            config.aboutDescription = aboutDescription;

            // 4. Update Socials & Video
            config.socialFacebook = socialFacebook;
            config.socialViber = socialViber;
            config.socialInstagram = socialInstagram;
            config.socialTiktok = socialTiktok;
            config.videoUrl = videoUrl;
            
            // 5. ave Legal Text
            config.legalTerms = legalTerms;
            config.legalPrivacy = legalPrivacy;

            // 6. Handle File Uploads
            if (req.files && req.files.length > 0) {
                const heroFiles = req.files.filter(file => file.fieldname === 'heroImages');
                if (heroFiles.length > 0) {
                    config.heroImages = heroFiles.map(file => file.path || '/uploads/' + file.filename);
                }

                const aboutFile = req.files.find(file => file.fieldname === 'aboutImage');
                if (aboutFile) {
                    config.aboutImage = aboutFile.path || '/uploads/' + aboutFile.filename;
                }
            }
            
            await config.save();
            res.redirect('/admin');
        } catch (error) {
            console.error("Error updating site config:", error);
            res.status(500).send('Error updating site config');
        }
    }
];

// @desc    Create Resort Amenity
exports.createResortAmenity = async (req, res) => {
    try {
        const { name, description } = req.body;
        let imagePaths = [];

        if (req.files && req.files.length > 0) {
            imagePaths = req.files.map(file => file.path || '/uploads/' + file.filename);
        } else {
            imagePaths.push('https://via.placeholder.com/400x300?text=No+Image');
        }

        await ResortAmenity.create({ name, description, images: imagePaths });
        res.redirect('/admin');
    } catch (error) {
        console.error(error);
        res.status(500).send('Error creating amenity');
    }
};

// @desc    Delete Resort Amenity
exports.deleteResortAmenity = async (req, res) => {
    try {
        await ResortAmenity.findByIdAndDelete(req.params.id);
        res.redirect('/admin');
    } catch (error) {
        console.error(error);
        res.status(500).send('Error deleting amenity');
    }
};

// @desc    Get Analytics & Charts Page (Advanced)
// @route   GET /admin/analytics
exports.getAnalyticsDashboard = async (req, res) => {
    try {
        const currentYear = new Date().getFullYear();
        const selectedYear = parseInt(req.query.year) || currentYear;
        const selectedCategory = req.query.category || '';

        const startOfYear = new Date(selectedYear, 0, 1);
        const endOfYear = new Date(selectedYear, 11, 31, 23, 59, 59);

        let matchStage = {
            status: { $ne: 'cancelled' },
            checkInDate: { $gte: startOfYear, $lte: endOfYear }
        };

        if (selectedCategory) {
            const roomsInCat = await Room.find({ category: selectedCategory }).select('_id');
            const roomIds = roomsInCat.map(r => r._id);
            matchStage.room = { $in: roomIds };
        }

        // 1. REVENUE & BOOKING COUNT (Dual Axis Data)
        const monthlyStats = await Booking.aggregate([
            { $match: matchStage },
            { 
                $group: { 
                    _id: { $month: "$checkInDate" }, 
                    revenue: { $sum: "$totalPrice" },
                    bookings: { $sum: 1 }
                } 
            },
            { $sort: { _id: 1 } }
        ]);

        // 2. ROOM POPULARITY
        const roomPopularity = await Booking.aggregate([
            { $match: matchStage },
            { $group: { _id: "$room", count: { $sum: 1 }, revenue: { $sum: "$totalPrice" } } },
            { $lookup: { from: "rooms", localField: "_id", foreignField: "_id", as: "roomDetails" } },
            { $unwind: "$roomDetails" },
            { $project: { roomName: "$roomDetails.name", count: 1, revenue: 1 } },
            { $sort: { revenue: -1 } }, // Sort by revenue instead of count
            { $limit: 5 }
        ]);

        // 3. STATUS DISTRIBUTION
        const statusDistribution = await Booking.aggregate([
            { $match: { checkInDate: { $gte: startOfYear, $lte: endOfYear } } }, // Include cancelled for this chart
            { $group: { _id: "$status", count: { $sum: 1 } } }
        ]);

        // 4. KPI CALCULATIONS
        const totalRevenue = monthlyStats.reduce((acc, curr) => acc + curr.revenue, 0);
        const totalBookings = monthlyStats.reduce((acc, curr) => acc + curr.bookings, 0);
        
        // ADR (Average Daily Rate) = Total Revenue / Total Bookings
        const adr = totalBookings > 0 ? (totalRevenue / totalBookings) : 0;

        // Occupancy Rate Calculation (Approximate)
        const totalRoomsCount = await Room.countDocuments({ isActive: true });
        const daysInYear = (selectedYear % 4 === 0 && selectedYear % 100 > 0) || selectedYear % 400 === 0 ? 366 : 365;
        const totalAvailableNights = totalRoomsCount * daysInYear;
        
        // Calculate total nights booked
        const nightsBookedAgg = await Booking.aggregate([
            { $match: matchStage },
            {
                $project: {
                    nights: {
                        $ceil: {
                            $divide: [{ $subtract: ["$checkOutDate", "$checkInDate"] }, 1000 * 60 * 60 * 24]
                        }
                    }
                }
            },
            { $group: { _id: null, totalNights: { $sum: "$nights" } } }
        ]);
        
        const totalNightsBooked = nightsBookedAgg.length > 0 ? nightsBookedAgg[0].totalNights : 0;
        const occupancyRate = totalAvailableNights > 0 ? ((totalNightsBooked / totalAvailableNights) * 100) : 0;

        // 5. LEAD TIME ANALYSIS (How far in advance people book)
        const leadTimeStats = await Booking.aggregate([
            { $match: matchStage },
            {
                $project: {
                    leadTime: {
                        $ceil: {
                            $divide: [{ $subtract: ["$checkInDate", "$createdAt"] }, 1000 * 60 * 60 * 24]
                        }
                    }
                }
            },
            {
                $bucket: {
                    groupBy: "$leadTime",
                    boundaries: [0, 1, 7, 30, 90, 365],
                    default: "365+",
                    output: { count: { $sum: 1 } }
                }
            }
        ]);

        const config = await SiteConfig.findOne();

        res.render('Admin/analytics', {
            title: 'Advanced Analytics',
            user: req.user,
            monthlyStats,
            roomPopularity,
            statusDistribution,
            leadTimeStats,
            kpi: {
                totalRevenue,
                totalBookings,
                adr,
                occupancyRate,
                totalNightsBooked
            },
            selectedYear,
            selectedCategory,
            config,
            yearsRange: [currentYear, currentYear - 1, currentYear - 2]
        });

    } catch (error) {
        console.error("Analytics Error:", error);
        res.status(500).send('Server Error');
    }
};

// @desc    Create Maintenance Record
// @route   POST /admin/maintenance/create
exports.createMaintenance = async (req, res) => {
    try {
        const { roomId, task, startDate, endDate, status, notes } = req.body;
        await Maintenance.create({
            room: roomId,
            task,
            startDate,
            endDate: endDate || null,
            status,
            notes
        });
        res.redirect('/admin');
    } catch (error) {
        console.error(error);
        res.status(500).send('Error creating maintenance record');
    }
};

// @desc    Update Maintenance Record
// @route   POST /admin/maintenance/update
exports.updateMaintenance = async (req, res) => {
    try {
        const { maintenanceId, task, startDate, endDate, status, notes } = req.body;
        await Maintenance.findByIdAndUpdate(maintenanceId, {
            task,
            startDate,
            endDate: endDate || null,
            status,
            notes
        });
        res.redirect('/admin');
    } catch (error) {
        console.error(error);
        res.status(500).send('Error updating maintenance record');
    }
};

// @desc    Delete Maintenance Record
// @route   GET /admin/maintenance/delete/:id
exports.deleteMaintenance = async (req, res) => {
    try {
        await Maintenance.findByIdAndDelete(req.params.id);
        res.redirect('/admin');
    } catch (error) {
        res.status(500).send('Error deleting maintenance record');
    }
};