-- Brain Memory Schema
CREATE TABLE IF NOT EXISTS memory (
    id SERIAL PRIMARY KEY,
    type VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    tags TEXT[] DEFAULT '{}',
    refs TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index fÃ¼r schnelle Tag-Suche
CREATE INDEX IF NOT EXISTS idx_memory_tags ON memory USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_memory_type ON memory(type);
CREATE INDEX IF NOT EXISTS idx_memory_created_at ON memory(created_at DESC);

-- Seed: Initial policy entry
INSERT INTO memory (type, content, tags, refs) VALUES
('policy', 'B2C Outbound nur mit nachweisbarem Consent.', ARRAY['policy', 'consent', 'b2c'], ARRAY['ops/POLICY.md']);
