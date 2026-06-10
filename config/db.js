const mysql = require("mysql2");

// Create connection pool for Railway
const db = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,

  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Test connection
db.getConnection((err, connection) => {
  if (err) {
    console.error("❌ Database Error:", err.message);
  } else {
    console.log("✅ MySQL Connected Successfully");
    console.log("📍 Host:", process.env.DB_HOST);
    console.log("📂 Database:", process.env.DB_NAME);
    connection.release();
  }
});

module.exports = db;