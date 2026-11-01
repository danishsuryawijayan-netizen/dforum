import { randomBytes } from "node:crypto";

const SITE_ORIGIN = "https://dforum-nine.vercel.app";
const CALLBACK_URL = `${SITE_ORIGIN}/api/callback`;

export default function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).send("Method Not Allowed");
  }

  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return res.status(500).send("GitHub OAuth is not configured.");
  }

  const state = randomBytes(32).toString("hex");
  const stateCookieName = `decap_oauth_state_${state}`;
  const authorizationUrl = new URL("https://github.com/login/oauth/authorize");
  authorizationUrl.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: CALLBACK_URL,
    scope: "repo,user",
    state,
  }).toString();

  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Set-Cookie",
    `${stateCookieName}=${state}; Path=/api; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
  );
  res.setHeader("Location", authorizationUrl.toString());
  return res.status(302).end();
}
