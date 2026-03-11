const mongoose = require('mongoose');

const MaintenanceSchema = new mongoose.Schema({
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
    task: { type: String, required: true }, // e.g., "Repainting", "AC Repair"
    startDate: { type: Date, required: true },
    endDate: { type: Date }, // Optional: Expected or Actual finish date
    status: { 
        type: String, 
        enum: ['Scheduled', 'In Progress', 'Completed'], 
        default: 'Scheduled' 
    },
    notes: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('Maintenance', MaintenanceSchema);