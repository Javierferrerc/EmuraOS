// EmuraOS — server-side password reset (closes the username → email
// enumeration that email_for_username left open).
//
// The client used to resolve username → email via the anon `email_for_username`
// RPC and drive the OTP flow with that email. This Edge Function keeps the email
// entirely server-side:
//   action "request": resolve identifier → email (service_role) and send the
//                     recovery email. Returns { ok: true } — never the email.
//   action "verify" : resolve identifier → email, verify the 6-digit OTP, set
//                     the new password, and return the resulting session tokens.
//
// Deploy:  supabase functions deploy password-reset
// Secrets: SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are
//          injected automatically by Supabase.
//
// After deploying AND shipping the client build that calls this, run migration
// 0012 to revoke email_for_username from anon.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Desktop client runs from a file:// origin (Origin: null) in production and a
// localhost dev-server origin in development. Allow those and deny the rest, so
// a random website can't drive this endpoint through a visitor's browser. The
// endpoint is credential-gated regardless (it needs a valid OTP/password).
const ALLOWED_ORIGINS = new Set(["null", "http://localhost:5173"]);

function corsHeaders(origin: string | null): Record<string, string> {
  const allow =
    origin && ALLOWED_ORIGINS.has(origin) ? origin : "null";
  return {
    "Access-Control-Allow-Origin": allow,
    "Vary": "Origin",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

async function resolveEmail(identifier: string): Promise<string | null> {
  const raw = String(identifier).trim();
  if (raw.includes("@")) return raw;
  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
  if (raw.includes("#")) {
    const i = raw.indexOf("#");
    const { data } = await admin.rpc("email_for_handle", {
      p_username: raw.slice(0, i).trim(),
      p_tag: raw.slice(i + 1).trim(),
    });
    return (data as string | null) ?? null;
  }
  const { data } = await admin.rpc("email_for_username", { p_username: raw });
  return (data as string | null) ?? null;
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get("origin"));
  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { action, identifier, token, newPassword } = await req.json();
    if (!identifier) return json({ error: "Falta el identificador." }, 400);

    const email = await resolveEmail(identifier);
    // Do not reveal whether the account exists on the request path — respond OK
    // either way so this can't be used as an existence oracle.
    if (action === "request") {
      if (email) {
        const anon = createClient(URL, ANON, {
          auth: { persistSession: false },
        });
        await anon.auth.resetPasswordForEmail(email);
      }
      return json({ ok: true });
    }

    if (action === "verify") {
      if (!token || !newPassword) {
        return json({ error: "Falta el código o la nueva contraseña." }, 400);
      }
      if (!email) return json({ error: "Código o cuenta no válidos." }, 401);
      const anon = createClient(URL, ANON, {
        auth: { persistSession: false },
      });
      const { data: v, error: vErr } = await anon.auth.verifyOtp({
        email,
        token: String(token).trim(),
        type: "recovery",
      });
      if (vErr || !v.session) {
        return json({ error: "Código o cuenta no válidos." }, 401);
      }
      // verifyOtp established a session on this client — use it to set the new
      // password, then hand the session tokens back to the desktop client.
      const { error: uErr } = await anon.auth.updateUser({
        password: String(newPassword),
      });
      if (uErr) return json({ error: uErr.message }, 400);
      return json({
        access_token: v.session.access_token,
        refresh_token: v.session.refresh_token,
      });
    }

    return json({ error: "Acción no soportada." }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
