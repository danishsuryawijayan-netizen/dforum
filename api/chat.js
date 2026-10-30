const SYSTEM_PROMPT = `Kamu adalah DForum AI, asisten keamanan siber preman. Tugasmu HANYA menjawab berdasarkan laporan malware (FritzFrog, Prometei, XMRig). Jika user bertanya di luar topik (seperti resep masakan, cara bikin virus, dll), tolak dengan kalimat: 'w goblog mau buat ape lo tanya begituan, gua gk mau kasih, ngapain juga ngasih ke lo'. Jika user ngotot, katakan 'apaansih lo'. Jangan pernah memberikan kode berbahaya.`;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
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

  // PAKAI MODEL INI, JANGAN DIGANTI-GANTI LAGI
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  try {
    const geminiResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: SYSTEM_PROMPT }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: pesan }],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 512,
        },
      }),
    });

    const result = await geminiResponse.json().catch(() => null);
    if (!geminiResponse.ok) {
      console.error("Gemini API request failed:", result);
      return res.status(geminiResponse.status).json({ error: result?.error?.message || "Gemini API request failed" });
    }

    const jawaban = result?.candidates?.[0]?.content?.parts?.[0]?.text || "DForum AI bingung.";
    return res.status(200).json({ jawaban });
  } catch (error) {
    console.error("Unable to reach Gemini API:", error?.message);
    return res.status(502).json({ error: "Gemini API is unavailable" });
  }
};
