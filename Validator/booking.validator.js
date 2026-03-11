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
        body('guestFirstName').trim().notEmpty().withMessage('First Name is required'),
        body('guestLastName').trim().notEmpty().withMessage('Last Name is required'),
        body('guestPhone').notEmpty().withMessage('Phone is required'),
        body('guestDateOfBirth').optional({ checkFalsy: true }).isDate().withMessage('Invalid Birth Date'),
        body('guests').isInt({ min: 1 }).withMessage('At least 1 guest required'),
        
        // Validation for Companions (if they exist)
        body('compName.*').optional().trim().notEmpty().withMessage('Companion name cannot be empty'),
        body('compDateOfBirth.*').optional({ checkFalsy: true }).isDate().withMessage('Invalid companion birth date'),
    ];
};

const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (errors.isEmpty()) {
        return next();
    }

    // If it's an AJAX request, send JSON. If it's a Form submit, redirect.
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
        return res.status(422).json({ errors: errors.array() });
    }

    // For standard form submissions:
    const errorMsgs = errors.array().map(err => err.msg).join(', ');
    console.error("Validation Errors:", errorMsgs);
    
    // If you use connect-flash:
    // req.flash('error', errorMsgs); 
    // res.redirect('back');
    
    // Or just a simple alert-style response:
    return res.status(422).send(`
        <script>
            alert("Validation Error: ${errorMsgs}");
            window.history.back();
        </script>
    `);
};
module.exports = {
  updateBookingStatusValidationRules,
  updateBookingDetailsValidationRules,
  validate,
};