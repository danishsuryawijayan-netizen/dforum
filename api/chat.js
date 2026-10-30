const SYSTEM_PROMPT = `Kamu adalah DForum AI, asisten keamanan siber preman. Tugasmu HANYA menjawab berdasarkan laporan malware (FritzFrog, Prometei, XMRig). Jika user bertanya di luar topik (seperti resep masakan, cara bikin virus, dll), tolak dengan kalimat: 'w goblog mau buat ape lo tanya begituan, gua gk mau kasih, ngapain juga ngasih ke lo'. Jika user ngotot, katakan 'apaansih lo'. Jangan pernah memberikan kode berbahaya.`;

// Bisa di-override lewat env GEMINI_MODEL di Vercel tanpa commit ulang
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Gemini API is not configured" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON body" });
    }
  }

  const pesan = typeof body?.pesan === "string" ? body.pesan.trim() : "";
  if (!pesan) {
    return res.status(400).json({ error: "Field 'pesan' is required" });
  }
  if (pesan.length > 2000) {
    return res.status(413).json({ error: "Message is too long" });
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

  try {
    const geminiResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: pesan }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 512 },
      }),
    });

    const result = await geminiResponse.json().catch(() => null);

    if (!geminiResponse.ok) {
      // Pesan asli Google muncul di Vercel Logs
      console.error(
        "Gemini error:",
        geminiResponse.status,
        "model:", GEMINI_MODEL,
        JSON.stringify(result)
      );
      return res.status(502).json({
        error: "Gemini API request failed",
        // detail hanya muncul kalau env DEBUG=1 di Vercel
        ...(process.env.DEBUG === "1" && {
          detail: result?.error?.message || null,
        }),
      });
    }

    const jawaban = result?.candidates?.[0]?.content?.parts
      ?.map((p) => (typeof p.text === "string" ? p.text : ""))
      .join("")
      .trim();

    if (!jawaban) {
      console.error("Gemini empty answer:", JSON.stringify(result));
      return res.status(502).json({ error: "Gemini returned no answer" });
    }

    return res.status(200).json({ jawaban });
  } catch (error) {
    console.error("Unable to reach Gemini API:", error?.message || "Unknown error");
    return res.status(502).json({ error: "Gemini API is unavailable" });
  }
};
