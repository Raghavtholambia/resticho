const mongoose = require('mongoose');
const User = require('./models/users');
const Store = require('./models/store');
const Listing = require('./models/listing');
const Booking = require('./models/Booking');
const bookingController = require('./controllers/bookingController');

// Mock Request/Response
const mockReq = (body, user, params) => ({
    body,
    user,
    params: params || {},
    flash: () => { }
});

const mockRes = () => {
    const res = {};
    res.status = (code) => {
        res.statusCode = code;
        return res;
    };
    res.json = (data) => {
        res.jsonData = data;
        return res;
    };
    return res;
};

async function runAdminVerification() {
    console.log("🚀 Starting Admin Verification...");

    await mongoose.connect("mongodb://127.0.0.1:27017/test");
    console.log("✅ DB Connected");

    try {
        // 1. Setup Data
        const seller = await User.create({ username: `SellerAdmin_${Date.now()}`, email: `sa_${Date.now()}@test.com`, role: 'seller' });
        const buyer = await User.create({ username: `Buyer_${Date.now()}`, email: `buyer_${Date.now()}@test.com` });

        const store = await Store.create({
            owner: seller._id,
            shopName: `AdminShop_${Date.now()}`,
            slug: `admin-shop-${Date.now()}`,
            maxConcurrentOrders: 5,
            activeOrderCount: 1 // Simulate 1 active order
        });

        const listing = await Listing.create({
            itemName: "Admin Suit",
            pricePerDay: 5000,
            category: "Others",
            owner: seller._id,
            store: store._id,
            listingType: 'tailoring',
            image: { url: "http://img.com", filename: "img" }
        });

        const order = await Booking.create({
            productId: listing._id,
            renterId: buyer._id,
            ownerId: seller._id,
            startDate: new Date(),
            endDate: new Date(),
            totalPrice: 5000,
            status: "confirmed",
            orderStatus: "pending_measurements"
        });

        console.log(`📋 Setup: Order ${order._id} created. Store Active Count: 1`);

        // 2. Test Get Booking (Seller)
        console.log("\n--- Test 1: Get Seller Orders ---");
        const req1 = mockReq({}, seller);
        const res1 = mockRes();
        await bookingController.getSellerOrders(req1, res1);

        if (res1.jsonData.orders.length > 0 && res1.jsonData.orders[0]._id.toString() === order._id.toString()) {
            console.log("✅ Fetched orders successfully");
        } else {
            throw new Error("Failed to fetch orders");
        }

        // 3. Test Status Update (Move to Stitching - No Capacity Change)
        console.log("\n--- Test 2: Update to 'in_stitching' ---");
        const req2 = mockReq({ status: 'in_stitching' }, seller, { orderId: order._id });
        const res2 = mockRes();
        await bookingController.updateOrderStatus(req2, res2);

        const updatedOrder = await Booking.findById(order._id);
        const storeAfterUpdate = await Store.findById(store._id);

        if (updatedOrder.orderStatus === 'in_stitching' && storeAfterUpdate.activeOrderCount === 1) {
            console.log("✅ Status updated to 'in_stitching', capacity unchanged (Correct)");
        } else {
            throw new Error(`Failed: Status=${updatedOrder.orderStatus}, Count=${storeAfterUpdate.activeOrderCount}`);
        }

        // 4. Test Status Update (Cancel - Release Capacity)
        console.log("\n--- Test 3: Cancel Order (Release Capacity) ---");
        // Re-simulate order creation for clean test or use existing? 
        // Let's cancel the same order.
        const req3 = mockReq({ status: 'cancelled' }, seller, { orderId: order._id });
        const res3 = mockRes();
        await bookingController.updateOrderStatus(req3, res3);

        const cancelledOrder = await Booking.findById(order._id);
        const storeAfterCancel = await Store.findById(store._id);

        if (cancelledOrder.orderStatus === 'cancelled' && storeAfterCancel.activeOrderCount === 0) {
            console.log("✅ Status updated to 'cancelled', capacity released to 0 (Correct)");
        } else {
            throw new Error(`Failed: Status=${cancelledOrder.orderStatus}, Count=${storeAfterCancel.activeOrderCount}`);
        }

        console.log("\n✅ ADMIN VERIFICATION SUCCESSFUL!");

    } catch (err) {
        console.error("\n❌ VERIFICATION FAILED:", err);
    } finally {
        await mongoose.connection.close();
    }
}

runAdminVerification();
