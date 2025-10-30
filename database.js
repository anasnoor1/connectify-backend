const mongoose = require("mongoose");
const connectDB = async () => {
    try {
        const uri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/Connectify";
        await mongoose.connect(uri);
        console.log("Connected to MongoDB");
    } catch (err) {
        console.error(" MongoDB connection error:", err);
        process.exit(1);
    }
};
module.exports = connectDB;