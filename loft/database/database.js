const config = require("../../base");
const Sequelize = require("sequelize");
const fs = require("fs");
const path = require("path");

class DatabaseManager {
    static instance = null;

    static getInstance() {
        if (!DatabaseManager.instance) {
            const DATABASE_URL = config.DATABASE_URL;
            const DEFAULT_SQLITE_PATH = path.join(__dirname, "database.db");

            // Check if DATABASE_URL is valid (not null, undefined, or empty string)
            const hasValidDatabaseUrl = DATABASE_URL && typeof DATABASE_URL === 'string' && DATABASE_URL.trim().length > 0;

            if (!hasValidDatabaseUrl) {
                console.log("ℹ️  DATABASE_URL Empty or Invalid, Using SQLite");
                const dbDir = path.dirname(DEFAULT_SQLITE_PATH);
                if (!fs.existsSync(dbDir)) {
                    fs.mkdirSync(dbDir, { recursive: true });
                }

                DatabaseManager.instance = new Sequelize({
                    dialect: "sqlite",
                    storage: DEFAULT_SQLITE_PATH,
                    logging: false,
                    pool: {
                        max: 1,
                        min: 0,
                        acquire: 30000,
                        idle: 10000,
                    },
                    retry: {
                        max: 5,
                    },
                    dialectOptions: {
                        busyTimeout: 30000,
                    },
                });
            } else {
                try {
                    DatabaseManager.instance = new Sequelize(DATABASE_URL, {
                        dialect: "postgres",
                        protocol: "postgres",
                        logging: false,
                        dialectOptions: {
                            ssl: { require: true, rejectUnauthorized: false }
                        },
                        pool: {
                            max: 5,
                            min: 0,
                            acquire: 30000,
                            idle: 10000
                        }
                    });
                } catch (error) {
                    console.error("❌ Failed to connect to PostgreSQL, falling back to SQLite:", error.message);
                    // Fallback to SQLite if PostgreSQL connection fails
                    const dbDir = path.dirname(DEFAULT_SQLITE_PATH);
                    if (!fs.existsSync(dbDir)) {
                        fs.mkdirSync(dbDir, { recursive: true });
                    }

                    DatabaseManager.instance = new Sequelize({
                        dialect: "sqlite",
                        storage: DEFAULT_SQLITE_PATH,
                        logging: false,
                        pool: {
                            max: 1,
                            min: 0,
                            acquire: 30000,
                            idle: 10000,
                        },
                        retry: {
                            max: 5,
                        },
                        dialectOptions: {
                            busyTimeout: 30000,
                        },
                    });
                }
            }
        }
        return DatabaseManager.instance;
    }
}

const DATABASE = DatabaseManager.getInstance();

async function syncDatabase() {
    try {
        await DATABASE.sync();
        console.log("✅ Database Synchronized.");
    } catch (error) {
        console.error("Error synchronizing the database:", error);
        throw error;
    }
}

module.exports = { DATABASE, syncDatabase };