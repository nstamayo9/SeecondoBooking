const mongoose = require('mongoose');

const RoomSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    category: { 
        type: String, 
        enum: ['Studio', '1BR', '2BR', '3BR', '4BR', 'Penthouse'], 
        default: 'Studio' 
    },
    description: {
        type: String,
        required: true
    },
    pricePerNight: {
        type: Number,
        required: true
    },
    capacity: {
        type: Number,
        required: true 
    },
    amenities: {
        type: [String], 
        default: []
    },
    images: {
        type: [String], 
        default: []
    },
    isActive: {
        type: Boolean,
        default: true // Admin can hide room if under maintenance
    },
    
        // TIME CONFIGURATION
    standardStayHours: { 
        type: Number, 
        default: 22 // Guest stays for 22 hours
    },
    cleaningBufferHours: { 
        type: Number, 
        default: 2 // Room is blocked for 2 hours after checkout
    },
    airbnbIcalUrl: { type: String, default: '' },
    agodaIcalUrl: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Room', RoomSchema);