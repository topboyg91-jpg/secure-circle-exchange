
ALTER TABLE public.trades
  ADD COLUMN IF NOT EXISTS amount_usd numeric,
  ADD COLUMN IF NOT EXISTS quoted_rate numeric,
  ADD COLUMN IF NOT EXISTS quoted_currency text,
  ADD COLUMN IF NOT EXISTS admin_notes text;

-- Replace insert policy to validate new fields
DROP POLICY IF EXISTS "Anyone can create trades" ON public.trades;
CREATE POLICY "Anyone can create trades" ON public.trades
FOR INSERT TO public
WITH CHECK (
  length(name) BETWEEN 1 AND 200
  AND length(agreement) BETWEEN 1 AND 5000
  AND length(password_hash) BETWEEN 20 AND 200
  AND amount > 0 AND amount < 1000000
  AND (amount_usd IS NULL OR (amount_usd > 0 AND amount_usd < 10000000))
  AND (quoted_rate IS NULL OR quoted_rate > 0)
  AND finalization_hours BETWEEN 1 AND 720
  AND creator_role IN ('buyer','seller')
  AND payment_method IN ('BTC','XMR')
);

-- Allow admins to delete trades (for cleanup)
DROP POLICY IF EXISTS "Admins can delete trades" ON public.trades;
CREATE POLICY "Admins can delete trades" ON public.trades
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'admin'));
