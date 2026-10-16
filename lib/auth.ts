// Login por e-mail e senha definidos no .env (LOGIN_EMAIL e LOGIN_PASSWORD).
// Usa só Web Crypto para rodar tanto no proxy quanto nas rotas de API.

export const SESSION_COOKIE = 'session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 dias, em segundos

const encoder = new TextEncoder();

function credentials() {
  const email = process.env.LOGIN_EMAIL?.trim();
  const password = process.env.LOGIN_PASSWORD;
  return email && password ? { email, password } : null;
}

// Chave de assinatura do cookie. AUTH_SECRET é opcional: sem ela, deriva das credenciais.
function secret() {
  const creds = credentials();
  if (!creds) return null;
  return process.env.AUTH_SECRET || `${creds.email}:${creds.password}`;
}

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function sign(value: string, key: string) {
  const cryptoKey = await crypto.subtle.importKey('raw', encoder.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toHex(await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(value)));
}

async function sha256(value: string) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

function equalBytes(a: Uint8Array, b: Uint8Array) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

/** Compara e-mail e senha informados com os do .env (em tempo constante). */
export async function checkCredentials(email: unknown, password: unknown) {
  const creds = credentials();
  if (!creds || typeof email !== 'string' || typeof password !== 'string') return false;
  const [emailOk, passOk] = await Promise.all([
    sha256(email.trim().toLowerCase()).then(async (h) => equalBytes(h, await sha256(creds.email.toLowerCase()))),
    sha256(password).then(async (h) => equalBytes(h, await sha256(creds.password)))
  ]);
  return emailOk && passOk;
}

/** Token do cookie: "<expiração>.<assinatura>". */
export async function createSessionToken() {
  const key = secret();
  if (!key) throw new Error('LOGIN_EMAIL e LOGIN_PASSWORD não estão configurados no .env.');
  const expires = String(Date.now() + SESSION_MAX_AGE * 1000);
  return `${expires}.${await sign(expires, key)}`;
}

export async function verifySessionToken(token: string | undefined) {
  const key = secret();
  if (!key || !token) return false;
  const [expires, signature] = token.split('.');
  if (!expires || !signature || Number(expires) < Date.now()) return false;
  return equalBytes(encoder.encode(signature), encoder.encode(await sign(expires, key)));
}
