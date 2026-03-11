const { body, validationResult } = require('express-validator');

const createRoomValidationRules = () => {
  return [
    body('name').notEmpty().withMessage('Room name is required'),
    body('description').notEmpty().withMessage('Description is required'),
    body('pricePerNight').isNumeric().withMessage('Price per night must be a number'),
    body('capacity').isInt({ min: 1 }).withMessage('Capacity must be a positive integer'),
    body('category').isIn(['Studio', '1BR', '2BR', '3BR', '4BR', 'Penthouse']).withMessage('Invalid category')
  ];
};

const updateRoomValidationRules = () => {
  return [
    body('name').notEmpty().withMessage('Room name is required'),
    body('description').notEmpty().withMessage('Description is required'),
    body('pricePerNight').isNumeric().withMessage('Price per night must be a number'),
    body('capacity').isInt({ min: 1 }).withMessage('Capacity must be a positive integer'),
    body('category').isIn(['Studio', '1BR', '2BR', '3BR', '4BR', 'Penthouse']).withMessage('Invalid category')
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
  createRoomValidationRules,
  updateRoomValidationRules,
  validate,
};