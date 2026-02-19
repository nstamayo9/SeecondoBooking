const { body, validationResult } = require('express-validator');

const updateBookingStatusValidationRules = () => {
  return [
    body('bookingId').notEmpty().withMessage('Booking ID is required'),
    body('status').isIn(['pending', 'confirmed', 'completed', 'cancelled']).withMessage('Invalid status'),
    body('paymentStatus').isIn(['unpaid', 'partial', 'paid', 'refunded']).withMessage('Invalid payment status')
  ];
};

const updateBookingDetailsValidationRules = () => {
    return [
        body('bookingId').notEmpty().withMessage('Booking ID is required'),
        body('guestFirstName').notEmpty().withMessage('Guest First Name is required'),
        body('guestLastName').notEmpty().withMessage('Guest Last Name is required'),
        body('guestPhone').notEmpty().withMessage('Guest Phone is required'),
        body('guests').isInt({ min: 1 }).withMessage('Number of guests must be at least 1'),
        // Add more validation rules for other fields as needed
    ];
};

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) {
    return next();
  }

  const extractedErrors = [];
  errors.array().map(err => extractedErrors.push({ [err.param]: err.msg }));

  return res.status(422).json({
    errors: extractedErrors,
  });
};

module.exports = {
  updateBookingStatusValidationRules,
  updateBookingDetailsValidationRules,
  validate,
};