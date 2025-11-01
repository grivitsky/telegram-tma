-- Update existing categories with new emojis and colors
-- Copy-paste this into your SQL editor and run it

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

