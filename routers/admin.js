const express = require('express');
const router = express.Router();
const Listing = require('../models/listing');
const Review = require('../models/review');
const User = require('../models/users');
const Store = require('../models/store');
const Booking = require('../models/Booking');
const { isAdmin } = require('../middleware');

// ------------------------------
// RESOURCE CHECK
// ------------------------------
router.get("/resouce", (req, res) => {
  if (req.user && req.user.role === "user") return res.redirect("/listing");
  res.render(res);
});

// ------------------------------
// ADMIN DASHBOARD
// ------------------------------
router.get("/admin", isAdmin, async (req, res) => {
  const usersCount = await User.countDocuments({ role: "user" });
  const sellersCount = await User.countDocuments({ role: "seller" });
  const totalUsers = await User.countDocuments();
  const totalTailors = await User.countDocuments({ $or: [{ role: "seller" }, { isTailor: true }] });
  const listingsCount = await Listing.countDocuments();
  const reviewsCount = await Review.countDocuments();

  const [revenueAgg] = await Booking.aggregate([
    { $match: { status: "confirmed" } },
    { $group: { _id: null, total: { $sum: "$totalPrice" } } },
  ]);
  const totalRevenue = revenueAgg ? revenueAgg.total : 0;
  const platformCommission = Math.round(totalRevenue * 0.05);

  const users = await User.find({}).select("username email role isVerified isTailor isBlocked").limit(200).lean();
  const sellers = await User.find({ role: "seller" });
  const stores = await Store.find({}).populate("owner", "username email").lean();
  const listings = await Listing.find({}).populate("store", "shopName").populate("owner", "username").limit(200).lean();

  const pendingListings = await Listing.find({
    verifiedByAdmin: false,
    rejectedByAdmin: { $ne: true },
  })
    .populate("owner");

  const bookings = await Booking.find({})
    .sort({ createdAt: -1 })
    .limit(100)
    .populate("productId", "itemName businessMode")
    .populate("renterId", "username email")
    .populate("ownerId", "username")
    .lean();

  res.render("admin/dashboard", {
    usersCount,
    sellersCount,
    listingsCount,
    reviewsCount,
    totalUsers,
    totalTailors,
    totalRevenue,
    platformCommission,
    users,
    sellers,
    stores,
    listings,
    pendingListings,
    bookings,
    success: req.flash("success"),
    error: req.flash("error"),
  });
});

// ------------------------------
// DELETE USER
// ------------------------------
router.delete("/admin/users/:id", isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await User.findByIdAndDelete(id);

    await Listing.deleteMany({ owner: id });
    await Review.deleteMany({ author: id });

    res.json({ success: true, id });
  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, error: "Failed to delete user" });
  }
});

// ------------------------------
// VIEW USER PROFILE
// ------------------------------
router.get("/admin/user/:id", isAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.redirect("/admin");

    res.render("profile", { currUser: user });
  } catch (err) {
    console.log(err);
    res.redirect("/admin");
  }
});

// ------------------------------
// APPROVE LISTING
// ------------------------------
router.post("/admin/listings/:id/approve", isAdmin, async (req, res) => {
  try {
    const listing = await Listing.findByIdAndUpdate(
      req.params.id,
      { verifiedByAdmin: true, rejectedByAdmin: false },
      { new: true }
    );
    console.log(listing);
    if (!listing) return res.status(404).send("Listing not found");
    res.redirect("/admin");
  } catch (err) {
    console.log(err);
    res.status(500).send("Server error");
  }
});

// ------------------------------
// REJECT LISTING
// ------------------------------
router.post("/admin/listings/:id/reject", isAdmin, async (req, res) => {
  try {
    const listing = await Listing.findByIdAndUpdate(
      req.params.id,
      { rejectedByAdmin: true },
      { new: true }
    );
    if (!listing) return res.status(404).send("Listing not found");
    res.redirect("/admin");
  } catch (err) {
    console.log(err);
    res.status(500).send("Server error");
  }
});

// ------------------------------
// REMOVE LISTING (soft / reject)
// ------------------------------
router.post("/admin/listings/:id/remove", isAdmin, async (req, res) => {
  try {
    await Listing.findByIdAndUpdate(req.params.id, { rejectedByAdmin: true, verifiedByAdmin: false });
    res.redirect("/admin");
  } catch (err) {
    console.log(err);
    res.status(500).send("Server error");
  }
});

// ------------------------------
// BLOCK / UNBLOCK USER
// ------------------------------
router.post("/admin/users/:id/block", isAdmin, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.params.id, { isBlocked: true });
    res.redirect("/admin");
  } catch (err) {
    console.log(err);
    res.status(500).send("Server error");
  }
});

router.post("/admin/users/:id/unblock", isAdmin, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.params.id, { isBlocked: false });
    res.redirect("/admin");
  } catch (err) {
    console.log(err);
    res.status(500).send("Server error");
  }
});

router.post("/admin/users/:id/make-admin", isAdmin, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.params.id, { role: "admin" });
    res.redirect("/admin");
  } catch (err) {
    console.log(err);
    res.status(500).send("Server error");
  }
});

// ------------------------------
// APPROVE / REMOVE STORE
// ------------------------------
router.post("/admin/stores/:id/approve", isAdmin, async (req, res) => {
  try {
    await Store.findByIdAndUpdate(req.params.id, { isApproved: true });
    res.redirect("/admin");
  } catch (err) {
    console.log(err);
    res.status(500).send("Server error");
  }
});

router.post("/admin/stores/:id/remove", isAdmin, async (req, res) => {
  try {
    await Store.findByIdAndDelete(req.params.id);
    res.redirect("/admin");
  } catch (err) {
    console.log(err);
    res.status(500).send("Server error");
  }
});

// ------------------------------
// APPROVE ALL
// ------------------------------
router.get("/admin/approve-all", isAdmin, async (req, res) => {
  await Listing.updateMany({}, { verifiedByAdmin: true });
  res.redirect("/admin");
});

module.exports = router;
