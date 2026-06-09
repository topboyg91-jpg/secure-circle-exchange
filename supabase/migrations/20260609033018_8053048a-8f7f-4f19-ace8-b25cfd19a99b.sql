
-- 1. Fix touch_updated_at search_path
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- 2. Lock down SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;

-- 3. Tighten trade INSERT policy with sane bounds
DROP POLICY "Anyone can create trades" ON public.trades;
CREATE POLICY "Anyone can create trades" ON public.trades
  FOR INSERT WITH CHECK (
    length(name) BETWEEN 1 AND 200
    AND length(agreement) BETWEEN 1 AND 5000
    AND length(password_hash) BETWEEN 20 AND 200
    AND amount > 0 AND amount < 1000000
    AND finalization_hours BETWEEN 1 AND 720
    AND creator_role IN ('buyer','seller')
    AND payment_method IN ('BTC','XMR')
  );

-- 4. Public view hiding password hash; switch base table SELECT to deny direct reads
CREATE OR REPLACE VIEW public.trades_public WITH (security_invoker = on) AS
  SELECT id, trade_code, creator_role, payment_method, name, amount, agreement,
         finalization_hours, status, funded_at, created_at, updated_at
  FROM public.trades;
GRANT SELECT ON public.trades_public TO anon, authenticated;

DROP POLICY "Anyone can read trades" ON public.trades;
CREATE POLICY "Admins can read full trades" ON public.trades
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
