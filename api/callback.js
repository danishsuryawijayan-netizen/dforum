import { randomBytes, timingSafeEqual } from "node:crypto";

const SITE_ORIGIN = "https://dforum-nine.vercel.app";
const CALLBACK_URL = `${SITE_ORIGIN}/api/callback`;

function queryString(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return "";
}

function readCookie(req, name) {
  const cookies = (req.headers.cookie || "").split(";");
  const cookie = cookies.find((part) => part.trim().startsWith(`${name}=`));
  return cookie ? cookie.trim().slice(name.length + 1) : "";
}

function clearStateCookie(res, name) {
  res.setHeader(
    "Set-Cookie",
    `${name}=; Path=/api; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
  );
}

function sendText(res, status, message) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  return res.status(status).send(message);
}

function jsonForInlineScript(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendText(res, 405, "Method Not Allowed");
  }

  const code = queryString(req.query?.code);
  const state = queryString(req.query?.state);
  const oauthError = queryString(req.query?.error);

  if (!/^[a-f0-9]{64}$/i.test(state)) {
    return sendText(res, 400, "Invalid OAuth state.");
  }

  const stateCookieName = `decap_oauth_state_${state}`;
  const savedState = readCookie(req, stateCookieName);
  clearStateCookie(res, stateCookieName);

  const suppliedStateBuffer = Buffer.from(state);
  const savedStateBuffer = Buffer.from(savedState);
  const validState = savedStateBuffer.length === suppliedStateBuffer.length
    && timingSafeEqual(savedStateBuffer, suppliedStateBuffer);

  if (!validState) {
    return sendText(res, 403, "OAuth state verification failed.");
  }
  if (oauthError) {
    return sendText(res, 400, "GitHub authorization was cancelled.");
  }
  if (!code) {
    return sendText(res, 400, "GitHub authorization code is missing.");
  }

  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return sendText(res, 500, "GitHub OAuth is not configured.");
  }

  let githubResponse;
  let tokenData;
  try {
    githubResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: CALLBACK_URL,
      }),
    });
    tokenData = await githubResponse.json();
  } catch {
    return sendText(res, 502, "Could not complete GitHub OAuth.");
  }

  if (
    !githubResponse.ok
    || !tokenData
    || typeof tokenData.access_token !== "string"
    || !tokenData.access_token
  ) {
    return sendText(res, 502, "GitHub did not return an access token.");
  }

  const nonce = randomBytes(18).toString("base64");
  const accessTokenLiteral = jsonForInlineScript(tokenData.access_token);
  const targetOriginLiteral = jsonForInlineScript(SITE_ORIGIN);
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="referrer" content="no-referrer">
    <title>GitHub authorization</title>
  </head>
  <body>
    <p>GitHub authorization complete. This window can be closed.</p>
    <script nonce="${nonce}">
      const access_token = ${accessTokenLiteral};
      if (window.opener) {
        window.opener.postMessage(
          'authorization:github:success:' + JSON.stringify({token: access_token}),
          ${targetOriginLiteral}
        );
      }
      self.close();
    </script>
  </body>
</html>`;

  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Content-Security-Policy",
    `default-src 'none'; script-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`,
  );
  return res.status(200).send(html);
}
