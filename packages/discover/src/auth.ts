export interface ResolvedAuth {
  headers: Record<string, string>;
  used: boolean;
  reason?: string;
}
export interface VaultCredentials {
  username?: string;
  password?: string;
  token?: string;
  fields?: Record<string, string>;
  raw?: string;
}

export function resolveVaultCredentials(
  reference: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): VaultCredentials | undefined {
  if (!reference) return undefined;
  const envKey = reference.startsWith('vault:')
    ? `QA_VAULT_${reference
        .slice('vault:'.length)
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')}`
    : ENV_NAME.test(reference)
      ? reference
      : undefined;
  if (!envKey) return undefined;
  const raw = env[envKey];
  if (!raw) return undefined;

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const username = typeof parsed.username === 'string' ? parsed.username : undefined;
      const password = typeof parsed.password === 'string' ? parsed.password : undefined;
      const token =
        typeof parsed.token === 'string'
          ? parsed.token
          : typeof parsed.authorization === 'string'
            ? parsed.authorization
            : undefined;
      const fields: Record<string, string> = {};
      if (parsed.fields && typeof parsed.fields === 'object') {
        for (const [k, v] of Object.entries(parsed.fields as Record<string, unknown>)) {
          if (typeof v === 'string') fields[k] = v;
        }
      }
      return { username, password, token, fields, raw };
    }
  } catch {
    // raw text
  }
  return { raw };
}

const ENV_NAME = /^[A-Z][A-Z0-9_]{2,}$/;

export function resolveAuth(
  reference: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): ResolvedAuth {
  if (!reference) return { headers: {}, used: false };
  const envKey = reference.startsWith('vault:')
    ? `QA_VAULT_${reference
        .slice('vault:'.length)
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')}`
    : ENV_NAME.test(reference)
      ? reference
      : undefined;
  if (!envKey) {
    return { headers: {}, used: false, reason: 'auth reference must be vault:... or an env name' };
  }
  const raw = env[envKey];
  if (!raw) {
    return { headers: {}, used: false, reason: `auth reference ${reference} is not resolvable` };
  }
  if (/[\r\n]/.test(raw)) {
    return { headers: {}, used: false, reason: 'auth value contains a newline' };
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      if (typeof parsed.authorization === 'string') {
        return { headers: { authorization: parsed.authorization }, used: true };
      }
      if (typeof parsed.username === 'string' && typeof parsed.password === 'string') {
        const encoded = Buffer.from(`${parsed.username}:${parsed.password}`).toString('base64');
        return { headers: { authorization: `Basic ${encoded}` }, used: true };
      }
    }
  } catch {
    // not JSON; treat as a bearer token or a full header value
  }

  if (/^(?:Bearer|Basic)\s+\S+$/i.test(raw)) {
    return { headers: { authorization: raw }, used: true };
  }
  return { headers: { authorization: `Bearer ${raw}` }, used: true };
}
