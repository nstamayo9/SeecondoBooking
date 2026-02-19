const moment = require('moment'); // You might need: npm install moment

exports.calculateBookingDetails = (checkInDateStr, checkInTimeStr, room, promo) => {
    // 1. Combine Date and Time into a Javascript Date Object
    // Input: "2024-01-19" and "14:00" -> Date Object
    let checkIn = moment(`${checkInDateStr} ${checkInTimeStr}`, 'YYYY-MM-DD HH:mm').toDate();

    // 2. Determine Duration
    let durationHours = room.standardStayHours; // Default 22 hours

    // 3. Apply Promo Extension (Buy 1 Take 1)
    let promoAppliedName = null;
    let isPromoValid = false;

    if (promo) {
        // Check if Check-In Date is in the eligible list
        const dateString = moment(checkIn).format('YYYY-MM-DD');
        
        if (promo.eligibleDates.includes(dateString)) {
            isPromoValid = true;
            promoAppliedName = promo.name;
            if (promo.type === 'extension') {
                durationHours += promo.extensionHours; // Add 24 hours (or whatever config is)
            }
        }
    }

    // 4. Calculate Checkout Time
    let checkOut = moment(checkIn).add(durationHours, 'hours').toDate();

    // 5. Calculate Buffer End Time (When room is ready for next guest)
    let bufferEnd = moment(checkOut).add(room.cleaningBufferHours, 'hours').toDate();

    return {
        checkIn,
        checkOut,
        bufferEnd,
        durationHours,
        cleaningHours: room.cleaningBufferHours,
        promoAppliedName,
        isPromoValid
    };
};