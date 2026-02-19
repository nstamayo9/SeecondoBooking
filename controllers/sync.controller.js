const Booking = require('../models/Booking.model');
const Room = require('../models/Room.model');
const ical = require('ical-generator').default;
const nodeIcal = require('node-ical');

// ==========================================
// 1. EXPORT: Generate iCal for Airbnb/Agoda
// ==========================================
exports.exportIcal = async (req, res) => {
    try {
        const room = await Room.findById(req.params.roomId);
        if (!room) return res.status(404).send('Room not found');

        // Find all active bookings for this room
        const bookings = await Booking.find({
            room: room._id,
            status: { $in: ['confirmed', 'completed'] } // Don't sync pending/cancelled
        }).populate('user');

        const calendar = ical({
            name: `See Condo - ${room.name}`,
            timezone: 'Asia/Manila'
        });

        bookings.forEach(b => {
            calendar.createEvent({
                start: b.checkInDate,
                end: b.checkOutDate,
                summary: 'Reserved: See Condo', // Keep guest name private
                description: 'Booking from direct website',
                uid: b._id.toString()
            });
        });

        calendar.serve(res); // Serves the .ics file
    } catch (error) {
        console.error(error);
        res.status(500).send('Error generating iCal');
    }
};

// ==========================================
// 2. IMPORT: Sync from Airbnb/Agoda
// ==========================================
exports.syncCalendars = async () => {
    console.log("🔄 Starting Calendar Sync...");
    
    const rooms = await Room.find({ 
        $or: [{ airbnbIcalUrl: { $ne: '' } }, { agodaIcalUrl: { $ne: '' } }] 
    });

    for (const room of rooms) {
        // Sync Airbnb
        if (room.airbnbIcalUrl) {
            await processExternalCalendar(room._id, room.airbnbIcalUrl, 'airbnb');
        }
        // Sync Agoda
        if (room.agodaIcalUrl) {
            await processExternalCalendar(room._id, room.agodaIcalUrl, 'agoda');
        }
    }
    console.log("✅ Calendar Sync Complete.");
};

// Helper Function
async function processExternalCalendar(roomId, url, source) {
    try {
        const events = await nodeIcal.async.fromURL(url);
        
        for (const key in events) {
            const event = events[key];
            if (event.type === 'VEVENT') {
                
                // Check if this booking already exists
                const exists = await Booking.findOne({ externalId: event.uid });
                
                if (!exists) {
                    // Create "Blocker" Booking
                    await Booking.create({
                        user: '65a1234567890abcdef12345', // You might need a dummy "System User" ID here
                        room: roomId,
                        checkInDate: event.start,
                        checkOutDate: event.end,
                        totalPrice: 0,
                        amountPaid: 0,
                        guestPhone: 'N/A',
                        status: 'confirmed', // Block the dates
                        paymentStatus: 'paid',
                        source: source,
                        externalId: event.uid,
                        adminNotes: `Synced from ${source.toUpperCase()}`
                    });
                    console.log(`+ Imported ${source} booking for room ${roomId}`);
                }
            }
        }
    } catch (error) {
        console.error(`Error syncing ${source} for room ${roomId}:`, error.message);
    }
}