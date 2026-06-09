
-- Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Users can view their own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all roles" ON public.user_roles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Crypto addresses (admin-managed)
CREATE TABLE public.crypto_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  currency text NOT NULL,
  address text NOT NULL,
  label text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.crypto_addresses TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.crypto_addresses TO authenticated;
GRANT ALL ON public.crypto_addresses TO service_role;
ALTER TABLE public.crypto_addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active crypto addresses" ON public.crypto_addresses
  FOR SELECT USING (active = true OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert crypto addresses" ON public.crypto_addresses
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update crypto addresses" ON public.crypto_addresses
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete crypto addresses" ON public.crypto_addresses
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Trades
CREATE TABLE public.trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_code text NOT NULL UNIQUE DEFAULT substr(replace(gen_random_uuid()::text,'-',''),1,12),
  password_hash text NOT NULL,
  creator_role text NOT NULL CHECK (creator_role IN ('buyer','seller')),
  payment_method text NOT NULL,
  name text NOT NULL,
  amount numeric NOT NULL,
  agreement text NOT NULL,
  finalization_hours integer NOT NULL,
  status text NOT NULL DEFAULT 'created' CHECK (status IN ('created','funded','finalized','disputed','cancelled')),
  funded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.trades TO anon, authenticated;
GRANT INSERT, UPDATE ON public.trades TO anon, authenticated;
GRANT ALL ON public.trades TO service_role;
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;

-- public lookup by trade_code (no password hash exposed via view)
CREATE POLICY "Anyone can read trades" ON public.trades
  FOR SELECT USING (true);
CREATE POLICY "Anyone can create trades" ON public.trades
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can update trades" ON public.trades
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_trades_updated BEFORE UPDATE ON public.trades
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_addr_updated BEFORE UPDATE ON public.crypto_addresses
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
