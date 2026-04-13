
-- Create enum for event types
CREATE TYPE public.political_event_type AS ENUM (
  'vote', 'speech', 'committee_join', 'committee_leave', 'election',
  'appointment', 'resignation', 'scandal', 'policy_change', 'party_switch',
  'legislation_sponsored', 'foreign_meeting', 'lobbying_meeting', 'corporate_event',
  'financial_disclosure', 'social_media', 'travel', 'donation_received',
  'public_statement', 'court_case', 'media_appearance'
);

CREATE TYPE public.data_source_type AS ENUM (
  'eu_parliament', 'un_digital_library', 'twitter', 'official_record',
  'news', 'financial_filing', 'parliamentary_record', 'court_filing', 'lobby_register'
);

CREATE TYPE public.sentiment_type AS ENUM ('positive', 'negative', 'neutral');

-- Politicians table
CREATE TABLE public.politicians (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  external_id TEXT,
  name TEXT NOT NULL,
  country_code TEXT NOT NULL,
  country_name TEXT NOT NULL,
  party_name TEXT,
  party_abbreviation TEXT,
  role TEXT,
  jurisdiction TEXT DEFAULT 'federal',
  city TEXT,
  continent TEXT,
  twitter_handle TEXT,
  photo_url TEXT,
  birth_year INTEGER,
  in_office_since DATE,
  committees TEXT[] DEFAULT '{}',
  top_donors TEXT[] DEFAULT '{}',
  net_worth TEXT,
  data_source data_source_type,
  source_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Political events (git-log style)
CREATE TABLE public.political_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  politician_id UUID REFERENCES public.politicians(id) ON DELETE CASCADE NOT NULL,
  hash TEXT NOT NULL DEFAULT substring(md5(random()::text), 1, 6),
  event_type political_event_type NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  source data_source_type,
  source_url TEXT,
  source_handle TEXT,
  sentiment sentiment_type,
  entities TEXT[] DEFAULT '{}',
  evidence_count INTEGER DEFAULT 1,
  diff_removed TEXT,
  diff_added TEXT,
  event_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  raw_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Data sources tracking
CREATE TABLE public.data_sources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  source_type data_source_type NOT NULL,
  base_url TEXT,
  description TEXT,
  last_synced_at TIMESTAMP WITH TIME ZONE,
  total_records INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Scrape run logs
CREATE TABLE public.scrape_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_id UUID REFERENCES public.data_sources(id),
  source_type data_source_type NOT NULL,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'partial')),
  records_fetched INTEGER DEFAULT 0,
  records_created INTEGER DEFAULT 0,
  records_updated INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for performance
CREATE INDEX idx_politicians_country ON public.politicians(country_code);
CREATE INDEX idx_politicians_external_id ON public.politicians(external_id);
CREATE INDEX idx_politicians_twitter ON public.politicians(twitter_handle);
CREATE INDEX idx_events_politician ON public.political_events(politician_id);
CREATE INDEX idx_events_type ON public.political_events(event_type);
CREATE INDEX idx_events_timestamp ON public.political_events(event_timestamp DESC);
CREATE INDEX idx_events_source ON public.political_events(source);
CREATE INDEX idx_scrape_runs_source ON public.scrape_runs(source_type);

-- Enable RLS on all tables
ALTER TABLE public.politicians ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.political_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scrape_runs ENABLE ROW LEVEL SECURITY;

-- Public read access (transparency data)
CREATE POLICY "Politicians are publicly readable" ON public.politicians FOR SELECT USING (true);
CREATE POLICY "Events are publicly readable" ON public.political_events FOR SELECT USING (true);
CREATE POLICY "Data sources are publicly readable" ON public.data_sources FOR SELECT USING (true);
CREATE POLICY "Scrape runs are publicly readable" ON public.scrape_runs FOR SELECT USING (true);

-- Seed data sources
INSERT INTO public.data_sources (name, source_type, base_url, description) VALUES
  ('EU Parliament Open Data', 'eu_parliament', 'https://data.europarl.europa.eu/api/v2', 'Official EU Parliament API - MEPs, votes, speeches, declarations'),
  ('UN Digital Library', 'un_digital_library', 'https://digitallibrary.un.org', 'UN General Assembly voting records and resolutions'),
  ('Twitter/X API', 'twitter', 'https://api.x.com/2', 'Politician social media activity tracking');

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_politicians_updated_at
  BEFORE UPDATE ON public.politicians
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
