const Rental = require("../models/rental");
const Listing = require("../models/listing");
const ShopCoin = require("../models/ShopCoin");
const Transaction = require("../models/Transactions"); // Fixed path (plural)
const Store = require("../models/store");
const User = require("../models/users");
const badgeController = require("./badgeController");

// Create a new rental (user rents an item)
module.exports.createRental = async (req, res) => {
  try {
    const { listingId, days } = req.body;
    const renterId = req.user._id;

    // 1️⃣ Fetch listing
    const listing = await Listing.findById(listingId).populate("store");

    if (!listing) {
      req.flash("error", "Listing not found");
      return res.redirect("back");
    }

    const store = listing.store;

    const pricePerDay = (listing.pricing && listing.pricing.rentalPricePerDay) || 0;
    const totalPrice = pricePerDay * days;

    const rental = await Rental.create({
      item: listing._id,
      store: store._id,
      renter: renterId,
      days,
      pricePerDay,
      totalPrice,
    });

    // 4️⃣ ⭐ EARN STORE COINS (SC)
    const scCoins = totalPrice; // 1₹ = 1 SC

    let shopCoin = await ShopCoin.findOne({ user: renterId, store: store._id });
    if (!shopCoin) {
      shopCoin = new ShopCoin({ user: renterId, store: store._id, coins: 0 });
    }
    shopCoin.coins += scCoins;
    await shopCoin.save();

    // Transaction log
    await Transaction.create({
      user: renterId,
      store: store._id,
      listing: listing._id, // Added required field
      type: "coins-earned", // Changed from "EARN_SC" to match schema enum
      amount: scCoins,
      // description not in schema, removing or ignoring (schema validation might fail if strict)
    });

    rental.coinsEarned.sc = scCoins;

    // 5️⃣ ⭐ EARN PERSONAL COINS (PC)
    const pcCoins = Math.floor(totalPrice * 0.05);
    const user = await User.findById(renterId);
    user.personalCoins = (user.personalCoins || 0) + pcCoins; // Safety check
    await user.save();

    // Transaction log
    await Transaction.create({
      user: renterId,
      store: store._id, // Schema requires store
      listing: listing._id, // Schema requires listing
      type: "coins-earned",
      amount: pcCoins,
    });

    rental.coinsEarned.pc = pcCoins;

    // 6️⃣ ⭐ GIVE PP TO SELLER
    const ppEarned = Math.floor(totalPrice * 0.1);
    const sellerStore = await Store.findById(store._id);
    sellerStore.promotionPoints = (sellerStore.promotionPoints || 0) + ppEarned;
    await sellerStore.save();

    // Transaction log for PP (Transaction schema requires user, store, listing)
    // We'll map it to the renter user for now as the 'trigger'
    await Transaction.create({
      user: renterId,
      store: store._id,
      listing: listing._id,
      type: "coins-earned",
      amount: ppEarned,
    });

    await rental.save();

    req.flash(
      "success",
      `Rental successful! You earned ${scCoins} SC, ${pcCoins} PC. Seller earned ${ppEarned} PP.`
    );
    res.redirect("/rentals/history");
  } catch (err) {
    console.error("Error creating rental:", err);
    req.flash("error", "Something went wrong during rental.");
    res.redirect("back");
  }
};

const Booking = require("../models/Booking"); // ⭐ Added Booking

// View rental history for a user
module.exports.getRentalHistory = async (req, res) => {
  try {
    // 1. Fetch Legacy Rentals
    const rentals = await Rental.find({ renter: req.user._id })
      .populate("item")
      .populate("store")
      .lean();

    // 2. Fetch New Bookings (Tailoring & Rentals)
    const bookings = await Booking.find({ renterId: req.user._id })
      .populate("productId")
      .lean();

    // 3. Normalize & Merge
    // We want a unified list. 
    // Rentals have 'item', Bookings have 'productId'.
    // We can map them or just pass both and let EJS handle it (as I did in EJS).

    // Let's combine them into one array for sorting
    const history = [
      ...rentals.map(r => ({ ...r, type: 'rental_legacy', createdAt: r.createdAt })),
      ...bookings.map(b => ({ ...b, type: 'booking', createdAt: b.createdAt }))
    ];

    // Sort by recent first
    history.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.render("rentals/history", { rentals: history });
  } catch (err) {
    console.error(err);
    req.flash("error", "Cannot fetch order history");
    res.redirect("back");
  }
};


// Example: marking rental as completed
module.exports.completeRental = async (req, res) => {
  try {
    const { rentalId } = req.params;
    const rental = await Rental.findById(rentalId);

    if (!rental) {
      req.flash("error", "Rental not found");
      return res.redirect("back");
    }

    rental.status = "completed";
    await rental.save();

    // Update user & seller badges automatically
    await badgeController.updateUserBadges(rental.renter);
    await badgeController.updateSellerBadges(rental.store);

    req.flash("success", "Rental completed and badges updated!");
    res.redirect("/rentals/history");

  } catch (err) {
    console.error(err);
    req.flash("error", "Error completing rental");
    res.redirect("back");
  }
};
