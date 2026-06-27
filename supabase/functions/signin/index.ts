// EmuraOS — server-side sign-in (fixes finding #3: email enumeration).
//
// The client used to resolve a username/handle → account email via anon RPCs
// (email_for_username / email_for_handle), which let anyone harvest emails.
// This Edge Function does that resolution with the service_role key (server
// only) and signs in, returning ONLY the session tokens — the email never
// leaves the server.
//
// Deploy:  supabase functions deploy signin
// Secrets: SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are
//          injected automatically by Supabase.
//
// After deploying AND switching the client to call this (auth.functions /
// invoke "signin" + setSession), run:
//   revoke execute on function public.email_for_username(text)        from anon;
//   revoke execute on function public.email_for_handle(text, text)    from anon;
// to actually close the leak (the function still works — service_role bypasses
// grants).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const { identifier, password } = await req.json();
    if (!identifier || !password) return json({ error: "Faltan credenciales." }, 400);

    let email = String(identifier).trim();
    if (!email.includes("@")) {
      // Resolve username or "usuario#TAG" → email with the service role. This
      // never reaches the client.
      const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
      let resolved: string | null = null;
      if (email.includes("#")) {
        const i = email.indexOf("#");
        const { data } = await admin.rpc("email_for_handle", {
          p_username: email.slice(0, i).trim(),
          p_tag: email.slice(i + 1).trim(),
        });
        resolved = (data as string | null) ?? null;
      } else {
        const { data } = await admin.rpc("email_for_username", { p_username: email });
        resolved = (data as string | null) ?? null;
      }
      if (!resolved) return json({ error: "Cuenta no encontrada." }, 401);
      email = resolved;
    }

    const anon = createClient(URL, ANON, { auth: { persistSession: false } });
    const { data, error } = await anon.auth.signInWithPassword({ email, password });
    if (error || !data.session) return json({ error: "Credenciales inválidas." }, 401);

    // Return ONLY the tokens — never the resolved email.
    return json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
