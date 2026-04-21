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

let content = (release.body ?? "").trim();
if (!content) {
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
  content = (generated.body ?? "").trim();
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
