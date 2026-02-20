// require("dotenv").config();

const express = require("express");
const router = express.Router();
const multer = require("multer");
const { storage } = require("../cloudConfig");
const upload = multer({ storage });

const wrapAsync = require("../utils/wrapAsync");
const { isLoggedIn, validateListing, listingOwner, isAdmin, normalizeListingForm } = require("../middleware");

const listingController = require("../controllers/listingController");

// =============================================
// ⭐ PUBLIC ROUTES
// =============================================

// All approved listings
router.get("/", wrapAsync(listingController.getAllListings));

// New form (seller/admin)
router.get("/listing/new", isLoggedIn, listingController.renderNewForm);

// Create listing
router.post(
  "/listing",
  isLoggedIn,
  upload.single("listing[image]"),
  normalizeListingForm,
  validateListing,
  wrapAsync(listingController.createListing)
);

// Show single listing
router.get("/listing/:id", wrapAsync(listingController.getSingleListing));

// Edit form
router.get(
  "/listing/:id/edit",
  isLoggedIn,
  listingOwner,
  wrapAsync(listingController.renderEditForm)
);

// Update listing
router.put(
  "/listing/:id",
  isLoggedIn,
  upload.single("listing[image]"),
  normalizeListingForm,
  validateListing,
  listingOwner,
  wrapAsync(listingController.updateListing)
);

// Toggle listing visibility (show/hide on store) — seller only
router.post(
  "/listing/:id/toggle-visibility",
  isLoggedIn,
  listingOwner,
  wrapAsync(listingController.toggleListingVisibility)
);

// Delete listing
router.delete(
  "/listing/:id",
  isLoggedIn,
  listingOwner,
  wrapAsync(listingController.deleteListing)
);

// =============================================
// ⭐ ADMIN-ONLY ROUTES (NEW)
// =============================================

// View all pending listings
router.get(
  "/admin/listings",
  isLoggedIn,
  isAdmin,
  wrapAsync(listingController.getAllUnverifiedListings)
);

// Approve one listing
router.put(
  "/admin/listings/:id/approve",
  isLoggedIn,
  isAdmin,
  wrapAsync(listingController.verifyOneListing)
);

// Approve all listings
router.put(
  "/admin/listings/approve-all",
  isLoggedIn,
  isAdmin,
  wrapAsync(listingController.verifyAllListings)
);

module.exports = router;
