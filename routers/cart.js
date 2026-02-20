const express = require("express");
const router = express.Router();
const Listing = require("../models/listing"); 
const Cart = require("../models/cart");
const { isLoggedIn } = require("../middleware");
const mongoose = require("mongoose");

// 🛍️ View Cart
router.get("/view", isLoggedIn, async (req, res) => {
  const userId = req.user._id;
  console.log(req.user.shopCoins);


  try {
  //       await Cart.findOneAndUpdate(
  //     { user: req.user._id },
  //     { $set: { items: [], grandTotal: 0 } },
  //     { new: true }
  //   );
    const cart = await Cart.findOne({ user: userId })
      .populate("items.product");

    if (!cart || cart.items.length === 0) {
      req.flash("error", "🛒 Your cart is empty.");
      return res.redirect("/");
    }

    // filter out deleted products
    cart.items = cart.items.filter(item => item.product !== null);

    // recalc totals
    cart.grandTotal = cart.items.reduce((acc, item) => acc + item.total, 0);
    await cart.save();

    res.render("cart/index", { cart });
  } catch (err) {
    console.error("Error fetching cart:", err);
    req.flash("error", "Something went wrong while loading your cart.");
    res.redirect("/");
  }
});


// Add to cart
router.post("/add/:id",isLoggedIn, async (req, res) => {
  try {
    const productId = req.params.id;
    const { startDate, endDate, quantity } = req.body;

     console.log(req.body);
     
    const product = await Listing.findById(productId);
    if (!product) return res.status(404).send("Product not found");

    const pricing = product.pricing || {};
    const isRental = product.businessMode === "rental" || product.businessMode === "both";
    const price = isRental ? (pricing.rentalPricePerDay || 0) : (pricing.stitchingBasePrice || 0);

    // Basic guard: if totalStock is 0, block rentals from cart
    const totalStock = product.totalStock || 0;
    if (isRental && totalStock <= 0) {
      req.flash("error", "This item is out of stock for rental. You cannot add it to cart.");
      return res.redirect("/listing/" + productId);
    }

    let cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      cart = new Cart({ user: req.user._id, items: [] });
    }

    cart.items.push({
      product: product._id,
      price: price,
      quantity: quantity || 1,
      startDate: startDate ? new Date(startDate) : new Date(),
      endDate: endDate ? new Date(endDate) : new Date(),
    });

    console.log(cart.item);
    

    await cart.save();
    res.redirect("/cart/view");
  } catch (err) {
    console.error("Error adding to cart:", err);
    req.flash("error", "Could not add to cart.");
    res.redirect("/listing/" + req.params.id);
  }
});




// ❌ Remove item
router.delete("/remove-from-cart/:id", isLoggedIn, async (req, res) => {
  try {
    const productId = req.params.id;
    let cart = await Cart.findOne({ user: req.user._id });

    if (!cart) {
      req.flash("error", "Cart not found");
      return res.redirect("/cart/view");
    }

    cart.items = cart.items.filter(item => !item.product.equals(productId));
    cart.grandTotal = cart.items.reduce((acc, item) => acc + item.total, 0);

    await cart.save();
    req.flash("success", "Item removed from cart!");
    res.redirect("/cart/view");

  } catch (err) {
    console.error("Error removing from cart:", err);
    req.flash("error", "Something went wrong");
    res.redirect("/cart/view");
  }
});


// 🗑️ Clear entire cart
router.post("/clear", isLoggedIn, async (req, res) => {
  try {
    await Cart.findOneAndUpdate(
      { user: req.user._id },
      { $set: { items: [], grandTotal: 0 } },
      { new: true }
    );
    req.flash("success", "Cart cleared!");
    res.redirect("/cart/view");
  } catch (err) {
    console.error(err);
    req.flash("error", "Error clearing cart");
    res.redirect("/cart/view");
  }
});
// Checkout Page
router.get("/checkout",isLoggedIn, async (req, res) => {
  try {
    // Assuming req.user._id is available from session
    const cart = await Cart.findOne({ user: req.user._id }).populate("items.product");

    if (!cart || cart.items.length === 0) {
      return res.redirect("/cart"); // if no items, go back to cart
    }

    res.render("payment/checkout", { cart });
  } catch (err) {
    console.error(err);
    res.redirect("/cart");
  }
});
// Payment Page
router.get("/payment",isLoggedIn, async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id }).populate("items.product");

    if (!cart || cart.items.length === 0) {
      return res.redirect("/cart");
    }

    res.render("payment/payMethod", { cart });
  } catch (err) {
    console.error(err);
    res.redirect("/cart");
  }
});



module.exports = router;
