const mongoose = require('mongoose');

const ResortAmenitySchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String },
    // CHANGED: From single String to Array of Strings
    images: { type: [String], required: true }, 
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('ResortAmenity', ResortAmenitySchema);