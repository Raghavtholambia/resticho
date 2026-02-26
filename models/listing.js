const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const reviews = require('./review');
const User = require("./users");

const listingSchema = new Schema({
  category: {
    type: String,
    enum: [
      "Men Ethnic",
      "Women Ethnic",
      "Western Wear",
      "Kids Wear",
      "Wedding Wear",
      "Designer",
      "Accessories"
    ],
    required: true,
  },

  itemName: {
    type: String,
    required: true,
  },

  businessMode: {
    type: String,
    enum: ["rental", "custom", "both"],
    required: true,
  },

  description: String,

images: [
  {
    url: String,
    filename: String,
    label: {
      type: String,
      enum: ["front", "back", "side", "full"],
    },
  }
],

  pricing: {
    rentalPricePerDay: { type: Number, default: 0 },
    stitchingBasePrice: { type: Number, default: 0 },
    securityDeposit: { type: Number, default: 0 },
  },

  measurementFields: [{
    name: { type: String, trim: true },
    required: { type: Boolean, default: false },
  }],

  // Size-based inventory (per size quantities)
  sizeInventory: [
    {
      size: {
        type: String,
        enum: ["XS", "S", "M", "L", "XL", "XXL"],
        required: true,
      },
      totalQuantity: {
        type: Number,
        default: 0,
        min: 0,
      },
      availableQuantity: {
        type: Number,
        default: 0,
        min: 0,
      },
    },
  ],

  // Cached total available stock across all sizes
  totalStock: {
    type: Number,
    default: 0,
    min: 0,
  },

  stitchingDurationDays: {
    type: Number,
    default: 3,
  },

  occasions: [{ type: String, trim: true }],

  fabricPricing: {
    type: Map,
    of: Number,
    default: {},
  },

  // Legacy fabric/size options for backward compatibility and UI
  fabricOptions: [{ type: String, trim: true }],
  sizeOptions: [{ type: String, trim: true }],

  reviews: [{
    type: Schema.Types.ObjectId,
    ref: "reviews",
  }],

  owner: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },

  averageRating: {
    type: Number,
    default: 0,
  },

  store: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Store",
  },

  verifiedByAdmin: {
    type: Boolean,
    
  },

  rejectedByAdmin: {
    type: Boolean,
    default: false,
  },

  // Seller can hide listing from store/catalog (still visible to seller in dashboard)
  isActive: {
    type: Boolean,
    default: true,
  },
  
}, { timestamps: true });

// Indexes for fast size-based queries / updates
listingSchema.index({ "sizeInventory.size": 1 });
listingSchema.index({ _id: 1, "sizeInventory.size": 1 });

// Ensure pricing and inventory are always numbers (form may send strings)
listingSchema.pre("save", function (next) {
  const toNum = (v) => (v != null && !Number.isNaN(Number(v)) ? Number(v) : 0);
  if (this.pricing && typeof this.pricing === "object") {
    this.pricing.rentalPricePerDay = toNum(this.pricing.rentalPricePerDay);
    this.pricing.stitchingBasePrice = toNum(this.pricing.stitchingBasePrice);
    this.pricing.securityDeposit = toNum(this.pricing.securityDeposit);
  } else {
    this.pricing = { rentalPricePerDay: 0, stitchingBasePrice: 0, securityDeposit: 0 };
  }

  // Normalize sizeInventory and compute totalStock
  if (!Array.isArray(this.sizeInventory)) {
    this.sizeInventory = [];
  }

  this.sizeInventory = this.sizeInventory
    .filter((row) => row && row.size)
    .map((row) => {
      const total = Math.max(0, parseInt(row.totalQuantity, 10) || 0);
      let available = Math.max(0, toNum(row.availableQuantity));
      if (available > total) available = total;
      return {
        size: row.size,
        totalQuantity: total,
        availableQuantity: available,
      };
    });
// TEXT SEARCH INDEX
listingSchema.index({
  itemName: "text",
  description: "text",
  category: "text"
});

// PERFORMANCE INDEXES
listingSchema.index({ businessMode: 1, category: 1, averageRating: -1 });
listingSchema.index({ "pricing.rentalPricePerDay": 1 });
listingSchema.index({ averageRating: -1 });
listingSchema.index({ createdAt: -1 });
  // Auto-fill availableQuantity = totalQuantity when only total is provided
  this.sizeInventory = this.sizeInventory.map((row) => {
    if (row.totalQuantity > 0 && (row.availableQuantity == null || row.availableQuantity === 0)) {
      return { ...row, availableQuantity: row.totalQuantity };
    }
    return row;
  });

  // Compute cached totalStock as sum of availableQuantity
  this.totalStock = this.sizeInventory.reduce(
    (sum, row) => sum + (row.availableQuantity || 0),
    0
  );

  next();
});

// Delete reviews when listing deleted
listingSchema.post("findOneAndDelete", async (listing) => {
  if (listing) {
    await reviews.deleteMany({ _id: { $in: listing.reviews } });
  }
});

listingSchema.methods.updateAverageRating = async function () {
  await this.populate("reviews");
  if (!this.reviews.length) {
    this.averageRating = 0;
  } else {
    const total = this.reviews.reduce((sum, r) => sum + r.rating, 0);
    this.averageRating = (total / this.reviews.length).toFixed(1);
  }
  await this.save();
};

// Auto-remove listings whose owner no longer exists
listingSchema.post("find", async function (listings) {
  const Listing = mongoose.model("Listing");
  for (let listing of listings) {
    if (!listing.owner) continue;
    const userExists = await User.findById(listing.owner);
    const listingExists = await Listing.findById(listing._id);
    if (!userExists || !listingExists) {
      await Listing.findByIdAndDelete(listing._id);
      console.log(`⛔ Deleted listing ${listing._id} — owner not found`);
    }
  }
});

const Listing = mongoose.model("Listing", listingSchema);
module.exports = Listing;
