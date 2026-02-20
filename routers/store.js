const express = require("express");
const router = express.Router({ mergeParams: true });

const Listing = require("../models/listing");
const User = require("../models/users");
const Store = require("../models/store");

const { isLoggedIn } = require("../middleware");

const multer = require("multer");
const { storage } = require("../cloudConfig");  // ← USE YOUR SINGLE STORAGE

const upload = multer({ storage });  // ← ONE uploader


// --------------------------------------------------
// ALL STORES PAGE
// --------------------------------------------------
router.get("/", async (req, res) => {
  try {
    const stores = await Store.find().populate("owner");
    res.render("allStores", { stores, currUser: req.user });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});


// --------------------------------------------------
// UPLOAD BANNER (POST /store/:id/banner)
// --------------------------------------------------
router.post("/:id/banner", isLoggedIn, upload.single("banner"), async (req, res) => {
  try {
    const store = await Store.findById(req.params.id);
    if (!store) return res.status(404).json({ success: false, message: "Store not found" });

    // Auth
    if (req.user._id.toString() !== store.owner.toString() && req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    console.log("Uploaded FILE:", req.file); // DEBUG LINE

    if (!req.file || !req.file.path) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    store.shopBanner = req.file.path;
    await store.save();

    res.json({ success: true, banner: store.shopBanner });
  } catch (err) {
    console.error("Banner error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


// --------------------------------------------------
// UPLOAD LOGO (POST /store/:id/logo)
// --------------------------------------------------
router.post("/:id/logo", isLoggedIn, upload.single("logo"), async (req, res) => {
  try {
    const store = await Store.findById(req.params.id);
    if (!store) return res.status(404).json({ success: false, message: "Store not found" });

    if (req.user._id.toString() !== store.owner.toString() && req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    console.log("Uploaded FILE:", req.file); // DEBUG LINE

    if (!req.file || !req.file.path) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    store.shopLogo = req.file.path;
    await store.save();

    res.json({ success: true, logo: store.shopLogo });
  } catch (err) {
    console.error("Logo error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


// --------------------------------------------------
// UPDATE STORE DETAILS
// --------------------------------------------------
router.put("/:storeId", isLoggedIn, async (req, res) => {
  try {
    const store = await Store.findById(req.params.storeId);
    if (!store) return res.json({ success: false, message: "Store not found" });

    if (req.user._id.toString() !== store.owner.toString() && req.user.role !== "admin") {
      return res.json({ success: false, message: "Unauthorized" });
    }

    store.shopName = req.body.shopName || store.shopName;
    store.slug = req.body.slug || store.slug;
    store.description = req.body.description || store.description;
    store.address = req.body.address || store.address;
    store.phone = req.body.phone || store.phone;
    if (req.body.tailorType) store.tailorType = req.body.tailorType;
    if (Array.isArray(req.body.servicesOffered)) store.servicesOffered = req.body.servicesOffered;
    if (Array.isArray(req.body.workingDays)) store.workingDays = req.body.workingDays;
    if (req.body.workingHours && typeof req.body.workingHours === "object") {
      store.workingHours = { open: req.body.workingHours.open || "", close: req.body.workingHours.close || "" };
    }
    if (req.body.averageStitchingTime != null) store.averageStitchingTime = Number(req.body.averageStitchingTime) || 3;
    if (req.body.productionCapacityPerDay != null) store.productionCapacityPerDay = Math.max(0, parseInt(req.body.productionCapacityPerDay, 10) || 20);

    await store.save();

    return res.json({ success: true, message: "Store updated successfully" });

  } catch (err) {
    console.error(err);
    return res.json({ success: false, message: "Server error" });
  }
});


// --------------------------------------------------
// GET STORE BY SLUG OR OWNER ID (KEEP THIS LAST)
// --------------------------------------------------
router.get("/:identifier", async (req, res) => {
  const { identifier } = req.params;

  let store = await Store.findOne({ slug: identifier })
    .populate("owner")
    .lean(false)
    .exec();

  if (!store) {
    store = await Store.findOne({ owner: identifier })
      .populate("owner")
      .lean(false)
      .exec();
  }

  if (!store) {
    return res.status(404).send("Store not found");
  }

  // Force reload from DB (100% fresh)
  store = await Store.findById(store._id)
    .populate("owner")
    .exec();

  console.log("⭐ FRESH STORE:", store);

  const listings = await Listing.find({ owner: store.owner._id, isActive: { $ne: false } });

  res.render("store", {
    store,
    owner: store.owner,
    listings,
    currUser: req.user
  });
});


module.exports = router;