-- ALTER TYPE ... ADD VALUE must run outside a transaction block, so this
-- migration only adds one enum value. See Postgres docs:
-- https://www.postgresql.org/docs/current/sql-altertype.html
ALTER TYPE public.data_source_type ADD VALUE IF NOT EXISTS 'parltrack';
