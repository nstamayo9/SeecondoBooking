const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
        // Force IPv4 (Fixes DNS/Network issues on some hosts)
        family: 4,

        // Connection Pool
        maxPoolSize: 10,
        minPoolSize: 1, // CRITICAL: Keep at least 1 connection open so it doesn't have to reconnect every time
        
        // Timeouts
        serverSelectionTimeoutMS: 5000, // Fail fast if DB is down
        socketTimeoutMS: 0, // CRITICAL: 0 means "Never close socket due to inactivity". Fixes Cron ECONNRESET.
    });
    
    process.on('SIGINT', async () => {
    await mongoose.connection.close();
    console.log('MongoDB connection closed due to app termination');
    process.exit(0);
});

    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1); // Stop the app if DB fails
  }
};

module.exports = connectDB;