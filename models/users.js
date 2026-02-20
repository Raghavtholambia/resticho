const mongoose = require("mongoose");
const { Schema } = mongoose;
const passportLocalMongoose = require("passport-local-mongoose");

// ================================
// 🪙 SHOP-SPECIFIC COINS (PER USER)
// ================================
const shopCoinSchema = new Schema(
  {
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      required: true,
    },

    storeName: {
      type: String,
      required: true,
    },

    coins: {
      type: Number,
      default: 0,
    },
  },
  { _id: false }
);

// ================================
// 👤 USER SCHEMA
// ================================
const userSchema = new Schema(
  {
    username: { type: String, required: true, unique: true, trim: true },
    email: { type: String, required: true, trim: true },

    role: {
      type: String,
      enum: ["user", "seller", "admin"],
      default: "user",
    },

    googleId: { type: String, unique: true, sparse: true },

    isVerified: { type: Boolean, default: false },
    isBlocked: { type: Boolean, default: false },
    verificationOtp: String,
    otpExpires: Date,

    // PROFILE
    fullName: String,
    bio: String,
    phone: String,
    address: String,

    // LOCATION
    latitude: Number,
    longitude: Number,

    // PROFILE IMAGE
    profileImage: {
      type: String,
      default: "https://cdn-icons-png.flaticon.com/512/149/149071.png",
    },

    // 🪙 PLATFORM COINS (2%)
    ppCoins: {
      type: Number,
      default: 0,
    },

    // 🏪 SHOP-SPECIFIC COINS (5%)
    shopCoins: {
      type: [shopCoinSchema],
      default: [],
    },

    // USER BADGES
    badges: [{ type: String }],

    // PROFILE SCORE
    profileScore: {
      type: Number,
      default: 100,
    },

    // TAILOR PROFILE
    isTailor: {
      type: Boolean,
      default: false,
    },

    tailorExperienceYears: Number,

    specialization: [{ type: String, trim: true }],

    portfolioImages: [{ type: String }],
  },
  { timestamps: true }
);

userSchema.plugin(passportLocalMongoose, { usernameField: "username" });

module.exports = mongoose.model("User", userSchema);
