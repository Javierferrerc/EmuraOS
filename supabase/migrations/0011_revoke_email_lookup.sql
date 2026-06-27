-- EmuraOS — finish security finding #3 (identifier → account email enumeration).
-- Username/handle login now runs through the `signin` Edge Function, which
-- resolves the email with the service_role key server-side and never returns it.
-- So email_for_handle no longer needs to be reachable by anon.
--
-- Revoke from anon AND public (Postgres grants EXECUTE to PUBLIC by default, so
-- revoking only from anon wouldn't be enough), and keep it for authenticated +
-- service_role (the Edge Function calls it as service_role).
--
-- Run AFTER deploying the `signin` Edge Function and shipping the client build
-- that calls it — otherwise username/handle login breaks.
--
-- NOTE: email_for_username stays anon-callable on purpose: the
-- password-reset-by-username flow still resolves it client-side (and returns the
-- email to the client for the OTP verify step). Fully closing that residual
-- requires moving the reset flow server-side too — tracked as a follow-up.

revoke execute on function public.email_for_handle(text, text) from anon, public;
grant  execute on function public.email_for_handle(text, text) to authenticated, service_role;
