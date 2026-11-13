// Sending one Web Push message: the standard way a website reaches a phone's lock screen when it isn't open.
// Two parts, both from the web standards (no library):
//   VAPID (RFC 8292): each request carries a short token signed with the site's own key, so the push service
//     (Apple, Google, Mozilla, Microsoft) knows it comes from the site the phone subscribed to. Phones only accept
//     messages signed with the key they subscribed with, so a leaked subscription can't be used by anyone else.
//   Message encryption (RFC 8291, "aes128gcm"): only the phone can read the message; the push service can't.
import { createECDH, createHmac, createCipheriv, generateKeyPairSync, createPrivateKey, randomBytes, sign } from 'node:crypto';

const b64u = buf => Buffer.from(buf).toString('base64url');
const unb64u = s => Buffer.from(String(s).replace(/=+$/, ''), 'base64url');

// a new signing key for the site: { publicKey: base64url of the 65-byte point (what the page subscribes with), privateKey: JWK }
export function newVapidKeys() {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = privateKey.export({ format: 'jwk' });
  return { publicKey: b64u(Buffer.concat([Buffer.from([4]), unb64u(jwk.x), unb64u(jwk.y)])), privateKey: jwk };
}

const tokens = new Map(); // one signed token per push service, reused for a few hours
function vapidHeader(endpoint, keys, subject) {
  const aud = new URL(endpoint).origin, hit = tokens.get(aud), now = Math.floor(Date.now() / 1000);
  if (hit && hit.exp - now > 3600) return hit.header;
  const exp = now + 12 * 3600;
  const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' })), body = b64u(JSON.stringify({ aud, exp, sub: subject }));
  const sig = sign('sha256', Buffer.from(`${head}.${body}`), { key: createPrivateKey({ key: keys.privateKey, format: 'jwk' }), dsaEncoding: 'ieee-p1363' });
  const header = `vapid t=${head}.${body}.${b64u(sig)}, k=${keys.publicKey}`;
  tokens.set(aud, { exp, header });
  return header;
}

const hmac = (key, data) => createHmac('sha256', key).update(data).digest();
// the encrypted body for one subscription (RFC 8291 section 3 and RFC 8188 section 2, one record)
export function encrypt(sub, text) {
  const uaPublic = unb64u(sub.keys.p256dh), authSecret = unb64u(sub.keys.auth);
  const ecdh = createECDH('prime256v1'); ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey(), shared = ecdh.computeSecret(uaPublic);
  const ikm = hmac(hmac(authSecret, shared), Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic, Buffer.from([1])]));
  const salt = randomBytes(16), prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);
  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(text), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const head = Buffer.alloc(21); salt.copy(head, 0); head.writeUInt32BE(4096, 16); head[20] = asPublic.length;
  return Buffer.concat([head, asPublic, body]);
}

// -> 'sent' | 'gone' (the subscription is dead: forget it) | 'failed'
export async function sendPush(sub, message, { keys, subject, ttl = 600, fetchImpl = fetch } = {}) {
  try {
    const r = await fetchImpl(sub.endpoint, {
      method: 'POST',
      headers: { TTL: String(ttl), Urgency: 'high', 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', Authorization: vapidHeader(sub.endpoint, keys, subject) },
      body: encrypt(sub, JSON.stringify(message)),
      signal: AbortSignal.timeout(8000),
    });
    if (r.status >= 200 && r.status < 300) return 'sent';
    // 404/410: unsubscribed or expired. 403: signed with a key it doesn't know (the site's key was replaced)
    if ([403, 404, 410].includes(r.status)) return 'gone';
    console.log('push failed', new URL(sub.endpoint).host, r.status, (await r.text().catch(() => '')).slice(0, 200));
    return 'failed';
  } catch (e) { console.log('push failed', e?.message); return 'failed'; }
}
