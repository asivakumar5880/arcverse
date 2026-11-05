-- ========================================================
-- ArcVerse: Anime Detail + Watch Database Schema
-- Relations: Anime -> Season -> Episode -> LanguageVersion
-- ========================================================

-- 1. Anime catalog
CREATE TABLE IF NOT EXISTS animes (
  id INT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  title_romaji VARCHAR(255),
  banner_url TEXT,
  cover_url TEXT,
  total_episodes INT,
  format VARCHAR(30) DEFAULT 'TV',
  status VARCHAR(50),
  average_score NUMERIC(3, 1),
  synopsis TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Seasons table
CREATE TABLE IF NOT EXISTS seasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anime_id INT NOT NULL REFERENCES animes(id) ON DELETE CASCADE,
  season_number INT NOT NULL,
  title VARCHAR(150) NOT NULL DEFAULT 'Season 1',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(anime_id, season_number)
);

-- 3. Episodes table (order is by season_number, then episode_number)
CREATE TABLE IF NOT EXISTS episodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  anime_id INT NOT NULL REFERENCES animes(id) ON DELETE CASCADE,
  episode_number INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  duration INT DEFAULT 1440, -- duration in seconds (24 min default)
  thumbnail_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(season_id, episode_number)
);

-- 4. Language Versions (Multiple audio languages & sub/dub per episode)
CREATE TABLE IF NOT EXISTS language_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id UUID NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  anime_id INT NOT NULL REFERENCES animes(id) ON DELETE CASCADE,
  language VARCHAR(50) NOT NULL, -- 'Tamil', 'Hindi', 'English', 'Japanese', etc.
  type VARCHAR(10) NOT NULL DEFAULT 'sub', -- 'sub' or 'dub'
  video_url TEXT NOT NULL,
  subtitle_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(episode_id, language, type)
);

-- 5. User Watch Progress & History
CREATE TABLE IF NOT EXISTS watch_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  anime_id INT NOT NULL REFERENCES animes(id) ON DELETE CASCADE,
  episode_id UUID NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  current_time NUMERIC(8, 2) NOT NULL DEFAULT 0,
  duration NUMERIC(8, 2) NOT NULL DEFAULT 0,
  is_watched BOOLEAN NOT NULL DEFAULT FALSE,
  last_language VARCHAR(50) DEFAULT 'Japanese',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, episode_id)
);

-- ========================================================
-- Row-Level Security (RLS) Policies
-- ========================================================
ALTER TABLE animes ENABLE ROW LEVEL SECURITY;
ALTER TABLE seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE language_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE watch_progress ENABLE ROW LEVEL SECURITY;

-- Public / Anonymous Users: Can SELECT (watch and browse)
CREATE POLICY "Public read animes" ON animes FOR SELECT USING (true);
CREATE POLICY "Public read seasons" ON seasons FOR SELECT USING (true);
CREATE POLICY "Public read episodes" ON episodes FOR SELECT USING (true);
CREATE POLICY "Public read language_versions" ON language_versions FOR SELECT USING (true);

-- Authenticated Users: Can manage their own watch progress
CREATE POLICY "Users view own progress" ON watch_progress
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users update own progress" ON watch_progress
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Owner / Admin Only: Restrict all INSERT, UPDATE, DELETE to admin role
CREATE POLICY "Admin full access animes" ON animes
  FOR ALL USING (auth.jwt() ->> 'role' = 'admin')
  WITH CHECK (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Admin full access seasons" ON seasons
  FOR ALL USING (auth.jwt() ->> 'role' = 'admin')
  WITH CHECK (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Admin full access episodes" ON episodes
  FOR ALL USING (auth.jwt() ->> 'role' = 'admin')
  WITH CHECK (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Admin full access language_versions" ON language_versions
  FOR ALL USING (auth.jwt() ->> 'role' = 'admin')
  WITH CHECK (auth.jwt() ->> 'role' = 'admin');

-- Storage Bucket Security Policy (for storage.objects)
-- Uploads restricted to role = 'admin'
-- Bucket name: 'arcverse-videos'
/*
CREATE POLICY "Public video playback" ON storage.objects
  FOR SELECT USING (bucket_id = 'arcverse-videos');

CREATE POLICY "Admin video uploads" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'arcverse-videos' AND
    auth.jwt() ->> 'role' = 'admin'
  );

CREATE POLICY "Admin video modifications" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'arcverse-videos' AND
    auth.jwt() ->> 'role' = 'admin'
  );

CREATE POLICY "Admin video deletion" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'arcverse-videos' AND
    auth.jwt() ->> 'role' = 'admin'
  );
*/
