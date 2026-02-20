const Booking = require("../models/Booking");
const Listing = require("../models/listing");
const Store = require("../models/store");

/**
 * Map Booking doc to order-like shape for views (listing, store, orderType, status, totalAmount, etc.)
 */
function mapBookingToOrder(booking) {
  const listing = booking.productId;
  const store = listing && listing.store ? listing.store : null;
  const hasRentalDates = booking.startDate && booking.endDate;
  const isRental =
    hasRentalDates ||
    (listing && (listing.businessMode === "rental" || listing.businessMode === "both"));
  const orderType = isRental ? "rental" : "custom";
  const status = booking.orderStatus || booking.status || "pending";
  const cancelled = status === "cancelled";
  const delivered =
    status === "delivered" || status === "completed" || status === "ready";

  let expectedDeliveryDate = null;
  if (!isRental && listing && listing.stitchingDurationDays) {
    const d = new Date(booking.createdAt || Date.now());
    d.setDate(d.getDate() + listing.stitchingDurationDays);
    expectedDeliveryDate = d;
  }

  return {
    _id: booking._id,
    listing: listing,
    store: store,
    productId: listing,
    orderType,
    status,
    totalAmount: booking.totalPrice,
    totalPrice: booking.totalPrice,
    createdAt: booking.createdAt,
    startDate: booking.startDate,
    endDate: booking.endDate,
    orderStatus: booking.orderStatus,
    expectedDeliveryDate,
  };
}

/**
 * GET /orders — User orders dashboard (Active / Completed / Cancelled)
 */
exports.getUserOrders = async (req, res) => {
  try {
    const userId = req.user._id;

    const bookings = await Booking.find({ renterId: userId })
      .sort({ createdAt: -1 })
      .populate({
        path: "productId",
        select: "itemName image pricing businessMode stitchingDurationDays store",
        populate: { path: "store", select: "shopName address" },
      })
      .lean();

    const orders = bookings.map((b) => mapBookingToOrder(b));

    const activeStatuses = [
      "pending",
      "pending_measurements",
      "confirmed",
      "in_stitching",
      "quality_check",
      "ready",
    ];
    const completedStatuses = ["delivered", "completed"];
    const cancelledStatuses = ["cancelled"];

    const activeOrders = orders.filter((o) => {
      const s = String(o.status || "").toLowerCase();
      return activeStatuses.some(as => s === as.toLowerCase());
    });
    const completedOrders = orders.filter((o) => {
      const s = String(o.status || "").toLowerCase();
      return completedStatuses.some(cs => s === cs.toLowerCase());
    });
    const cancelledOrders = orders.filter((o) => {
      const s = String(o.status || "").toLowerCase();
      return cancelledStatuses.some(cs => s === cs.toLowerCase());
    });

    res.render("orders/index", {
      activeOrders,
      completedOrders,
      cancelledOrders,
      success: req.flash("success"),
      error: req.flash("error"),
    });
  } catch (err) {
    console.error("getUserOrders error:", err);
    req.flash("error", "Could not load orders.");
    res.redirect("/");
  }
};

/**
 * POST /orders/:id/cancel — Cancel order (only pending/confirmed)
 */
exports.cancelUserOrder = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;

    const booking = await Booking.findById(id)
      .populate("productId")
      .lean();
    if (!booking) {
      req.flash("error", "Order not found.");
      return res.redirect("/orders");
    }
    if (booking.renterId.toString() !== userId.toString()) {
      req.flash("error", "Not authorized to cancel this order.");
      return res.redirect("/orders");
    }

    const status = (booking.orderStatus || booking.status || "").toLowerCase().replace(/_/g, "");
    if (!["pending", "confirmed", "pendingmeasurements"].includes(status)) {
      req.flash("error", "This order can no longer be cancelled.");
      return res.redirect("/orders");
    }

    await Booking.findByIdAndUpdate(id, {
      status: "cancelled",
      orderStatus: "cancelled",
    });

    const listing = booking.productId;
    const isCustom =
      listing &&
      (listing.businessMode === "custom" || listing.businessMode === "both");
    const isRental =
      listing &&
      (listing.businessMode === "rental" || listing.businessMode === "both");

    if (isCustom && listing.store) {
      await Store.findByIdAndUpdate(listing.store, {
        $inc: { activeOrderCount: -1 },
      });
    }
    if (isRental && listing._id && booking.selectedSize) {
      await Listing.findOneAndUpdate(
        { _id: listing._id, "sizeInventory.size": booking.selectedSize },
        { $inc: { "sizeInventory.$.availableQuantity": 1, totalStock: 1 } }
      );
    }

    req.flash("success", "Order cancelled.");
    res.redirect("/orders");
  } catch (err) {
    console.error("cancelUserOrder error:", err);
    req.flash("error", "Could not cancel order.");
    res.redirect("/orders");
  }
};
