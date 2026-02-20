const mongoose = require("mongoose");
const { Schema } = mongoose;
const Listing = require("./listing");

const storeSchema = new Schema({
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },

  shopName: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },

  slug: { type: String, unique: true },

  description: String,

  shopBanner: {
    type: String,
    default: "/images/default-shop-banner.jpg",
  },

  shopLogo: {
    type: String,
    default: "/images/default-shop-logo.png",
  },

  address: String,
  phone: String,

  isApproved: { type: Boolean, default: false },

  rating: { type: Number, default: 0 },
  totalReviews: { type: Number, default: 0 },

  badge: {
    type: String,
    enum: ["Bronze", "Silver", "Gold", "Platinum"],
    default: "Bronze",
  },

  shopCoins: {
    type: Number,
    default: 0,
  },

  promotionPoints: {
    type: Number,
    default: 0,
  },

  tailorType: {
    type: String,
    enum: ["Boutique", "Home Tailor", "Designer Studio"],
    default: "Home Tailor",
  },

  servicesOffered: [{
    type: String,
    enum: ["Rental", "Custom Stitching", "Alteration"],
  }],

  workingDays: [{ type: String }],

  workingHours: {
    open: String,
    close: String,
  },

  averageStitchingTime: {
    type: Number,
    default: 3,
  },

  productionCapacityPerDay: {
    type: Number,
    default: 20,
  },

  activeOrderCount: {
    type: Number,
    default: 0,
  },
}, { timestamps: true });

// Cascade delete — remove listings when store is deleted
storeSchema.pre("findOneAndDelete", async function (next) {
  const store = await this.model.findOne(this.getQuery());
  if (!store) return next();
  await Listing.deleteMany({ store: store._id });
  next();
});

module.exports = mongoose.model("Store", storeSchema);
