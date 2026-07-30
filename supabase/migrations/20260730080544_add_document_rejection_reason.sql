ALTER TABLE documents ADD COLUMN IF NOT EXISTS rejection_reason text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS rejected boolean DEFAULT false;
