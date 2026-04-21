const release = JSON.parse(process.env.RELEASE_JSON ?? "{}");
const [owner, repo] = (process.env.REPO ?? "").split("/");
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ghToken = process.env.GH_TOKEN;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}
if (!release?.tag_name) {
  throw new Error("Release payload missing tag_name");
}

const tag = release.tag_name;
const slug = tag.replace(/^v/, "");
const title = release.name?.trim() || `Emura ${tag}`;
const date = (release.published_at ?? new Date().toISOString()).slice(0, 10);

let rawNotes = (release.body ?? "").trim();
if (!rawNotes) {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/releases/generate-notes`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ghToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ tag_name: tag }),
    },
  );
  if (!res.ok) {
    throw new Error(`generate-notes failed: ${res.status} ${await res.text()}`);
  }
  const generated = await res.json();
  rawNotes = (generated.body ?? "").trim();
}

const systemPrompt = `Eres el redactor del blog oficial de Emura, una aplicación de retro-launcher para juegos retro.

Te paso las notas técnicas autogeneradas de un release (con commits, pull requests, enlaces y nombres de usuario). Tu trabajo es reescribirlas como un post de blog en español dirigido a usuarios finales, no a desarrolladores.

Reglas obligatorias:
- NO incluyas enlaces, URLs, ni la línea "Full Changelog".
- NO menciones números de PR (#42) ni nombres de usuario (@nombre).
- NO uses jerga técnica: nada de "commit", "pull request", "merge", "bump de dependencias", "refactor".
- NO uses emojis.
- NO inventes funcionalidades que no aparezcan en las notas originales.
- Si un cambio es puramente interno (refactor, dependencias, ajustes de build, CI), descártalo por completo.
- Escribe en tono cercano y natural, como si le contaras las novedades a un usuario.

Estructura:
- Usa headings markdown (## Novedades, ## Mejoras, ## Correcciones) solo para las secciones que tengan contenido real. Si una sección queda vacía, no la incluyas.
- Bajo cada heading, escribe prosa breve o bullets cortos y claros.
- Si tras aplicar las reglas no queda ningún cambio user-facing, responde solo con una frase: "Esta versión incluye mejoras internas y de estabilidad."

Salida: solo el markdown del post, sin introducción, sin explicaciones y sin metacomentarios.`;

const llmRes = await fetch("https://models.github.ai/inference/chat/completions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${ghToken}`,
    "Content-Type": "application/json",
    Accept: "application/vnd.github+json",
  },
  body: JSON.stringify({
    model: "openai/gpt-4o-mini",
    temperature: 0.4,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Versión: ${tag}\n\nNotas técnicas del release:\n\n${rawNotes || "(sin notas)"}`,
      },
    ],
  }),
});

if (!llmRes.ok) {
  throw new Error(`GitHub Models rewrite failed: ${llmRes.status} ${await llmRes.text()}`);
}

const llmData = await llmRes.json();
const content = (llmData.choices?.[0]?.message?.content ?? "").trim();
if (!content) {
  throw new Error("GitHub Models returned empty content");
}

const row = {
  slug,
  title,
  date,
  tag: "update",
  summary: `Nueva versión ${tag} disponible.`,
  content,
};

const upsert = await fetch(`${supabaseUrl}/rest/v1/blog_posts?on_conflict=slug`, {
  method: "POST",
  headers: {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates,return=representation",
  },
  body: JSON.stringify(row),
});

if (!upsert.ok) {
  throw new Error(`Supabase upsert failed: ${upsert.status} ${await upsert.text()}`);
}

const [saved] = await upsert.json();
console.log(`Published to blog: slug=${saved.slug} title=${saved.title} date=${saved.date}`);
