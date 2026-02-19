const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    googleId: { type: String, unique: true, sparse: true },
    username: { type: String, unique: true, sparse: true },
    
    displayName: { type: String, required: true },
    firstName: String,
    middleName: { type: String, default: '' }, // NEW FIELD
    lastName: String,
    dateOfBirth: { type: Date },
    email: { type: String }, 
    password: { type: String },
    image: { type: String, default: 'https://via.placeholder.com/150' },
    role: {
        type: String,
        enum: ['user', 'staff', 'manager', 'admin', 'superadmin'],
        default: 'user'
    }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);