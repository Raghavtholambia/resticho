const Listing = require("../models/listing");
const { cloudinary } = require("../cloudConfig");
const Store = require("../models/store");

// =========================================
// ⭐ CREATE LISTING
// =========================================
// =========================================
// ⭐ CREATE LISTING
// =========================================
function sanitizeArray(arr) {
    if (!arr) return [];
    const arrayData = Array.isArray(arr) ? arr : [arr];
    return [...new Set(arrayData.filter(item => item && String(item).trim() !== ""))];
}

function buildPricing(listing) {
    const p = listing.pricing || {};
    const num = (v) => {
        const n = Number(v);
        return typeof n === "number" && !Number.isNaN(n) ? n : 0;
    };
    return {
        rentalPricePerDay: num(p.rentalPricePerDay),
        stitchingBasePrice: num(p.stitchingBasePrice),
        securityDeposit: num(p.securityDeposit),
    };
}

function buildStock(listing, businessMode) {
    const s = listing.stock || {};
    const total = Math.max(0, parseInt(s.totalQuantity, 10) || 1);
    const available = Math.max(0, parseInt(s.availableQuantity, 10) ?? total);
    return {
        totalQuantity: total,
        availableQuantity: businessMode === "rental" || businessMode === "both" ? Math.min(available, total) : 1,
    };
}

function buildMeasurementFields(listing) {
    const raw = listing.measurementFields;
    if (raw && Array.isArray(raw)) {
        return raw
            .filter(m => m && m.name && String(m.name).trim())
            .map(m => ({ name: String(m.name).trim(), required: !!m.required }));
    }
    const rawText = listing.measurementFieldsRaw;
    if (!rawText || typeof rawText !== "string") return [];
    return rawText
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => {
            const required = line.endsWith("*");
            const name = (required ? line.slice(0, -1).trim() : line).trim();
            return name ? { name, required } : null;
        })
        .filter(Boolean);
}

module.exports.createListing = async (req, res) => {
    const { listing } = req.body;

    const store = await Store.findOne({ owner: req.user._id });
    if (!store) {
        req.flash("error", "You must create a shop before adding listings.");
        return res.redirect("/seller/become-tailor");
    }

    const businessMode = listing.businessMode || "custom";
    if (businessMode === "custom" || businessMode === "both") {
        listing.fabricOptions = sanitizeArray(listing.fabricOptions);
        listing.sizeOptions = sanitizeArray(listing.sizeOptions);
    }

    // Build size-based inventory from form (listing.sizeInventory expected)
    const rawSizeInventory = Array.isArray(listing.sizeInventory) ? listing.sizeInventory : [];
    const sizeInventory = rawSizeInventory
        .filter((row) => row && row.size)
        .map((row) => ({
            size: row.size,
            totalQuantity: row.totalQuantity,
            availableQuantity: row.availableQuantity != null ? row.availableQuantity : row.totalQuantity,
        }));

    const newListing = new Listing({
        category: listing.category,
        itemName: listing.itemName,
        description: listing.description,
        businessMode,
        pricing: buildPricing(listing),
        measurementFields: buildMeasurementFields(listing),
        sizeInventory,
        stitchingDurationDays: Math.max(1, parseInt(listing.stitchingDurationDays, 10) || 3),
        occasions: sanitizeArray(listing.occasions),
        fabricPricing: listing.fabricPricing && typeof listing.fabricPricing === "object" ? listing.fabricPricing : {},
        fabricOptions: listing.fabricOptions || [],
        sizeOptions: listing.sizeOptions || [],
        owner: req.user._id,
        store: store._id,
        verifiedByAdmin: false,
    });

    if (req.file) {
        newListing.image = { url: req.file.path, filename: req.file.filename };
    }

    await newListing.save();
    req.flash("success", "Listing created. Waiting for admin approval.");
    res.redirect("/");
};

