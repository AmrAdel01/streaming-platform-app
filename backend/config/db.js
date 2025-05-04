const mongoose = require("mongoose");

const dbConnection = async () => {
  try {
    const dbUrl = process.env.DB_URL;
    if (!dbUrl || typeof dbUrl !== "string") {
      throw new Error("DB_URL is not defined or not a string in .env file");
    }
    await mongoose.connect(dbUrl, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
      maxPoolSize: 10,
      minPoolSize: 2,
      retryWrites: true,
      w: "majority",
    });
    console.log("MongoDB Connected...");
  } catch (error) {
    console.error("MongoDB Connection Error:", error.message);
    process.exit(1);
  }
};

module.exports = dbConnection;
