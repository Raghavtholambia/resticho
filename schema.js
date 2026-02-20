const Joi = require("joi");

const categoryEnum = [
  "Men Ethnic",
  "Women Ethnic",
  "Western Wear",
  "Kids Wear",
  "Wedding Wear",
  "Designer",
  "Accessories",
];

const businessModeEnum = ["rental", "custom", "both"];

module.exports.listingSchema = Joi.object({
  listing: Joi.object({
    category: Joi.string().valid(...categoryEnum).required(),
    itemName: Joi.string().required(),
    description: Joi.string().allow(""),
    image: Joi.object({
      url: Joi.string().uri().allow(""),
      filename: Joi.string().allow(""),
    }).optional(),
    businessMode: Joi.string().valid(...businessModeEnum).required(),
    pricing: Joi.object({
      rentalPricePerDay: Joi.number().min(0).optional(),
      stitchingBasePrice: Joi.number().min(0).optional(),
      securityDeposit: Joi.number().min(0).optional(),
    }).optional(),
    measurementFields: Joi.array()
      .items(
        Joi.object({
          name: Joi.string().trim(),
          required: Joi.boolean(),
        })
      )
      .optional(),
    measurementFieldsRaw: Joi.string().allow("").optional(),
    stock: Joi.object({
      totalQuantity: Joi.number().integer().min(0).optional(),
      availableQuantity: Joi.number().integer().min(0).optional(),
    }).optional(),
    stitchingDurationDays: Joi.number().integer().min(1).optional(),
    occasions: Joi.array().items(Joi.string().trim()).optional(),
    fabricOptions: Joi.array().items(Joi.string()).optional(),
    sizeOptions: Joi.array().items(Joi.string()).optional(),
    fabricPricing: Joi.object().pattern(Joi.string(), Joi.number()).optional(),
  }).required(),
});

module.exports.reviewSchema = Joi.object({
  review: Joi.object({
    rating: Joi.number().required().min(1).max(5),
    comments: Joi.string().required(),
  }).required(),
});
