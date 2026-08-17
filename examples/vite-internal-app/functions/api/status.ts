interface Env {
  DB: D1Database;
  STORAGE: R2Bucket;
  ZAO_AI_BASE_URL: string;
  ZAO_AI_API_KEY: string;
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  let database = false;
  let storage = false;
  let ai = false;
  try { database = Boolean(await env.DB.prepare("SELECT 1 AS ready").first()); } catch {}
  try { await env.STORAGE.head("__zaodeploy_health__"); storage = true; } catch {}
  try {
    const response = await fetch(`${env.ZAO_AI_BASE_URL}/models`, {
      headers: { authorization: `Bearer ${env.ZAO_AI_API_KEY}` },
    });
    ai = response.ok;
  } catch {}
  return Response.json({ database, storage, ai }, { status: database && storage && ai ? 200 : 503 });
};
