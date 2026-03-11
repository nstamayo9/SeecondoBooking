const mongoose = require('mongoose');

const PromotionSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true, uppercase: true },
    name: { type: String, required: true },
    
    type: { 
        type: String, 
        enum: ['percentage', 'fixed', 'extension'], 
        required: true 
    },
    
    discountValue: { type: Number, default: 0 },
    extensionHours: { type: Number, default: 0 },

    eligibleDates: [{ type: String }], 
    
    // --- NEW FIELD ---
    allowedEmails: [{ type: String, lowercase: true, trim: true }], 
    // -----------------

    startDate: Date,
    endDate: Date,
    applicableRooms: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Room' }],
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Promotion', PromotionSchema);