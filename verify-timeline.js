const mongoose = require('mongoose');
const User = require('./models/users');
const Store = require('./models/store');
const Listing = require('./models/listing');
const Booking = require('./models/Booking');
const ShopCoin = require('./models/ShopCoin'); // Added check
const Transaction = require('./models/Transactions'); // Added check
const rentalController = require('./controllers/rentalController');

// Mock Request/Response
const mockReq = (user) => ({
    user,
    flash: () => { }
});

const mockRes = () => {
    const res = {};
    res.render = (view, data) => {
        res.viewName = view;
        res.viewData = data;
        return res;
    };
    return res;
};

async function runTimelineVerification() {
    console.log("🚀 Starting Timeline Verification...");

    await mongoose.connect("mongodb://127.0.0.1:27017/test");
    console.log("✅ DB Connected");

    try {
        // 1. Setup Data
        const seller = await User.create({ username: `Seller_${Date.now()}`, email: `seller_${Date.now()}@test.com` });
        const buyer = await User.create({ username: `Buyer_${Date.now()}`, email: `buyer_${Date.now()}@test.com` });

        const store = await Store.create({
            owner: seller._id,
            shopName: `TimelineShop_${Date.now()}`,
            slug: `timeline-shop-${Date.now()}`,
            maxConcurrentOrders: 5,
            activeOrderCount: 0
        });

        const listing = await Listing.create({
            itemName: "Timeline Suit",
            category: "Others",
            pricePerDay: 5000,
            owner: seller._id,
            store: store._id,
            listingType: 'tailoring',
            image: { url: "http://img.com", filename: "img" }
        });

        // Create orders in different states
        await Booking.create({
            productId: listing._id,
            renterId: buyer._id,
            ownerId: seller._id,
            startDate: new Date(),
            endDate: new Date(),
            totalPrice: 5000,
            status: "confirmed",
            orderStatus: "in_stitching",
            selectedFabric: "Silk",
            selectedSize: "M"
        });

        await Booking.create({
            productId: listing._id,
            renterId: buyer._id,
            ownerId: seller._id,
            startDate: new Date(),
            endDate: new Date(),
            totalPrice: 5000,
            status: "confirmed",
            orderStatus: "delivered",
            selectedFabric: "Cotton",
            selectedSize: "L"
        });

        console.log("📋 Setup: Created orders with 'in_stitching' and 'delivered' status.");

        // 2. Test Get Rental History
        console.log("\n--- Test: Fetch Customer History ---");
        const req = mockReq(buyer);
        const res = mockRes();

        await rentalController.getRentalHistory(req, res);

        const history = res.viewData.rentals;

        // Assertions
        if (history.length !== 2) {
            throw new Error(`Expected 2 orders, got ${history.length}`);
        }

        const stitchingOrder = history.find(h => h.orderStatus === 'in_stitching');
        const deliveredOrder = history.find(h => h.orderStatus === 'delivered');

        if (!stitchingOrder || !deliveredOrder) {
            throw new Error("Failed to find orders with correct statuses");
        }

        console.log(`✅ Found 'in_stitching' order for item: ${stitchingOrder.productId.itemName}`);
        console.log(`✅ Found 'delivered' order for item: ${deliveredOrder.productId.itemName}`);
        console.log("✅ Timeline data fetch successful!");

    } catch (err) {
        console.error("\n❌ VERIFICATION FAILED:", err);
    } finally {
        await mongoose.connection.close();
    }
}

runTimelineVerification();
