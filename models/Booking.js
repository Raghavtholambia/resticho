const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Listing",
      required: true,
      index: true
    },

    renterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    startDate: {
      type: Date,
      required: true
    },

    endDate: {
      type: Date,
      required: true
    },

    // ⭐ NEW: Customer Measurements (Flexible Map)
    measurements: {
      type: Map,
      of: Number // e.g., { "Chest": 40, "Waist": 32 }
    },

    // ⭐ NEW: Selected Customization Options
    selectedFabric: String,
    selectedSize: {
      type: String,
      enum: ["XS", "S", "M", "L", "XL", "XXL"],
    },
    selectedVariants: {
      type: Map,
      of: String // e.g., { "Collar": "Mandarin" }
    },

    // ⭐ NEW: Order Lifecycle Status
    orderStatus: {
      type: String,
      enum: [
        'pending_measurements',
        'confirmed',
        'in_stitching',
        'quality_check',
        'ready',
        'delivered',
        'cancelled'
      ],
      default: 'pending_measurements'
    },

    status: {
      type: String,
      enum: ["pending", "confirmed", "cancelled"],
      default: "pending",
      index: true
    },

    // Rental/custom duration (days)
    orderDays: {
      type: Number,
      min: 1,
    },

    // Urgent processing for custom orders
    urgentOrder: {
      type: Boolean,
      default: false,
    },

    urgentCharge: {
      type: Number,
      default: 0,
      min: 0,
    },

    totalPrice: {
      type: Number,
      required: true
    }
  },
  { timestamps: true }
);

/**
 * 🔍 Compound index
 * Improves:
 * - calendar loading
 * - overlap checks
 */
bookingSchema.index({ productId: 1, startDate: 1, endDate: 1 });

module.exports = mongoose.model("Booking", bookingSchema);
