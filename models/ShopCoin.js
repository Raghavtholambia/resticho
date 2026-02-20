const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const shopCoinSchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    store: {
        type: Schema.Types.ObjectId,
        ref: "Store",
        required: true
    },
    coins: {
        type: Number,
        default: 0
    }
}, { timestamps: true });

module.exports = mongoose.model("ShopCoin", shopCoinSchema);
