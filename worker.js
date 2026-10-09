export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST,OPTIONS,GET",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }
    if (url.pathname === "/api/scan-struk" && req.method === "POST") {
      // ponytail: proxy via Worker, key di secret GEMINI_API_KEY. upgrade when butuh rate limit/auth
      const key = env.GEMINI_API_KEY;
      if (!key) return new Response(JSON.stringify({ error: "GEMINI_API_KEY not set" }), { status: 500, headers: { "Content-Type": "application/json", ...cors } });
      let body;
      try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "invalid json" }), { status: 400, headers: { "Content-Type": "application/json", ...cors } }); }
      const base64 = body.imageBase64 || body.image || body.base64;
      const mediaType = body.mediaType || body.mimeType || "image/jpeg";
      if (!base64) return new Response(JSON.stringify({ error: "imageBase64 required" }), { status: 400, headers: { "Content-Type": "application/json", ...cors } });
      const prompt = 'Baca struk/nota ini. Ekstrak semua item beserta harga satuan, lalu subtotal dan pajak/service bila ada. Balas HANYA dengan JSON object tanpa markdown: {"items":[{"name":"nama item","price":25000}],"subtotal":25000,"tax":2500,"taxLabel":"PB1 10%"}. Harga satuan (bukan subtotal). Jika qty lebih dari 1, taruh di nama item. Jika tidak ada pajak, isi tax 0 dan taxLabel "".';
      const gemRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ inline_data: { mime_type: mediaType, data: base64 } }, { text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 1500, responseMimeType: "application/json" }
        })
      });
      const data = await gemRes.json();
      return new Response(JSON.stringify(data), { status: gemRes.status, headers: { "Content-Type": "application/json", ...cors } });
    }
    if (url.pathname.startsWith("/api/")) {
      return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: { "Content-Type": "application/json", ...cors } });
    }
    if (env.ASSETS && env.ASSETS.fetch) return env.ASSETS.fetch(req);
    return fetch(req);
  }
};
