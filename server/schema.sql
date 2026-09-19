PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
 password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'customer' CHECK(role IN ('customer','admin')),
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 csrf_token TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS categories (
 id INTEGER PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
 parent_id INTEGER REFERENCES categories(id) ON DELETE RESTRICT, icon TEXT NOT NULL DEFAULT '',
 CHECK(parent_id IS NULL OR parent_id != id)
);
CREATE TABLE IF NOT EXISTS products (
 id INTEGER PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL,
 category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
 brand TEXT NOT NULL, age_min INTEGER NOT NULL DEFAULT 0 CHECK(age_min BETWEEN 0 AND 18),
 price INTEGER NOT NULL CHECK(price > 0), old_price INTEGER CHECK(old_price IS NULL OR old_price > price),
 stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0), image TEXT NOT NULL,
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS cart_items (
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
 quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 99), PRIMARY KEY(user_id, product_id)
);
CREATE TABLE IF NOT EXISTS favorites (
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE, PRIMARY KEY(user_id, product_id)
);
CREATE TABLE IF NOT EXISTS orders (
 id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
 request_key TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','confirmed','shipped','completed','cancelled')),
 customer_name TEXT NOT NULL, phone TEXT NOT NULL, delivery_method TEXT NOT NULL CHECK(delivery_method IN ('pickup','delivery')),
 address TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
 total INTEGER NOT NULL CHECK(total > 0), payment_provider TEXT NOT NULL,
 payment_status TEXT NOT NULL DEFAULT 'pending' CHECK(payment_status IN ('pending','paid','refunded')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id,request_key)
);
CREATE TABLE IF NOT EXISTS order_items (
 id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id),
 product_id INTEGER NOT NULL REFERENCES products(id), title TEXT NOT NULL, image TEXT NOT NULL,
 price INTEGER NOT NULL CHECK(price > 0), quantity INTEGER NOT NULL CHECK(quantity > 0)
);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id,active);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id,created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
PRAGMA user_version = 1;
