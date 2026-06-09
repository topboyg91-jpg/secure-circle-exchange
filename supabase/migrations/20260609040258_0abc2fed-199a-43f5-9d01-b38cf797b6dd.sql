
ALTER TABLE public.trades
  ADD COLUMN IF NOT EXISTS withdrawal_address text,
  ADD COLUMN IF NOT EXISTS withdrawal_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS withdrawal_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS withdrawal_tx text;

-- Broaden status values to include the full escrow lifecycle used by admin UI.
ALTER TABLE public.trades DROP CONSTRAINT IF EXISTS trades_status_check;
ALTER TABLE public.trades ADD CONSTRAINT trades_status_check
  CHECK (status IN ('created','funded','released','refunded','finalized','disputed','cancelled'));

-- Rebuild the public view to include withdrawal status fields (no password hash).
DROP VIEW IF EXISTS public.trades_public;
CREATE VIEW public.trades_public WITH (security_invoker = on) AS
  SELECT id, trade_code, creator_role, payment_method, name, amount, amount_usd,
         quoted_rate, quoted_currency, agreement, finalization_hours, status,
         funded_at, withdrawal_address, withdrawal_requested_at,
         withdrawal_approved_at, withdrawal_tx, created_at, updated_at
  FROM public.trades;
GRANT SELECT ON public.trades_public TO anon, authenticated;

-- Allow anyone holding the trade_code + password_hash to attach a withdrawal address.
-- We use a SECURITY DEFINER function so anon cannot UPDATE arbitrary fields.
CREATE OR REPLACE FUNCTION public.request_withdrawal(
  _trade_code text,
  _password_hash text,
  _address text
) RETURNS public.trades_public
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row public.trades_public;
BEGIN
  IF length(coalesce(_address,'')) < 10 OR length(_address) > 200 THEN
    RAISE EXCEPTION 'Invalid withdrawal address';
  END IF;

  UPDATE public.trades
    SET withdrawal_address = _address,
        withdrawal_requested_at = COALESCE(withdrawal_requested_at, now())
    WHERE trade_code = _trade_code
      AND password_hash = _password_hash
      AND status IN ('funded','released');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trade not found, wrong password, or not yet funded';
  END IF;

  SELECT * INTO v_row FROM public.trades_public WHERE trade_code = _trade_code;
  RETURN v_row;
END $$;

REVOKE EXECUTE ON FUNCTION public.request_withdrawal(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_withdrawal(text, text, text) TO anon, authenticated;
