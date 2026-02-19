const mongoose = require('mongoose');

const ReviewSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: true },
    
    // CHANGE DEFAULT TO FALSE
    isVisible: { type: Boolean, default: false } 
}, { timestamps: true });

// Prevent duplicate reviews for the same booking
ReviewSchema.index({ booking: 1 }, { unique: true });

module.exports = mongoose.model('Review', ReviewSchema);