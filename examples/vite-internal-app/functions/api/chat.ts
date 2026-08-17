interface Env { ZAO_AI_BASE_URL: string; ZAO_AI_API_KEY: string }

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const input = await request.json<{ message?: string }>();
  return fetch(`${env.ZAO_AI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.ZAO_AI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ model: "default-chat", messages: [{ role: "user", content: input.message ?? "Hello" }] }),
  });
};
