/** Vite-injected env for the social layer. The Supabase URL + anon key are
 *  public by design (security is enforced by RLS); they're baked into the build
 *  from `.env` (dev) / build env (prod). */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
