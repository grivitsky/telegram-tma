-- Add AI features toggle column to users table
-- This boolean field allows users to enable or disable AI features
ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_features_enabled BOOLEAN DEFAULT false;

-- Set default to false for existing users without the field set
UPDATE users
SET ai_features_enabled = false
WHERE ai_features_enabled IS NULL;

-- Create index for faster lookups when filtering by AI features status
CREATE INDEX IF NOT EXISTS idx_users_ai_features_enabled ON users(ai_features_enabled);

