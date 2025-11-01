-- Update existing categories with new emojis and colors
-- Copy-paste this into your SQL editor and run it

INSERT INTO categories (name, emoji, color) VALUES
    ('other', '📦', '#C0C8D1'),
    ('subscription', '🧾', '#61B5F7'),
    ('gifts', '🎁', '#F2A2BB'),
    ('utilities', '💡', '#F8DE7B'),
    ('clothing', '👕', '#A1C7FA'),
    ('undefined', '❔', '#D3D3D3'),
    ('business', '💼', '#F5BDE6'),
    ('housing', '🏠', '#FFE493'),
    ('food', '🍔', '#89D2F6'),
    ('eating out', '🍽️', '#F6A1A1'),
    ('groceries', '🛒', '#F6D88B'),
    ('dates', '💕', '#F7B3CA'),
    ('transport', '🚗', '#7CC5F8'),
    ('coffee', '☕', '#E2B679'),
    ('entertainment', '🎬', '#B7D2F7')
ON CONFLICT (name) DO UPDATE SET emoji = EXCLUDED.emoji, color = EXCLUDED.color;

