import { isHostAllowed, resolveHost, validateRedirect } from '@nexus/core';

export interface ProbeOptions {
  timeoutMs?: number;
  maxRedirects?: number;
  requireSuccess?: boolean;
}

export interface ProbeResult {
  url: string;
  finalUrl: string;
  ok: boolean;
  status?: number;
  redirects: string[];
  error?: string;
}

type ProbeFetch = (
  url: string,
  init: { redirect: 'manual'; signal: AbortSignal },
) => Promise<{
  status: number;
  ok: boolean;
  headers: { get(name: string): string | null };
  body?: { cancel(): Promise<void> } | null;
}>;

export async function probeUrl(
  url: string,
  allowlist: string[],
  options: ProbeOptions = {},
  fetchImpl: ProbeFetch = fetch,
): Promise<ProbeResult> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const maxRedirects = options.maxRedirects ?? 5;
  const requireSuccess = options.requireSuccess ?? false;
  const redirects: string[] = [];
  let current = url;

  for (let attempt = 0; attempt <= maxRedirects; attempt += 1) {
    const host = resolveHost(current);
    if (!host || !isHostAllowed(host, allowlist)) {
      return {
        url,
        finalUrl: current,
        ok: false,
        redirects,
        error: `host not on allowlist: ${host || current}`,
      };
    }
    try {
      let response;
      let lastFetchError;
      for (let retry = 0; retry < 3; retry++) {
        try {
          response = await fetchImpl(current, {
            redirect: 'manual',
            signal: AbortSignal.timeout(timeoutMs),
          });
          break;
        } catch (fetchErr) {
          lastFetchError = fetchErr;
          if (retry < 2) {
            await new Promise((r) => setTimeout(r, 1000));
          }
        }
      }
      if (!response) {
        throw lastFetchError || new Error('Fetch failed after 3 attempts');
      }
      if (response.body) {
        await response.body.cancel().catch(() => undefined);
      }
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) {
          return {
            url,
            finalUrl: current,
            ok: false,
            status: response.status,
            redirects,
            error: 'redirect without location',
          };
        }
        const redirect = validateRedirect(current, location, allowlist);
        if (!redirect.allowed) {
          return {
            url,
            finalUrl: current,
            ok: false,
            status: response.status,
            redirects,
            error: redirect.reasons.join('; '),
          };
        }
        current = new URL(location, current).href;
        redirects.push(current);
        continue;
      }
      const ok = requireSuccess ? response.status < 400 : response.status < 500;
      return {
        url,
        finalUrl: current,
        ok,
        status: response.status,
        redirects,
        ...(ok ? {} : { error: `unexpected status ${response.status}` }),
      };
    } catch (error) {
      return {
        url,
        finalUrl: current,
        ok: false,
        redirects,
        error: (error as Error).message,
      };
    }
  }

  return {
    url,
    finalUrl: current,
    ok: false,
    redirects,
    error: `too many redirects (max ${maxRedirects})`,
  };
}
