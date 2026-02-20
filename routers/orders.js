const express = require("express");
const router = express.Router();
const { isLoggedIn } = require("../middleware");
const orderController = require("../controllers/orderController");

router.get("/orders", isLoggedIn, orderController.getUserOrders);
router.post("/orders/:id/cancel", isLoggedIn, orderController.cancelUserOrder);

module.exports = router;
