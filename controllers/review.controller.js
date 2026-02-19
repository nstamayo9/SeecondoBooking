const Review = require('../models/Review.model');
const Booking = require('../models/Booking.model');

exports.createReview = async (req, res) => {
    try {
        const { bookingId, rating, comment } = req.body;
        const userId = req.user._id;

        // 1. Verify Booking
        // Ensure the booking exists, belongs to the user, and is 'completed'
        const booking = await Booking.findOne({ 
            _id: bookingId, 
            user: userId, 
            status: 'completed' 
        });

        if (!booking) {
            return res.status(400).send('<script>alert("Invalid booking or stay not completed yet."); window.location="/dashboard";</script>');
        }

        // 2. Check for Duplicate Review
        const existingReview = await Review.findOne({ booking: bookingId });
        if (existingReview) {
            return res.status(400).send('<script>alert("You have already reviewed this stay."); window.location="/dashboard";</script>');
        }

        // 3. Create Review
        await Review.create({
            user: userId,
            booking: bookingId,
            rating: parseInt(rating),
            comment: comment,
            isVisible: true // Auto-approve reviews (or set false to require admin approval)
        });

        res.redirect('/dashboard?message=ReviewSubmitted');

    } catch (error) {
        console.error("Review Error:", error);
        res.status(500).send("Server Error submitting review.");
    }
};