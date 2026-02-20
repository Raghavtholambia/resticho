const mongoose = require("mongoose");
const { Schema } = mongoose;

const transactionSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    store: {
      type: Schema.Types.ObjectId,
      ref: "Store",
      required: true
    },

    listing: {
      type: Schema.Types.ObjectId,
      ref: "Listing",
      required: true
    },

    amount: {
      type: Number,
      required: true
    },

    type: {
      type: String,
      enum: [
        "payment-upi",
        "payment-card",
        "payment-cod",
        "refund",
        "coins-used",
        "coins-earned"
      ],
      required: true
    },

    date: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

/* Indexes for performance */
transactionSchema.index({ user: 1 });
transactionSchema.index({ date: -1 });

module.exports = mongoose.model("Transaction", transactionSchema);
