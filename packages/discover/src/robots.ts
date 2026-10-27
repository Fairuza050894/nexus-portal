import type { DiscoveryHttpClient } from './http.js';

export interface RobotsRule {
  allow: boolean;
  pattern: string;
}

export interface RobotsRules {
  rules: RobotsRule[];
  crawlDelayMs?: number;
  isAllowed(path: string): boolean;
}

function patternToMatch(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const escaped = body.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  const regex = new RegExp(`^${escaped}${anchored ? '$' : ''}`);
  return regex.test(path);
}

export function parseRobots(text: string, userAgent = 'nexus-portal'): RobotsRules {
  const rules: RobotsRule[] = [];
  let crawlDelayMs: number | undefined;
  let applies = false;
  let sawAgent = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const separator = line.indexOf(':');
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (key === 'user-agent') {
      const agent = value.toLowerCase();
      if (agent === '*' || agent.includes(userAgent.toLowerCase())) {
        applies = true;
      } else if (!sawAgent || agent !== '*') {
        applies = false;
      }
      sawAgent = true;
      continue;
    }
    if (!applies) continue;
    if (key === 'disallow') {
      if (value) rules.push({ allow: false, pattern: value });
    } else if (key === 'allow') {
      if (value) rules.push({ allow: true, pattern: value });
    } else if (key === 'crawl-delay') {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds >= 0) crawlDelayMs = seconds * 1000;
    }
  }

  return {
    rules,
    crawlDelayMs,
    isAllowed(path: string): boolean {
      const matching = rules.filter((rule) => patternToMatch(rule.pattern, path));
      if (matching.length === 0) return true;
      const longest = Math.max(...matching.map((rule) => rule.pattern.length));
      const strongest = matching.filter((rule) => rule.pattern.length === longest);
      return strongest.some((rule) => rule.allow);
    },
  };
}

export async function loadRobots(
  client: DiscoveryHttpClient,
  origin: string,
): Promise<{ rules: RobotsRules; found: boolean }> {
  try {
    const response = await client.get(new URL('/robots.txt', origin).href, 'robots');
    if (response.status >= 400) {
      return { rules: parseRobots(''), found: false };
    }
    return { rules: parseRobots(response.body), found: true };
  } catch {
    return { rules: parseRobots(''), found: false };
  }
}
