const mongoose = require("mongoose");

const dbConnection = async () => {
  try {
    const db = await mongoose.connect(process.env.DB_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log(`Connected to MongoDB ${db.connection.host}`);
  } catch (err) {
    console.error(`Database connection error: ${err.message}`);
    throw err;
  }
};
module.exports = dbConnection;
