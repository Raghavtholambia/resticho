const Booking = require("../models/Booking");
const Listing = require("../models/listing");
const Store = require("../models/store"); // ⭐ Added Store Import
const mongoose = require("mongoose");

/**
 * Get booked dates for a listing
 */
exports.getBookedDates = async (req, res) => {
  try {
    const { listingId } = req.params;

    console.log("Fetching blocked dates for listing:", listingId);

    // Fetch confirmed bookings only
    const bookings = await Booking.find({
      productId: listingId,
      status: "confirmed"
    }).select("startDate endDate -_id").sort({ startDate: 1 });

    console.log("Found bookings:", bookings);

    // Transform to ranges for Flatpickr
    const blockedDates = bookings.map(b => ({
      startDate: b.startDate.toISOString().split("T")[0],
      endDate: b.endDate.toISOString().split("T")[0]
    }));

    console.log("Blocked date ranges:", blockedDates);

    res.json({ blockedDates });

  } catch (err) {
    console.error("Error fetching booked dates:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Create a booking / Order
 */
function ownerIdFromListing(listing) {
  if (!listing) return null;
  return listing.owner && listing.owner._id ? listing.owner._id : listing.owner;
}

exports.createBooking = async (req, res) => {
  try {
    const {
      listingId,
      startDate,
      endDate,
      quantity = 1,
      measurements,
      selectedFabric,
      selectedSize,
      selectedVariants,
      orderDays,
      urgentOrder,
    } = req.body;

    const renterId = req.user._id.toString();
    const listing = await Listing.findById(listingId).populate("owner");
    if (!listing || !listing.verifiedByAdmin) {
      return res.status(404).json({ message: "Listing not available" });
    }

    const isCustom = listing.businessMode === "custom" || listing.businessMode === "both";
    const isRental = listing.businessMode === "rental" || listing.businessMode === "both";

    // Validate size for both rental and custom
    if (!selectedSize) {
      return res.status(400).json({ message: "Size selection is required." });
    }

    // ----- PATH A: CUSTOM STITCHING ORDER -----
    if (isCustom && !startDate && !endDate) {
      const store = await Store.findById(listing.store);
      if (!store) return res.status(404).json({ message: "Store not found" });

      const capacityLimit = store.productionCapacityPerDay ?? store.maxConcurrentOrders ?? 20;
      const capacityReserved = await Store.findOneAndUpdate(
        { _id: listing.store, activeOrderCount: { $lt: capacityLimit } },
        { $inc: { activeOrderCount: 1 } }
      );
      if (!capacityReserved) {
        return res.status(400).json({ message: "Tailor is at full capacity. Please try again later." });
      }

      try {
        // Enforce minimum days for custom orders
        const days = Math.max(5, parseInt(orderDays, 10) || 5);

        const basePrice = (listing.pricing && listing.pricing.stitchingBasePrice) || 0;
        const fp = listing.fabricPricing;
        const fabricExtra = (fp && selectedFabric && (typeof fp.get === "function" ? fp.get(selectedFabric) : fp[selectedFabric])) || 0;
        // Urgent charge (flat per order)
        const urgent = String(urgentOrder) === "true" || urgentOrder === true;
        const urgentCharge = urgent ? 500 : 0;

        const perOrder = basePrice + fabricExtra + urgentCharge;
        const totalPrice = perOrder * (quantity || 1);

        const booking = await Booking.create({
          productId: listingId,
          renterId,
          ownerId: ownerIdFromListing(listing),
          startDate: new Date(),
          endDate: new Date(Date.now() + (listing.stitchingDurationDays || 3) * 24 * 60 * 60 * 1000),
          totalPrice,
          status: "pending",
          orderStatus: "pending_measurements",
          orderDays: days,
          urgentOrder: urgent,
          urgentCharge,
          measurements: measurements || {},
          selectedFabric,
          selectedSize,
          selectedVariants: selectedVariants || {},
        });
        return res.status(201).json({ message: "Order placed successfully!", booking });
      } catch (bookingErr) {
        await Store.findByIdAndUpdate(listing.store, { $inc: { activeOrderCount: -1 } });
        throw bookingErr;
      }
    }

    // ----- PATH B: RENTAL BOOKING -----
    if (isRental) {
      if (!startDate || !endDate) {
        return res.status(400).json({ message: "Missing dates for rental" });
      }
      // Check size-specific availability
      const sizeRow = (listing.sizeInventory || []).find((row) => row.size === selectedSize);
      const available = sizeRow ? (sizeRow.availableQuantity || 0) : 0;
      const qty = Math.max(1, parseInt(quantity, 10) || 1);
      if (available <= 0 || qty > available) {
        return res.status(400).json({ message: "Insufficient stock for rental" });
      }

      const start = new Date(startDate);
      const end = new Date(endDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(0, 0, 0, 0);
      if (start >= end) {
        return res.status(400).json({ message: "Invalid rental period" });
      }

      const conflict = await Booking.findOne({
        productId: listingId,
        status: "confirmed",
        startDate: { $lt: end },
        endDate: { $gt: start },
      });
      if (conflict) {
        return res.status(409).json({ message: "Listing already booked for selected dates" });
      }

      const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) || 1;
      const pricePerDay = (listing.pricing && listing.pricing.rentalPricePerDay) || 0;
      const totalPrice = days * pricePerDay * qty;

      const booking = await Booking.create({
        productId: listingId,
        renterId,
        ownerId: ownerIdFromListing(listing),
        startDate: start,
        endDate: end,
        totalPrice,
        status: "pending",
        orderStatus: "pending",
        orderDays: days,
        selectedSize,
      });
      // Do NOT decrement inventory here; happens on seller confirmation
      return res.status(201).json({ message: "Booking created, waiting for seller confirmation", booking });
    }

    return res.status(400).json({ message: "Invalid booking type for this listing" });
  } catch (err) {
    console.error("Booking/Order failed:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Get orders for a seller
 */
exports.getSellerOrders = async (req, res) => {
  try {
    const sellerId = req.user._id;
    const orders = await Booking.find({ ownerId: sellerId })
      .populate('productId') // Get listing details
      .populate('renterId')  // Get buyer details
      .sort({ createdAt: -1 });

    res.json({ orders });
  } catch (err) {
    console.error("Error fetching seller orders:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Update Order Status (Approve/Reject/Progress)
 */
exports.updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body; // New status: confirmed, cancelled, in_stitching, etc.
    
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }
    
    const sellerId = req.user._id;
    
    console.log("Update order status request:", { orderId, status, sellerId });

    const booking = await Booking.findById(orderId).populate('productId');
    if (!booking) {
      console.log("Booking not found:", orderId);
      return res.status(404).json({ message: "Order not found" });
    }

    console.log("Booking found:", { bookingId: booking._id, ownerId: booking.ownerId, sellerId });

    // Verify Ownership
    if (!booking.ownerId || booking.ownerId.toString() !== sellerId.toString()) {
      console.log("Unauthorized:", { bookingOwnerId: booking.ownerId, sellerId });
      return res.status(403).json({ message: "Unauthorized: You don't own this order" });
    }

    const oldStatus = booking.orderStatus || "pending"; // Default for legacy/rental might be null

    // ---------------------------------------------
    // STATE MACHINE & CAPACITY LOGIC
    // ---------------------------------------------

    // 1. REJECTION / CANCELLATION (Release Capacity or Stock only if order was confirmed)
    if (status === 'cancelled' && oldStatus !== 'cancelled') {
      const listing = booking.productId;
      // Only release resources if the order was previously confirmed (resources were reserved)
      if (oldStatus === 'confirmed' || oldStatus === 'in_stitching' || oldStatus === 'quality_check' || oldStatus === 'ready') {
        const isCustom = listing.businessMode === 'custom' || listing.businessMode === 'both';
        if (isCustom && listing.store) {
          await Store.findByIdAndUpdate(listing.store, { $inc: { activeOrderCount: -1 } });
        }
        // If rental, return stock for the selected size
        const isRental = listing.businessMode === 'rental' || listing.businessMode === 'both';
        if (isRental && listing._id) {
          const Listing = require("../models/listing");
          if (booking.selectedSize) {
            await Listing.findOneAndUpdate(
              { _id: listing._id, "sizeInventory.size": booking.selectedSize },
              { $inc: { "sizeInventory.$.availableQuantity": 1, totalStock: 1 } }
            );
          }
        }
      }
      // If order was pending, no resources were reserved, so nothing to release
    }

    // 2. APPROVAL (Confirm) - Reserve capacity/stock when seller confirms
    if (status === 'confirmed' && oldStatus !== 'confirmed') {
      const listing = booking.productId;
      const isCustom = listing.businessMode === 'custom' || listing.businessMode === 'both';
      const isRental = listing.businessMode === 'rental' || listing.businessMode === 'both';
      
      // Reserve capacity for custom orders
      if (isCustom && listing.store) {
        const store = await Store.findById(listing.store);
      
        if (!store) {
          return res.status(400).json({ message: "Store not found for this listing." });
        }
      
        const capacityLimit = store.productionCapacityPerDay ?? store.maxConcurrentOrders ?? 20;
      
        if ((store.activeOrderCount || 0) >= capacityLimit) {
          return res.status(400).json({ message: "Store is at full capacity. Cannot confirm order." });
        }
      
        await Store.findByIdAndUpdate(listing.store, { $inc: { activeOrderCount: 1 } });
      }
      
      
      // Reserve stock for rental orders (selected size only)
      if (isRental && listing._id) {
        const Listing = require("../models/listing");
        if (!booking.selectedSize) {
          return res.status(400).json({ message: "Size selection missing for this order." });
        }
        const updated = await Listing.findOneAndUpdate(
          { _id: listing._id, "sizeInventory.size": booking.selectedSize, "sizeInventory.availableQuantity": { $gt: 0 } },
          { $inc: { "sizeInventory.$.availableQuantity": -1, totalStock: -1 } },
          { new: true }
        );
        if (!updated) {
          return res.status(400).json({ message: "Item is out of stock for the selected size. Cannot confirm order." });
        }
      }
    }

    // 3. COMPLETION (Delivered) — release capacity for custom orders
    if (status === 'delivered' && oldStatus !== 'delivered') {
      const listing = booking.productId;
      const isCustom = listing.businessMode === 'custom' || listing.businessMode === 'both';
      if (isCustom && listing.store) {
        await Store.findByIdAndUpdate(listing.store, { $inc: { activeOrderCount: -1 } });
      }
    }

    // Update fields
    booking.orderStatus = status;

    // Sync main 'status' field for backward compatibility
    if (status === 'confirmed') booking.status = 'confirmed';
    if (status === 'cancelled') booking.status = 'cancelled';

    await booking.save();

    console.log("Order status updated successfully:", { orderId: booking._id, newStatus: status });
    res.json({ 
      success: true,
      message: `Order status updated to ${status.replace(/_/g, ' ')}`,
      booking: {
        _id: booking._id,
        orderStatus: booking.orderStatus,
        status: booking.status
      }
    });

  } catch (err) {
    console.error("Error updating order status:", err);
    res.status(500).json({ message: "Server error" });
  }
};
