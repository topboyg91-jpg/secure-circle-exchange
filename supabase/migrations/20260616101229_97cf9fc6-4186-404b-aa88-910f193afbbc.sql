
-- 1) SECURITY DEFINER function for creating trades (bypasses RLS/grants safely with validation)
CREATE OR REPLACE FUNCTION public.create_trade(
  _creator_role text,
  _payment_method text,
  _name text,
  _amount numeric,
  _amount_usd numeric,
  _quoted_rate numeric,
  _quoted_currency text,
  _agreement text,
  _finalization_hours int,
  _password_hash text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_code text;
BEGIN
  IF _creator_role NOT IN ('buyer','seller') THEN RAISE EXCEPTION 'Invalid role'; END IF;
  IF _payment_method NOT IN ('BTC','XMR') THEN RAISE EXCEPTION 'Invalid payment method'; END IF;
  IF length(coalesce(_name,'')) < 1 OR length(_name) > 200 THEN RAISE EXCEPTION 'Invalid name'; END IF;
  IF length(coalesce(_agreement,'')) < 1 OR length(_agreement) > 5000 THEN RAISE EXCEPTION 'Invalid agreement'; END IF;
  IF length(coalesce(_password_hash,'')) < 20 OR length(_password_hash) > 200 THEN RAISE EXCEPTION 'Invalid password hash'; END IF;
  IF _amount IS NULL OR _amount <= 0 OR _amount >= 1000000 THEN RAISE EXCEPTION 'Invalid amount'; END IF;
  IF _amount_usd IS NOT NULL AND (_amount_usd <= 0 OR _amount_usd >= 10000000) THEN RAISE EXCEPTION 'Invalid USD amount'; END IF;
  IF _quoted_rate IS NOT NULL AND _quoted_rate <= 0 THEN RAISE EXCEPTION 'Invalid rate'; END IF;
  IF _finalization_hours < 1 OR _finalization_hours > 720 THEN RAISE EXCEPTION 'Invalid finalization hours'; END IF;

  INSERT INTO public.trades(creator_role, payment_method, name, amount, amount_usd, quoted_rate, quoted_currency, agreement, finalization_hours, password_hash)
  VALUES (_creator_role, _payment_method, _name, _amount, _amount_usd, _quoted_rate, _quoted_currency, _agreement, _finalization_hours, _password_hash)
  RETURNING trade_code INTO v_code;

  RETURN v_code;
END $$;

GRANT EXECUTE ON FUNCTION public.create_trade(text,text,text,numeric,numeric,numeric,text,text,int,text) TO anon, authenticated;

-- 2) app_settings table for admin-editable values (e.g. seller link)
CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.app_settings TO anon, authenticated;
GRANT ALL ON public.app_settings TO service_role;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read settings" ON public.app_settings;
CREATE POLICY "Anyone can read settings" ON public.app_settings FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can insert settings" ON public.app_settings;
CREATE POLICY "Admins can insert settings" ON public.app_settings FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "Admins can update settings" ON public.app_settings;
CREATE POLICY "Admins can update settings" ON public.app_settings FOR UPDATE TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "Admins can delete settings" ON public.app_settings;
CREATE POLICY "Admins can delete settings" ON public.app_settings FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'));

INSERT INTO public.app_settings(key, value) VALUES ('seller_link', '') ON CONFLICT (key) DO NOTHING;
