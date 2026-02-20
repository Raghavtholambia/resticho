const mongoose = require('mongoose');
const User = require('./models/users');
const Store = require('./models/store');
const Listing = require('./models/listing');
const Booking = require('./models/Booking');
const bookingController = require('./controllers/bookingController');

// Mock Request/Response
const mockReq = (body, user) => ({
    body,
    user,
    params: {},
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

async function runVerification() {
    console.log("🚀 Starting Verification...");

    // 1. Connect DB
    await mongoose.connect("mongodb://127.0.0.1:27017/test");
    console.log("✅ DB Connected");

    try {
        // 2. Setup Data
        // Create Seller
        const sellerEmail = `seller_${Date.now()}@test.com`;
        let seller = await User.create({
            username: `Seller_${Date.now()}`,
            email: sellerEmail,
            role: 'seller'
        });

        // Create Store
        let store = await Store.create({
            owner: seller._id,
            shopName: `TailorShop_${Date.now()}`,
            slug: `tailor-shop-${Date.now()}`,
            maxConcurrentOrders: 2, // Low limit for testing
            activeOrderCount: 0
        });

        // Create Listing
        let listing = await Listing.create({
            itemName: "Custom Suit",
            description: "Bespoke suit",
            pricePerDay: 5000,
            category: "Others",
            owner: seller._id,
            store: store._id,
            listingType: 'tailoring',
            image: { url: "http://example.com/img.jpg", filename: "img.jpg" }
        });

        // Create Buyer
        let buyer = await User.create({
            username: `Buyer_${Date.now()}`,
            email: `buyer_${Date.now()}@test.com`,
            role: 'user'
        });

        console.log(`📋 Setup Complete. Store Capacity: ${store.maxConcurrentOrders}`);

        // 3. Test Booking 1 (Should Succeed)
        console.log("\n--- Attempting Booking 1 (Expected: Success) ---");
        let req1 = mockReq({
            listingId: listing._id,
            quantity: 1,
            measurements: { chest: 40, waist: 34 },
            selectedFabric: "Wool",
            startDate: new Date(),
            endDate: new Date()
        }, buyer);
        let res1 = mockRes();

        await bookingController.createBooking(req1, res1);
        console.log(`Response 1: Status ${res1.statusCode}, Message: ${res1.jsonData?.message}`);

        if (res1.statusCode !== 201) throw new Error("Booking 1 failed unexpectedly");

        // 4. Test Booking 2 (Should Succeed)
        console.log("\n--- Attempting Booking 2 (Expected: Success) ---");
        let req2 = mockReq({
            listingId: listing._id,
            quantity: 1,
            measurements: { chest: 40, waist: 34 },
            selectedFabric: "Wool",
            startDate: new Date(),
            endDate: new Date()
        }, buyer);
        let res2 = mockRes();

        await bookingController.createBooking(req2, res2);
        console.log(`Response 2: Status ${res2.statusCode}, Message: ${res2.jsonData?.message}`);

        if (res2.statusCode !== 201) throw new Error("Booking 2 failed unexpectedly");

        // 5. Check Store Counter
        const updatedStore = await Store.findById(store._id);
        console.log(`\nStore Active Count: ${updatedStore.activeOrderCount} (Expected: 2)`);
        if (updatedStore.activeOrderCount !== 2) throw new Error("Store counter check failed");

        // 6. Test Booking 3 (Should Fail - Capacity Full)
        console.log("\n--- Attempting Booking 3 (Expected: Fail - Capacity Full) ---");
        let req3 = mockReq({
            listingId: listing._id,
            quantity: 1,
            startDate: new Date(),
            endDate: new Date()
        }, buyer);
        let res3 = mockRes();

        await bookingController.createBooking(req3, res3);
        console.log(`Response 3: Status ${res3.statusCode}, Message: ${res3.jsonData?.message}`);

        if (res3.statusCode !== 400) throw new Error("Booking 3 should have failed but didn't");


        console.log("\n✅ VERIFICATION SUCCESSFUL! All checks passed.");

    } catch (err) {
        console.error("\n❌ VERIFICATION FAILED:", err);
    } finally {
        await mongoose.connection.close();
    }
}

runVerification();
