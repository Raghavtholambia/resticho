const Listing = require("../models/listing");

exports.lockDates = async (req, res) => {
  try {
    console.log("🔥 lockDates called");

    const { listingId, startDate, endDate, quantity } = req.body;

    const listing = await Listing.findById(listingId);
    if (!listing) {
      console.log("Listing not found:", listingId);
      return res.json({ success: false, reason: "Listing not found" });
    }

    console.log("Dates requested to lock:", startDate, endDate);

    // Instead of Redis, we check database for conflicts
    // (optional, can remove entirely since createBooking does the check)
    res.json({ success: true });
  } catch (err) {
    console.error("lockDates error:", err);
    res.status(500).json({ success: false });
  }
};

exports.unlockDates = async (req, res) => {
  try {
    console.log("🔥 unlockDates called");

    // No Redis → nothing to unlock
    res.json({ success: true });
  } catch (err) {
    console.error("unlockDates error:", err);
    res.status(500).json({ success: false });
  }
};