// =========================================
// ⭐ GET ALL (ONLY APPROVED LISTINGS SHOWN)
// =========================================
// =========================================
// ⭐ GET ALL LISTINGS (ADVANCED FILTER + SORT)
// =========================================
module.exports.getAllListings = async (req, res) => {
    try {
        const {
            search,
            sort,
            category,
            mode,
            minPrice,
            maxPrice,
            ratingAbove,
            city,
            page = 1
        } = req.query;

        const limit = 12;
        const skip = (page - 1) * limit;

        let query = {
            isActive: { $ne: false },
            verifiedByAdmin: true
        };

        // 🔍 TEXT SEARCH
        if (search) {
            query.$text = { $search: search };
        }

        // 🎯 CATEGORY
        if (category) {
            query.category = category;
        }

        // 🎯 MODE FILTER
        if (mode && ["rental", "custom"].includes(mode)) {
            query.businessMode = { $in: [mode, "both"] };
        }

        // 💰 PRICE FILTER
        if (minPrice || maxPrice) {
            query["pricing.rentalPricePerDay"] = {};
            if (minPrice) query["pricing.rentalPricePerDay"].$gte = Number(minPrice);
            if (maxPrice) query["pricing.rentalPricePerDay"].$lte = Number(maxPrice);
        }

        // ⭐ RATING
        if (ratingAbove) {
            query.averageRating = { $gte: Number(ratingAbove) };
        }

        // 🏙️ CITY (if store has city field)
        if (city) {
            query.city = city;
        }

        // 📊 SORT LOGIC
        let sortOption = { createdAt: -1 };

        switch (sort) {
            case "priceLowToHigh":
                sortOption = { "pricing.rentalPricePerDay": 1 };
                break;
            case "priceHighToLow":
                sortOption = { "pricing.rentalPricePerDay": -1 };
                break;
            case "highestRated":
                sortOption = { averageRating: -1 };
                break;
            case "newest":
                sortOption = { createdAt: -1 };
                break;
        }

        const listings = await Listing.find(query)
            .sort(sortOption)
            .skip(skip)
            .limit(limit)
            .select("itemName image pricing averageRating businessMode totalStock category")
            .lean();

        const total = await Listing.countDocuments(query);

        res.render("index", {
            listings,
            currentPage: Number(page),
            totalPages: Math.ceil(total / limit),
            query: req.query
        });

    } catch (err) {
        console.error(err);
        res.redirect("/");
    }
};

// =========================================
// ⭐ RENDER NEW LISTING FORM
// =========================================
module.exports.renderNewForm = async (req, res) => {
    // Ensure user is logged in (handled by middleware but good to check roles)
    if (!res.locals.currUser) {
        req.flash("error", "You must be logged in.");
        return res.redirect("/login");
    }

    const isSellerOrTailor = res.locals.currUser.role === "seller" || res.locals.currUser.isTailor || res.locals.currUser.role === "admin";
    if (!isSellerOrTailor) {
        req.flash("error", "You must be a tailor or seller to create a listing.");
        return res.redirect("/");
    }

    const storeExists = await Store.exists({ owner: res.locals.currUser._id });
    if (!storeExists) {
        req.flash("error", "Please create your shop first.");
        return res.redirect("/seller/become-tailor");
    }

    res.render("new", { apiKey: res.locals.googleApiKey });
};

// =========================================
// ⭐ GET A SINGLE LISTING (APPROVAL CHECK)
// =========================================
module.exports.getSingleListing = async (req, res) => {
    try {
        const { id } = req.params;

        const clickListing = await Listing.findById(id)
            .populate({
                path: "reviews",
                populate: { path: "author" }
            })
            .populate("owner")
            .populate("store");

        if (!clickListing) {
            req.flash("error", "Listing not found");
            return res.redirect("/");
        }

        // Calculation of average rating is redundant if the hook/method is used, 
        // but it's fine for presentation if the hook is unreliable or runs async.
        let avgRating = clickListing.averageRating; // Use the schema field if maintained

        // 1. Check for Admin Verification
        if (!clickListing.verifiedByAdmin) {
            const userRole = req.user?.role;
            if (userRole === 'admin' || (clickListing.owner && clickListing.owner._id && clickListing.owner._id.equals(req.user?._id))) {
                req.flash("warning", "This listing is pending admin approval.");
            } else {
                req.flash("error", "This listing is not currently available for viewing.");
                return res.redirect("/");
            }
        }

        // 2. Hidden by seller: only owner or admin can view
        const isOwner = clickListing.owner && (clickListing.owner._id ? clickListing.owner._id.equals(req.user?._id) : clickListing.owner.equals(req.user?._id));
        if (clickListing.isActive === false && !isOwner && req.user?.role !== 'admin') {
            req.flash("error", "This listing is not available.");
            return res.redirect("/");
        }

        // After all checks, render the page
        return res.render("Show", {
            clickListing,
            avgRating, // Using the schema field or calculated value
            apiKey: res.locals.googleApiKey
        });

    } catch (err) {
        console.error("Error loading listing:", err);
        req.flash("error", "Something went wrong fetching the listing.");
        res.redirect("/");
    }
};

// =========================================
// ⭐ RENDER EDIT FORM
// =========================================
module.exports.renderEditForm = async (req, res) => {
    const { id } = req.params;
    const listingToEdit = await Listing.findById(id);

    // If a user edits a listing, it should probably be marked unverified again
    // listingToEdit.verifiedByAdmin = false; 
    // await listingToEdit.save();

    res.render("edit", {
        newListing: listingToEdit, // Renamed for clarity in controller
        apiKey: res.locals.googleApiKey
    });
};

