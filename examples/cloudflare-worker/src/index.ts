export default { async fetch(_request: Request, env: { DB: D1Database; STORAGE: R2Bucket }) { return Response.json({ ready: true, database: Boolean(env.DB), storage: Boolean(env.STORAGE) }); } };
