const mongoose = require("mongoose");

// ✅ Register models
require("./models/users");
require("./models/Store");
require("./models/listing");

const Transaction = require("./models/Transactions");

const printTransactions = async () => {
  try {
    await mongoose.connect("mongodb://127.0.0.1:27017/test");
    console.log("✅ MongoDB connected...");

    const PAGE_SIZE = 50;
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      const transactions = await Transaction.find()
        .populate("user", "name email")
        .populate("store", "name")
        .populate("listing", "title price")
        .limit(50)
        .skip(page * 50)
        .lean();

      if (transactions.length === 0) break;

      console.log(`\n--- Page ${page + 1} ---`);
      console.log(transactions);

      page++;
    }
  } catch (err) {
    console.error("❌ Error printing transactions", err);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 MongoDB disconnected");
  }
};

printTransactions();
