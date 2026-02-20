const ShopCoin = require("../models/ShopCoin");
const Transaction = require("../models/transaction");
const User = require("../models/users");
const Listing = require("../models/listing");

// Redeem coins to “buy” second-hand items
module.exports.redeemItem = async (req, res) => {
  try {
    const { listingId, usePC = 0, useSC = 0 } = req.body;
    const userId = req.user._id;

    const listing = await Listing.findById(listingId).populate("store");

    if (!listing) {
      req.flash("error", "Item not found");
      return res.redirect("back");
    }

    const storeId = listing.store._id;
    const p = listing.pricing || {};
    const totalPrice = p.rentalPricePerDay || p.stitchingBasePrice || 0;

    // 1️⃣ Check SC balance
    let shopCoin = await ShopCoin.findOne({ user: userId, store: storeId });
    let scBalance = shopCoin ? shopCoin.coins : 0;

    if (useSC > scBalance) {
      req.flash("error", "Not enough Store Coins");
      return res.redirect("back");
    }

    // 2️⃣ Check PC balance
    const user = await User.findById(userId);
    let pcBalance = user.personalCoins;

    if (usePC > pcBalance) {
      req.flash("error", "Not enough Personal Coins");
      return res.redirect("back");
    }

    // 3️⃣ Calculate total coins applied
    const totalCoins = useSC + usePC;

    if (totalCoins < totalPrice) {
      req.flash("error", `You need at least ${totalPrice} coins to redeem this item`);
      return res.redirect("back");
    }

    // 4️⃣ Deduct SC
    if (useSC > 0 && shopCoin) {
      shopCoin.coins -= useSC;
      await shopCoin.save();

      await Transaction.create({
        user: userId,
        store: storeId,
        type: "REDEEM_SC",
        amount: useSC,
        description: `Redeemed ${useSC} SC for ${listing.itemName}`,
      });
    }

    // 5️⃣ Deduct PC
    if (usePC > 0) {
      user.personalCoins -= usePC;
      await user.save();

      await Transaction.create({
        user: userId,
        type: "REDEEM_PC",
        amount: usePC,
        description: `Redeemed ${usePC} PC for ${listing.itemName}`,
      });
    }

    // 6️⃣ Mark item as redeemed (optional: you can remove from listing or flag)
    listing.redeemed = true;
    await listing.save();

    req.flash("success", `Successfully redeemed item using ${useSC} SC & ${usePC} PC`);
    res.redirect("/user/coins");
  } catch (err) {
    console.error("Redeem error:", err);
    req.flash("error", "Something went wrong during redemption");
    res.redirect("back");
  }
};
