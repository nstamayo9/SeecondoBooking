const mongoose = require('mongoose');

const BookingSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
    
    // Dates & Price
    checkInDate: { type: Date, required: true },
    checkOutDate: { type: Date, required: true },
    
    totalPrice: { type: Number, required: true },
    extraFee: { type: Number, default: 0 },
    
    // Track actual amount paid (for partial/downpayments)
    amountPaid: { type: Number, default: 0 }, 
    
    // PRIMARY GUEST DETAILS
    guests: { type: Number, default: 1 },
    guestPhone: { type: String, required: true },
    guestIdType: { type: String, default: 'Government ID' }, 
    guestIdNumber: { type: String },
    guestIdImage: { type: String }, // Cloudinary URL or Local Path
    specialRequests: { type: String },
    paymentRef: { type: String, default: '' },
    
    // COMPANIONS ARRAY
    companions: [{
        name: String,
        age: Number,
        dateOfBirth: Date,
        gender: String,
        contact: String,
        idImage: String
    }],

    // Status
    status: { 
        type: String, 
        enum: ['pending', 'confirmed', 'completed', 'cancelled'],
        default: 'pending' 
    },
    
    paymentStatus: { 
        type: String, 
        enum: ['unpaid', 'partial', 'paid', 'refunded'],
        default: 'unpaid' 
    },
    
    promoApplied: { type: mongoose.Schema.Types.ObjectId, ref: 'Promotion', default: null },
    
    adminNotes: String,

    // ============================================================
    // NEW: SYNCING FIELDS (Airbnb / Agoda)
    // ============================================================
    source: { 
        type: String, 
        enum: ['website', 'airbnb', 'agoda', 'manual'], 
        default: 'website' 
    },
    externalId: { type: String } // Stores the unique UID from the iCal event to prevent duplicates

}, { timestamps: true });

// ============================================================
// PERFORMANCE INDEXES
// ============================================================
// 1. Optimize Availability Checks
BookingSchema.index({ room: 1, status: 1, checkInDate: 1, checkOutDate: 1 });

// 2. Optimize User Dashboard Lookups
BookingSchema.index({ user: 1, createdAt: -1 });

// 3. Optimize Cron Job (Finding old unpaid bookings)
BookingSchema.index({ status: 1, paymentStatus: 1, createdAt: 1 });

// 4. Optimize Syncing (Finding external bookings)
BookingSchema.index({ externalId: 1 });

module.exports = mongoose.model('Booking', BookingSchema);