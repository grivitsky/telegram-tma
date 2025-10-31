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
    ('undefined', '❓', '#9E9E9E'),      -- Grey
    ('groceries', '🛒', '#BA68C8'),      -- Light purple
    ('food', '🍔', '#FF9800'),           -- Orange
    ('eating out', '🍽️', '#64B5F6'),     -- Light blue
    ('transport', '🚗', '#FFB74D'),      -- Orange/Yellow
    ('subscription', '💳', '#F48FB1'),    -- Pink
    ('coffee', '☕', '#8D6E63'),         -- Brown
    ('dates', '💕', '#F8BBD0'),          -- Light pink
    ('housing', '🏠', '#42A5F5'),        -- Blue
    ('other', '📦', '#BDBDBD'),          -- Light grey
    ('entertainment', '🎬', '#9575CD'),   -- Purple
    ('utilities', '💡', '#81C784'),      -- Light green
    ('clothing', '👕', '#F8BBD0'),       -- Light pink
    ('business', '💼', '#616161'),       -- Dark grey
    ('gifts', '🎁', '#E57373')          -- Light red/pink
ON CONFLICT (name) DO NOTHING;

-- Add category_id column to spendings table if it doesn't exist
-- Note: Run this only if category_id column doesn't exist in your spendings table
-- ALTER TABLE spendings ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES categories(id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_categories_name ON categories(name);
CREATE INDEX IF NOT EXISTS idx_spendings_category_id ON spendings(category_id);

