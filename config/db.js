const mongoose = require("mongoose");

async function connectDatabase() {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error("Missing MONGODB_URI. Add it to your .env file before starting the server.");
  }

  mongoose.set("strictQuery", true);
  await mongoose.connect(mongoUri);

  console.log(`MongoDB connected on ${mongoose.connection.host}`);
}

module.exports = connectDatabase;
