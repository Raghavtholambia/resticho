const User = require("../models/users");
const Store = require("../models/store");

module.exports = async function deleteOrphanStores() {
  try {
    const stores = await Store.find();

    for (let store of stores) {
      const ownerExists = await User.exists({ _id: store.owner });
      console.log("Checking store:", store.shopName, "Owner exists:", ownerExists);
      if (!ownerExists) {
        await Store.findByIdAndDelete(store._id);
        console.log(`🗑️ Deleted orphan store: ${store.shopName} (${store._id})`);
      }
    }

    console.log("✔ Store cleanup completed");
  } catch (err) {
    console.error("❌ Error cleaning orphan stores:", err);
  }
};
