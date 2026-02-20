// ======================================================
// SELLER ROUTES (FINAL WORKING VERSION)
// ======================================================

const express = require("express");
const router = express.Router();

const Seller = require("../models/seller");
const Store = require("../models/store");
const User = require("../models/users");
const Booking = require("../models/Booking"); // ⭐ Added Booking Model

const { isLoggedIn } = require("../middleware");

// ------------------------------------------------------
// BECOME TAILOR — toggle isTailor & create Store if needed
// ------------------------------------------------------
router.get("/become-tailor", isLoggedIn, async (req, res) => {
  const currUser = req.user;
  const store = await Store.findOne({ owner: currUser._id });
  if (currUser.isTailor && store) {
    return res.redirect("/seller/dashboard");
  }
  res.render("becomeTailor", { currUser, store });
});

router.post("/become-tailor", isLoggedIn, async (req, res) => {
  try {
    const currUser = req.user;
    let store = await Store.findOne({ owner: currUser._id });

    currUser.isTailor = true;
    await currUser.save();

    if (!store) {
      const shopName = req.body.shopName?.trim() || `${currUser.username}'s Tailor`;
      let slug = shopName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      const slugExists = await Store.findOne({ slug });
      if (slugExists) slug += "-" + Date.now();

      store = await Store.create({
        owner: currUser._id,
        shopName,
        slug,
        description: `${shopName} - Tailor Shop`,
        tailorType: req.body.tailorType || "Home Tailor",
        servicesOffered: req.body.servicesOffered ? (Array.isArray(req.body.servicesOffered) ? req.body.servicesOffered : [req.body.servicesOffered]) : ["Custom Stitching"],
      });
    }

    req.flash("success", "You are now a tailor. You can add listings.");
    return res.redirect("/seller/dashboard");
  } catch (err) {
    console.error("Become tailor error:", err);
    req.flash("error", "Could not complete tailor registration.");
    return res.redirect("/seller/become-tailor");
  }
});

// ------------------------------------------------------
// GET seller registration page
// ------------------------------------------------------
router.get("/register", isLoggedIn, async (req, res) => {
  const currUser = req.user;

  // Already a seller → go to dashboard
  if (currUser.role === "seller") {
    return res.redirect("/seller/dashboard");
  }

  res.render("sellerRegister", { currUser });
});

// ------------------------------------------------------
// POST seller registration
// ------------------------------------------------------
router.post("/register", isLoggedIn, async (req, res) => {
  try {
    const {
      businessName,
      gstNumber,
      shopAddress,
      city,
      state,
      country,
      pincode,
      contactNumber,
      businessEmail,
      bankAccountNumber,
      ifscCode,
    } = req.body;

    const currUser = req.user;

    // Prevent Duplicate Seller
    const existingSeller = await Seller.findOne({ user: currUser._id });
    if (existingSeller) return res.redirect("/seller/dashboard");

    // 1️⃣ Create Seller Profile
    await Seller.create({
      user: currUser._id,
      businessName,
      gstNumber,
      shopAddress,
      city,
      state,
      country,
      pincode,
      contactNumber,
      businessEmail,
      bankAccountNumber,
      ifscCode,
    });

    // 2️⃣ Create Store
    let slug = businessName.toLowerCase().replace(/\s+/g, "-");

    // If another same slug exists, append unique number
    const slugExists = await Store.findOne({ slug });
    if (slugExists) slug += "-" + Date.now();

    await Store.create({
      owner: currUser._id,
      shopName: businessName,
      slug,
      address: shopAddress,
      phone: contactNumber,
      description: `${businessName} official rental store`,
    });

    // ---------------------------------------------------
    // 3️⃣ Update User Role → seller (correct method)
    // ---------------------------------------------------
    currUser.role = "seller";
    await currUser.save();

    req.login(currUser, (err) => {
      if (err) console.log(err);
      return res.redirect("/seller/dashboard");
    });

  } catch (err) {
    console.error("❌ Error registering seller:", err);
    return res.status(500).send("Error registering seller");
  }
});

// ------------------------------------------------------
// SELLER DASHBOARD
// ------------------------------------------------------
const Listing = require("../models/listing");

router.get("/dashboard", isLoggedIn, async (req, res) => {
  const currUser = req.user;

  if (currUser.role !== "seller" && !currUser.isTailor) {
    return res.redirect("/profile");
  }

  const seller = await Seller.findOne({ user: currUser._id });
  const store = await Store.findOne({ owner: currUser._id });

  let totalRevenue = 0;
  let totalOrders = 0;
  let activeOrders = 0;
  let monthlyRevenue = 0;
  let orders = [];
  let lowStockListings = [];

  if (store) {
    const allBookings = await Booking.find({ ownerId: currUser._id }).lean();
    totalOrders = allBookings.length;
    totalRevenue = allBookings.reduce((sum, b) => sum + (b.totalPrice || 0), 0);
    const activeStatuses = ["pending_measurements", "confirmed", "in_stitching", "quality_check", "ready"];
    activeOrders = allBookings.filter(
      (b) => activeStatuses.includes(b.orderStatus) && b.status !== "cancelled"
    ).length;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    monthlyRevenue = allBookings
      .filter((b) => b.createdAt >= startOfMonth && b.status !== "cancelled")
      .reduce((sum, b) => sum + (b.totalPrice || 0), 0);

    orders = await Booking.find({ ownerId: currUser._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate("productId", "itemName image businessMode")
      .populate("renterId", "username email")
      .lean();

    lowStockListings = await Listing.find({
      store: store._id,
      totalStock: { $gt: 0, $lt: 3 },
    })
      .select("itemName sizeInventory totalStock image")
      .lean();
  }

  res.render("sellerDashboard", {
    currUser,
    seller,
    store,
    totalRevenue,
    monthlyRevenue,
    totalOrders,
    activeOrders,
    orders,
    lowStockListings,
    success: req.flash("success"),
    error: req.flash("error"),
  });
});

// ------------------------------------------------------
// SELLER ORDERS MANAGEMENT
// ------------------------------------------------------
router.get("/orders", isLoggedIn, async (req, res) => {
  const currUser = req.user;

  if (currUser.role !== "seller" && !currUser.isTailor) {
    return res.redirect("/profile");
  }

  try {
    const orders = await Booking.find({ ownerId: currUser._id })
      .populate('productId', 'itemName image businessMode')
      .populate('renterId', 'username email')
      .sort({ createdAt: -1 });

    res.render("sellerOrders", { 
      currUser, 
      orders,
      success: req.flash("success"),
      error: req.flash("error")
    });
  } catch (err) {
    console.error("Error fetching orders:", err);
    req.flash("error", "Could not load orders.");
    res.redirect("/seller/dashboard");
  }
});

module.exports = router;
