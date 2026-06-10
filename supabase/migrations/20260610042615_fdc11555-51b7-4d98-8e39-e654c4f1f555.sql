GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.trade_action(text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.request_withdrawal(text, text, text) TO anon, authenticated, service_role;