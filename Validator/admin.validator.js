const { body, validationResult } = require('express-validator');

// Validation rules for creating a user
const createUserValidationRules = () => {
  return [
    body('firstName').notEmpty().withMessage('First name is required'),
    body('lastName').notEmpty().withMessage('Last name is required'),
    body('username').notEmpty().withMessage('Username is required'),
    body('email').isEmail().withMessage('Invalid email address'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long'),
    body('role').isIn(['user', 'staff', 'manager', 'admin', 'superadmin']).withMessage('Invalid role')
  ];
};

// Validation rules for updating a user
const updateUserValidationRules = () => {
  return [
    body('firstName').notEmpty().withMessage('First name is required'),
    body('lastName').notEmpty().withMessage('Last name is required'),
    body('email').isEmail().withMessage('Invalid email address'),
    body('role').isIn(['user', 'staff', 'manager', 'admin', 'superadmin']).withMessage('Invalid role')
  ];
};

const siteConfigValidationRules = () => {
    return [
        body('heroTitle').notEmpty().withMessage('Hero Title is required'),
        body('contactNumber').notEmpty().withMessage('Contact Number is required'),
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
  createUserValidationRules,
  updateUserValidationRules,
  siteConfigValidationRules,
  validate,
};