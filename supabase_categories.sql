-- Create categories table
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    emoji TEXT NOT NULL,
    color TEXT NOT NULL, -- hex color code
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert predefined categories with colors and emojis
INSERT INTO categories (name, emoji, color) VALUES
    ('other', '📦', '#A8B2C1'),
    ('subscription', '🧾', '#5EB0F3'),
    ('gifts', '🎁', '#F47C97'),
    ('utilities', '💡', '#F8D96D'),
    ('clothing', '👕', '#7ED0A6'),
    ('undefined', '❔', '#C7C7C7'),
    ('business', '💼', '#B28AF9'),
    ('housing', '🏠', '#73C4A9'),
    ('food', '🍔', '#F6A15C'),
    ('eating out', '🍽️', '#F57E6C'),
    ('groceries', '🛒', '#E0B95D'),
    ('dates', '💕', '#EC7BAF'),
    ('transport', '🚗', '#68B8F0'),
    ('coffee', '☕', '#C08A5A'),
    ('entertainment', '🎬', '#8B91E1')
ON CONFLICT (name) DO UPDATE SET emoji = EXCLUDED.emoji, color = EXCLUDED.color;

-- Add category_id column to spendings table if it doesn't exist
-- Note: Run this only if category_id column doesn't exist in your spendings table
-- ALTER TABLE spendings ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES categories(id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_categories_name ON categories(name);
CREATE INDEX IF NOT EXISTS idx_spendings_category_id ON spendings(category_id);

