const Booking = require('../models/Booking.model');
const Promotion = require('../models/Promotion.model');
const Holidays = require('date-holidays');

exports.getAdminEvents = async (req, res) => {
    try {
        // 1. Get Date Range from FullCalendar Request
        // FullCalendar automatically sends ?start=2024-01-01&end=2024-02-01
        const startRange = req.query.start ? new Date(req.query.start) : new Date('2000-01-01');
        const endRange = req.query.end ? new Date(req.query.end) : new Date('2099-12-31');

        const events = [];

        // 2. FETCH BOOKINGS (Only within the view range)
        const bookings = await Booking.find({
            status: { $ne: 'cancelled' },
            $or: [
                // Check-in is inside the range
                { checkInDate: { $gte: startRange, $lt: endRange } },
                // Check-out is inside the range
                { checkOutDate: { $gte: startRange, $lt: endRange } },
                // Booking spans across the entire range
                { checkInDate: { $lt: startRange }, checkOutDate: { $gt: endRange } }
            ]
        }).populate('room', 'name').populate('user', 'firstName lastName');

        bookings.forEach(b => {
            if (b.checkInDate && b.checkOutDate) {
                let color = '#6c757d';      // default gray
                let textColor = 'white';

                switch (b.status) {
                    case 'confirmed':
                        color = '#ffc107'; // Yellow
                        textColor = 'black';
                        break;
                    case 'pending':
                        color = '#0d6efd'; // Blue
                        break;
                    case 'completed':
                        color = '#198754'; // Green
                        break;
                    case 'cancelled':
                        color = '#dc3545'; // Red
                        break;
                }

                events.push({
                    title: `${b.room ? b.room.name : 'Unknown'} - ${b.user ? b.user.firstName : 'Guest'}`,
                    start: b.checkInDate,
                    end: b.checkOutDate,
                    color,
                    textColor,
                    url: `/admin?search=${b._id}`
                });
            }
        });


        // 3. FETCH PROMOTIONS (Active only)
        const promos = await Promotion.find({ isActive: true });
        promos.forEach(p => {
            if (p.eligibleDates && p.eligibleDates.length > 0) {
                // Specific Dates
                p.eligibleDates.forEach(dateStr => {
                    const d = new Date(dateStr);
                    if (d >= startRange && d <= endRange) {
                        events.push({
                            title: `PROMO: ${p.code}`,
                            start: dateStr,
                            display: 'background',
                            backgroundColor: '#20c997' // Teal
                        });
                    }
                });
            }
        });

        // 4. PHILIPPINE HOLIDAYS
        const hd = new Holidays('PH');
        const holidays = hd.getHolidays(startRange.getFullYear());
        
        holidays.forEach(h => {
            const hDate = new Date(h.date);
            if (hDate >= startRange && hDate <= endRange) {
                events.push({
                    title: `🇵🇭 ${h.name}`,
                    start: h.date,
                    allDay: true,
                    color: '#6f42c1', // Purple
                    textColor: 'white'
                });
            }
        });

        res.json(events);

    } catch (error) {
        console.error("Calendar Error:", error);
        res.status(500).json([]);
    }
};


// @desc    Get Busy Times for a Specific Room (For User UI)
// @route   GET /api/v1/room/:id/busy-times
exports.getRoomBusyTimes = async (req, res) => {
    try {
        const { id } = req.params;
        const { date } = req.query; // Format: YYYY-MM-DD

        // Find bookings for this room that overlap with the selected date
        // We look for bookings that start OR end on this day
        const startOfDay = new Date(`${date}T00:00:00.000Z`);
        const endOfDay = new Date(`${date}T23:59:59.999Z`);

        const bookings = await Booking.find({
            room: id,
            status: { $ne: 'cancelled' },
            $or: [
                { checkInDate: { $gte: startOfDay, $lte: endOfDay } },
                { checkOutDate: { $gte: startOfDay, $lte: endOfDay } },
                // Also cover bookings that span across this entire day
                { checkInDate: { $lt: startOfDay }, checkOutDate: { $gt: endOfDay } }
            ]
        });

        // Map to ranges for Flatpickr
        const disableRanges = bookings.map(b => {
            return {
                from: b.checkInDate,
                to: b.checkOutDate // Room is busy until checkout
            };
        });

        res.json(disableRanges);

    } catch (error) {
        console.error(error);
        res.status(500).json([]);
    }
};