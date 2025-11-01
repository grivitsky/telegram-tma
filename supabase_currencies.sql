-- Create currencies table
CREATE TABLE IF NOT EXISTS currencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE, -- Currency code (USD, EUR, etc.)
    name TEXT NOT NULL, -- Full name (US Dollar, Euro, etc.)
    symbol TEXT NOT NULL, -- Currency symbol ($, €, etc.)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert predefined currencies
INSERT INTO currencies (code, name, symbol) VALUES
    ('USD', 'US Dollar', '$'),
    ('EUR', 'Euro', '€'),
    ('PLN', 'Polish Zloty', 'zł'),
    ('BYN', 'Belarusian Ruble', 'Br'),
    ('CHF', 'Swiss Franc', 'CHF')
ON CONFLICT (code) DO NOTHING;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_currencies_code ON currencies(code);

-- Add default_currency_id column to users table
-- This will reference the currencies table
ALTER TABLE users ADD COLUMN IF NOT EXISTS default_currency_id UUID REFERENCES currencies(id);

-- Set default currency to USD for existing users without a currency
-- First, get the USD currency ID
UPDATE users
SET default_currency_id = (SELECT id FROM currencies WHERE code = 'USD' LIMIT 1)
WHERE default_currency_id IS NULL;

