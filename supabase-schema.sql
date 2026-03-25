-- Botface Database Schema
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)

-- User brands table
CREATE TABLE IF NOT EXISTS user_brands (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  url TEXT,
  logo_url TEXT,
  brand_data JSONB NOT NULL DEFAULT '{}',
  brand_colors JSONB DEFAULT '{}',
  product_type TEXT,
  language TEXT DEFAULT 'English',
  fonts TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- User pipelines table
CREATE TABLE IF NOT EXISTS user_pipelines (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  brand_id UUID REFERENCES user_brands(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  post_type TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'Image',
  thumbnail_url TEXT,
  socials TEXT[] DEFAULT '{}',
  frequency TEXT DEFAULT 'Every day',
  preferred_time TEXT DEFAULT '09:00',
  guidance TEXT DEFAULT '',
  reference_images TEXT[] DEFAULT '{}',
  enabled BOOLEAN DEFAULT true,
  last_generated TIMESTAMPTZ,
  last_posted TIMESTAMPTZ,
  next_scheduled TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Generated assets table
CREATE TABLE IF NOT EXISTS generated_assets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  brand_id UUID REFERENCES user_brands(id) ON DELETE SET NULL,
  pipeline_id UUID REFERENCES user_pipelines(id) ON DELETE SET NULL,
  title TEXT,
  format TEXT,
  preview_url TEXT,
  media_url TEXT,
  provider TEXT,
  status TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Connected social accounts table
CREATE TABLE IF NOT EXISTS connected_accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  platform TEXT NOT NULL,
  username TEXT,
  profile_data JSONB DEFAULT '{}',
  upload_post_profile TEXT,
  connected BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, platform)
);

-- Row Level Security
ALTER TABLE user_brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE connected_accounts ENABLE ROW LEVEL SECURITY;

-- Policies: users can only access their own data
CREATE POLICY "Users can view own brands" ON user_brands FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own brands" ON user_brands FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own brands" ON user_brands FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own brands" ON user_brands FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own pipelines" ON user_pipelines FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own pipelines" ON user_pipelines FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own pipelines" ON user_pipelines FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own pipelines" ON user_pipelines FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own assets" ON generated_assets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own assets" ON generated_assets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own assets" ON generated_assets FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own accounts" ON connected_accounts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own accounts" ON connected_accounts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own accounts" ON connected_accounts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own accounts" ON connected_accounts FOR DELETE USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_brands_user_id ON user_brands(user_id);
CREATE INDEX IF NOT EXISTS idx_user_pipelines_user_id ON user_pipelines(user_id);
CREATE INDEX IF NOT EXISTS idx_generated_assets_user_id ON generated_assets(user_id);
CREATE INDEX IF NOT EXISTS idx_connected_accounts_user_id ON connected_accounts(user_id);
