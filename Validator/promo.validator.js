const { body, validationResult } = require('express-validator');

const createPromoValidationRules = () => {
  return [
    body('code').notEmpty().withMessage('Promo code is required'),
    body('name').notEmpty().withMessage('Promo name is required'),
    body('type').isIn(['percentage', 'fixed', 'extension']).withMessage('Invalid promo type'),
    body('value').isNumeric().withMessage('Promo value must be a number')
  ];
};

const updatePromoValidationRules = () => {
  return [
    body('code').notEmpty().withMessage('Promo code is required'),
    body('name').notEmpty().withMessage('Promo name is required'),
    body('type').isIn(['percentage', 'fixed', 'extension']).withMessage('Invalid promo type'),
    body('value').isNumeric().withMessage('Promo value must be a number')
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
  createPromoValidationRules,
  updatePromoValidationRules,
  validate,
};