// =========================================
// ⭐ UPDATE LISTING
// =========================================
// =========================================
// ⭐ UPDATE LISTING
// =========================================
module.exports.updateListing = async (req, res) => {
    const { id } = req.params;
    const listing = req.body.listing;

    const businessMode = listing.businessMode || "custom";
    if (businessMode === "custom" || businessMode === "both") {
        listing.fabricOptions = sanitizeArray(listing.fabricOptions);
        listing.sizeOptions = sanitizeArray(listing.sizeOptions);
    }

    const updateData = {
        category: listing.category,
        itemName: listing.itemName,
        description: listing.description,
        businessMode,
        pricing: buildPricing(listing),
        measurementFields: buildMeasurementFields(listing),
        stitchingDurationDays: Math.max(1, parseInt(listing.stitchingDurationDays, 10) || 3),
        occasions: sanitizeArray(listing.occasions),
        fabricOptions: listing.fabricOptions || [],
        sizeOptions: listing.sizeOptions || [],
        verifiedByAdmin: false,
    };

    const doc = await Listing.findById(id);
    if (doc && (businessMode === "rental" || businessMode === "both")) {
        const s = listing.stock || {};
        const total = Math.max(0, parseInt(s.totalQuantity, 10) ?? doc.stock?.totalQuantity ?? 1);
        updateData.stock = {
            totalQuantity: total,
            availableQuantity: Math.min(doc.stock?.availableQuantity ?? total, total),
        };
    }

    const updatedListing = await Listing.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });

    if (req.file) {
        if (updatedListing.image?.filename) {
            await cloudinary.uploader.destroy(updatedListing.image.filename);
        }
        updatedListing.image = { url: req.file.path, filename: req.file.filename };
        await updatedListing.save();
    }

    req.flash("success", "Listing updated. It is now pending admin approval.");
    res.redirect(`/listing/${id}`);
};

// =========================================
// ⭐ DELETE LISTING
// =========================================
module.exports.deleteListing = async (req, res) => {
    const { id } = req.params;

    const listingToDelete = await Listing.findById(id);

    // Delete image from Cloudinary
    if (listingToDelete && listingToDelete.image?.filename) {
        await cloudinary.uploader.destroy(listingToDelete.image.filename);
    }

    // The findByIdAndDelete hook handles review deletion
    await Listing.findByIdAndDelete(id);

    req.flash("success", "Listing deleted successfully");
    res.redirect("/");
};

// =========================================
// ⭐ ADMIN: VERIFY ONE LISTING
// =========================================
module.exports.verifyOneListing = async (req, res) => {
    const { id } = req.params;

    // Add role check here if not using a dedicated admin middleware
    // if (req.user.role !== 'admin') { return res.status(403).send("Forbidden"); }

    await Listing.findByIdAndUpdate(id, { verifiedByAdmin: true });

    req.flash("success", "Listing approved!");
    // Assuming the admin page for listings is /admin/listings
    res.redirect("/admin/listings");
};

// =========================================
// ⭐ ADMIN: VERIFY ALL LISTINGS
// =========================================
module.exports.verifyAllListings = async (req, res) => {
    // Add role check here if not using a dedicated admin middleware

    // Use updateMany to set the flag on all unverified listings
    await Listing.updateMany({ verifiedByAdmin: false }, { verifiedByAdmin: true });

    req.flash("success", "All pending listings approved!");
    res.redirect("/resource"); // Redirect to a suitable admin dashboard
};

// =========================================
// ⭐ SELLER: TOGGLE LISTING VISIBILITY (show/hide on store)
// =========================================
module.exports.toggleListingVisibility = async (req, res) => {
    const { id } = req.params;
    const listing = await Listing.findById(id);
    if (!listing) {
        req.flash("error", "Listing not found.");
        return res.redirect("/");
    }
    const isOwner = listing.owner && listing.owner.equals(req.user._id);
    if (!isOwner && req.user.role !== "admin") {
        req.flash("error", "Not authorized.");
        return res.redirect("/");
    }
    listing.isActive = !listing.isActive;
    await listing.save();
    req.flash("success", listing.isActive ? "Listing is now visible on your store." : "Listing is now hidden from your store.");
    res.redirect(req.headers.referer || "/listing/" + id);
};

// =========================================
// ⭐ Admin → Get unverified listings
// =========================================
module.exports.getAllUnverifiedListings = async (req, res) => {
    // Add role check here

    const pendingListings = await Listing.find({
        verifiedByAdmin: false,
        rejectedByAdmin: { $ne: true },
    })
        .populate("owner")
        .populate("store");

    res.render("admin/pendingListings", { pendingListings });
};