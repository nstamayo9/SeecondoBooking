const Promotion = require('../models/Promotion.model');
const Booking = require('../models/Booking.model'); // Import Booking
const User = require('../models/User.model');       // Import User

exports.validatePromo = async (req, res) => {
    try {
        const { code, roomId, totalAmount, checkInDate, pricePerNight, nights, email, bookingId } = req.body;

        // 1. Find Promo
        const promo = await Promotion.findOne({ 
            code: code.toUpperCase(), 
            isActive: true 
        });

        if (!promo) {
            return res.json({ success: false, message: 'Invalid or inactive promo code.' });
        }

        // 2. Room Validation
        if (promo.applicableRooms && promo.applicableRooms.length > 0) {
            if (!promo.applicableRooms.includes(roomId)) {
                return res.json({ success: false, message: 'Promo not applicable to this room.' });
            }
        }

        // ====================================================
        // 3. RESTRICTED EMAIL & ONE-TIME USE LOGIC
        // ====================================================
        if (promo.allowedEmails && promo.allowedEmails.length > 0) {
            
            // A. Check if email is provided
            if (!email) {
                return res.json({ success: false, message: 'Please enter your email address to use this code.' });
            }
            
            const userEmail = email.toLowerCase().trim();

            // B. Check if email is in the allowed list
            if (!promo.allowedEmails.includes(userEmail)) {
                return res.json({ success: false, message: 'This promo code is not valid for your email address.' });
            }

            // C. CHECK FOR PRIOR USAGE (One-Time Use)
            // Find the user ID associated with this email
            const user = await User.findOne({ email: userEmail });
            
            if (user) {
                // Count bookings with this promo and this user
                const usageCount = await Booking.countDocuments({
                    promoApplied: promo._id,
                    user: user._id,
                    status: { $in: ['confirmed', 'completed', 'pending'] }, // Only count active bookings
                    _id: { $ne: bookingId } // Exclude the current booking if we are editing it
                });

                if (usageCount > 0) {
                    return res.json({ success: false, message: 'This code has already been used by this account.' });
                }
            }
        }
        // ====================================================

        // 4. CALCULATE DISCOUNT
        let discountAmount = 0;
        let message = 'Promo applied!';
        
        const getLocalYMD = (d) => {
            const offset = d.getTimezoneOffset();
            const local = new Date(d.getTime() - (offset*60*1000));
            return local.toISOString().split('T')[0];
        };

        if (promo.eligibleDates && promo.eligibleDates.length > 0) {
            if (promo.type === 'extension') {
                let freeNights = 0;
                let i = 0; 
                while (i < nights) {
                    let currentNight = new Date(checkInDate);
                    currentNight.setDate(currentNight.getDate() + i);
                    let dateStr = getLocalYMD(currentNight);

                    if (promo.eligibleDates.includes(dateStr)) {
                        if (i + 1 < nights) {
                            freeNights++;
                            i += 2; 
                            continue; 
                        } else {
                            if (nights === 1) {
                                return res.json({ 
                                    success: true, 
                                    message: "B1T1 Eligible: Extending stay...", 
                                    discountAmount: 0, 
                                    promoId: promo._id,
                                    action: 'extend' 
                                });
                            }
                        }
                    }
                    i++; 
                }

                if (freeNights > 0) {
                    discountAmount = freeNights * parseFloat(pricePerNight);
                    message = `B1T1 Applied: ${freeNights} Free Night(s) deducted.`;
                } else {
                    return res.json({ success: false, message: `Promo not applicable to dates selected.` });
                }
            } else {
                let currentNight = new Date(checkInDate);
                let validNightsCount = 0;
                for (let i = 0; i < nights; i++) {
                    const dateStr = getLocalYMD(currentNight);
                    if (promo.eligibleDates.includes(dateStr)) {
                        validNightsCount++;
                        if (promo.type === 'percentage') {
                            discountAmount += (parseFloat(pricePerNight) * (promo.discountValue / 100));
                        } else if (promo.type === 'fixed') {
                            discountAmount += promo.discountValue; 
                        }
                    }
                    currentNight.setDate(currentNight.getDate() + 1);
                }
                if (validNightsCount === 0) return res.json({ success: false, message: 'No eligible dates found.' });
                message = `Promo applied to ${validNightsCount} of ${nights} nights.`;
            }

        } else {
            if (promo.startDate && promo.endDate) {
                const bookingDate = new Date(checkInDate);
                if (bookingDate < promo.startDate || bookingDate > promo.endDate) {
                    return res.json({ success: false, message: 'Promo expired.' });
                }
            }
            if (promo.type === 'percentage') discountAmount = (parseFloat(totalAmount) * promo.discountValue) / 100;
            else if (promo.type === 'fixed') discountAmount = promo.discountValue;
            else if (promo.type === 'extension') {
                discountAmount = parseFloat(pricePerNight);
                message = "Buy 1 Take 1 Applied: 1 Night Free";
            }
        }

        if (discountAmount > totalAmount) {
            discountAmount = totalAmount;
        }
        
        res.json({
            success: true,
            message: message,
            discountAmount: parseFloat(discountAmount),
            promoId: promo._id
        });

    } catch (error) {
        console.error("Promo Validation Error:", error);
        res.status(500).json({ success: false, message: 'Server error validating promo.' });
    }
};