
ALTER TABLE public.trades
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS declined_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS disputed_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS deposit_address text,
  ADD COLUMN IF NOT EXISTS deposit_address_id uuid REFERENCES public.crypto_addresses(id) ON DELETE SET NULL;

ALTER TABLE public.trades DROP CONSTRAINT IF EXISTS trades_status_check;
ALTER TABLE public.trades ADD CONSTRAINT trades_status_check
  CHECK (status = ANY (ARRAY['created','accepted','funded','delivered','released','completed','refunded','finalized','disputed','cancelled']));

CREATE OR REPLACE FUNCTION public.assign_deposit_address()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_id uuid; v_addr text;
BEGIN
  IF NEW.deposit_address IS NULL THEN
    SELECT id, address INTO v_id, v_addr
      FROM public.crypto_addresses
     WHERE currency = NEW.payment_method AND active = true
     ORDER BY created_at ASC LIMIT 1;
    NEW.deposit_address_id := v_id;
    NEW.deposit_address := v_addr;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_trades_assign_addr ON public.trades;
CREATE TRIGGER trg_trades_assign_addr BEFORE INSERT ON public.trades
  FOR EACH ROW EXECUTE FUNCTION public.assign_deposit_address();

DROP VIEW IF EXISTS public.trades_public CASCADE;
CREATE VIEW public.trades_public AS
SELECT id, trade_code, creator_role, payment_method, name, amount, amount_usd, quoted_rate, quoted_currency,
       agreement, finalization_hours, status, deposit_address,
       funded_at, accepted_at, declined_at, delivered_at, disputed_at, completed_at,
       withdrawal_address, withdrawal_requested_at, withdrawal_approved_at, withdrawal_tx,
       created_at, updated_at
  FROM public.trades;
GRANT SELECT ON public.trades_public TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.request_withdrawal(_trade_code text, _password_hash text, _address text)
RETURNS public.trades_public LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.trades_public;
BEGIN
  IF length(coalesce(_address,'')) < 10 OR length(_address) > 200 THEN
    RAISE EXCEPTION 'Invalid withdrawal address';
  END IF;
  UPDATE public.trades
    SET withdrawal_address = _address,
        withdrawal_requested_at = COALESCE(withdrawal_requested_at, now())
    WHERE trade_code = _trade_code
      AND password_hash = _password_hash
      AND status IN ('funded','delivered','released');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trade not found, wrong password, or not yet funded';
  END IF;
  SELECT * INTO v_row FROM public.trades_public WHERE trade_code = _trade_code;
  RETURN v_row;
END $$;
REVOKE ALL ON FUNCTION public.request_withdrawal(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_withdrawal(text,text,text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.trade_action(_trade_code text, _password_hash text, _action text)
RETURNS public.trades_public LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.trades; v_row public.trades_public;
BEGIN
  SELECT * INTO v FROM public.trades
   WHERE trade_code = _trade_code AND password_hash = _password_hash;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid trade code or password'; END IF;

  IF _action = 'accept' THEN
    IF v.status <> 'created' THEN RAISE EXCEPTION 'Trade already %', v.status; END IF;
    UPDATE public.trades SET status='accepted', accepted_at=now() WHERE id=v.id;
  ELSIF _action = 'decline' THEN
    IF v.status NOT IN ('created','accepted') THEN RAISE EXCEPTION 'Cannot decline in status %', v.status; END IF;
    UPDATE public.trades SET status='cancelled', declined_at=now() WHERE id=v.id;
  ELSIF _action = 'mark_delivered' THEN
    IF v.status <> 'funded' THEN RAISE EXCEPTION 'Trade must be funded first'; END IF;
    UPDATE public.trades SET status='delivered', delivered_at=now() WHERE id=v.id;
  ELSIF _action = 'release' THEN
    IF v.status NOT IN ('funded','delivered') THEN RAISE EXCEPTION 'Cannot release in status %', v.status; END IF;
    UPDATE public.trades SET status='released' WHERE id=v.id;
  ELSIF _action = 'dispute' THEN
    UPDATE public.trades SET status='disputed', disputed_at=now() WHERE id=v.id;
  ELSE
    RAISE EXCEPTION 'Unknown action %', _action;
  END IF;

  SELECT * INTO v_row FROM public.trades_public WHERE id = v.id;
  RETURN v_row;
END $$;
REVOKE ALL ON FUNCTION public.trade_action(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trade_action(text,text,text) TO anon, authenticated;
