
-- Financial overview per politician
CREATE TABLE public.politician_finances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  politician_id UUID NOT NULL REFERENCES public.politicians(id) ON DELETE CASCADE,
  annual_salary NUMERIC,
  currency TEXT DEFAULT 'EUR',
  side_income NUMERIC DEFAULT 0,
  declared_assets NUMERIC,
  property_value NUMERIC,
  declared_debt NUMERIC DEFAULT 0,
  salary_source TEXT,
  declaration_year INTEGER DEFAULT 2024,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(politician_id, declaration_year)
);

-- Individual investments/financial interests
CREATE TABLE public.politician_investments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  politician_id UUID NOT NULL REFERENCES public.politicians(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  sector TEXT,
  investment_type TEXT NOT NULL DEFAULT 'stocks',
  estimated_value NUMERIC,
  currency TEXT DEFAULT 'EUR',
  is_active BOOLEAN DEFAULT true,
  disclosure_date DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.politician_finances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.politician_investments ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Finances are publicly readable" ON public.politician_finances FOR SELECT USING (true);
CREATE POLICY "Investments are publicly readable" ON public.politician_investments FOR SELECT USING (true);

-- Indexes
CREATE INDEX idx_politician_finances_politician ON public.politician_finances(politician_id);
CREATE INDEX idx_politician_investments_politician ON public.politician_investments(politician_id);
CREATE INDEX idx_politician_investments_sector ON public.politician_investments(sector);

-- Timestamp trigger
CREATE TRIGGER update_politician_finances_updated_at
  BEFORE UPDATE ON public.politician_finances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
