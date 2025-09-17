require('dotenv').config();

const { drizzle } = require('drizzle-orm/postgres-js');
const postgres = require('postgres');
const { pgTable, text, integer, timestamp, serial } = require('drizzle-orm/pg-core');

// Initialize PostgreSQL connection
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    console.error('DATABASE_URL environment variable is required');
    process.exit(1);
}

const sql = postgres(connectionString, {
    ssl: true // ✅ F
    });
const db = drizzle(sql);

// Define tables
const reviews = pgTable('reviews', {
    id: serial('id').primaryKey(),
    userId: text('user_id').notNull(),
    userName: text('user_name').notNull(),
    guildId: text('guild_id').notNull(),
    rating: integer('rating').notNull(),
    comment: text('comment').notNull(),
    product: text('product').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull()
});

const settings = pgTable('settings', {
    id: serial('id').primaryKey(),
    guildId: text('guild_id').notNull().unique(),
    reviewChannelId: text('review_channel_id'),
    embedColor: text('embed_color').default('#3498db'),
    embedTitle: text('embed_title').default('評分系統.'),
    embedDescription: text('embed_description').default('請完成所有步驟以提交您的評價。'),
    products: text('products').default('[]'), // JSON string array
    adminRoles: text('admin_roles').default('[]'), // JSON string array
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
});

// Initialize database tables
const initDatabase = async () => {
    try {
        // Create tables if they don't exist
        await sql`
            CREATE TABLE IF NOT EXISTS reviews (
                id SERIAL PRIMARY KEY,
                user_id TEXT NOT NULL,
                user_name TEXT NOT NULL,
                guild_id TEXT NOT NULL,
                rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
                comment TEXT NOT NULL,
                product TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
            );
        `;

        await sql`
            CREATE TABLE IF NOT EXISTS settings (
                id SERIAL PRIMARY KEY,
                guild_id TEXT NOT NULL UNIQUE,
                review_channel_id TEXT,
                embed_color TEXT DEFAULT '#3498db',
                embed_title TEXT DEFAULT '評分系統.',
                embed_description TEXT DEFAULT '請完成所有步驟以提交您的評價。',
                products TEXT DEFAULT '[]',
                admin_roles TEXT DEFAULT '[]',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
            );
        `;

        console.log('Database tables initialized successfully');
    } catch (error) {
        console.error('Error initializing database:', error);
        throw error;
    }
};

// Database helper functions
const getSettings = async (guildId) => {
    try {
        const result = await sql`
            SELECT * FROM settings WHERE guild_id = ${guildId} LIMIT 1
        `;
        
        if (result.length === 0) {
            // Create default settings
            const newSettings = await sql`
                INSERT INTO settings (guild_id) 
                VALUES (${guildId}) 
                ON CONFLICT (guild_id) DO NOTHING
                RETURNING *
            `;
            return newSettings[0] || {
                guild_id: guildId,
                embed_color: '#3498db',
                embed_title: '評分系統.',
                embed_description: 'P請完成所有步驟以提交您的評價。',
                products: '[]',
                admin_roles: '[]'
            };
        }
        
        return result[0];
    } catch (error) {
        console.error('Error getting settings:', error);
        return {
            guild_id: guildId,
            embed_color: '#3498db',
            embed_title: '評分系統.',
            embed_description: '請完成所有步驟以提交您的評價。',
            products: '[]',
            admin_roles: '[]'
        };
    }
};

const updateSettings = async (guildId, updates) => {
    try {
        // Whitelist allowed keys for defense-in-depth
        const allowedKeys = ['embed_title', 'embed_description', 'embed_color', 'products', 'review_channel_id', 'admin_roles'];
        const filteredUpdates = {};
        
        for (const [key, value] of Object.entries(updates)) {
            if (allowedKeys.includes(key)) {
                filteredUpdates[key] = value;
            }
        }
        
        if (Object.keys(filteredUpdates).length === 0) return true;
        
        // Use postgres-js object-based helpers for clean UPSERT without manual string construction
        await sql`
            INSERT INTO settings ${sql({ guild_id: String(guildId), ...filteredUpdates })}
            ON CONFLICT (guild_id) 
            DO UPDATE SET ${sql(filteredUpdates)}, updated_at = CURRENT_TIMESTAMP
        `;
        
        return true;
    } catch (error) {
        console.error('Error updating settings:', error);
        return false;
    }
};

const saveReview = async (reviewData) => {
    try {
        const result = await sql`
            INSERT INTO reviews (user_id, user_name, guild_id, rating, comment, product)
            VALUES (${reviewData.userId}, ${reviewData.userName}, ${reviewData.guildId}, ${reviewData.rating}, ${reviewData.comment}, ${reviewData.product})
            RETURNING *
        `;
        return result[0];
    } catch (error) {
        console.error('Error saving review:', error);
        throw error;
    }
};

module.exports = {
    db,
    sql,
    reviews,
    settings,
    initDatabase,
    getSettings,
    updateSettings,
    saveReview
};