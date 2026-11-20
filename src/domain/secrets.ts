export interface SecretFinding {
  kind: string;
  sample: string;
}

const PATTERNS: { kind: string; re: RegExp }[] = [
  { kind: "aws-access-key", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { kind: "api-key-sk", re: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { kind: "github-token", re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/ },
  { kind: "slack-token", re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
  { kind: "jwt", re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/ },
  { kind: "private-key", re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { kind: "bearer-token", re: /\bBearer\s+[A-Za-z0-9._-]{24,}\b/ },
];

const mask = (s: string): string => (s.length <= 8 ? "****" : `${s.slice(0, 4)}…${s.slice(-2)}`);

/** Scans text for well-known secret shapes and for any of the user's own secret values (e.g. from .env.demo). */
export function scanSecrets(text: string, literals: string[] = []): SecretFinding[] {
  const out: SecretFinding[] = [];
  for (const p of PATTERNS) {
    const m = p.re.exec(text);
    if (m) out.push({ kind: p.kind, sample: mask(m[0]) });
  }
  for (const lit of literals) {
    if (lit.length >= 6 && text.includes(lit)) out.push({ kind: "env-secret", sample: mask(lit) });
  }
  return out;
}

const ERROR_RE = /(something went wrong|unexpected error|internal server error|application error|page not found|\b404\b|\b500\b|failed to (?:load|fetch)|uncaught)/i;

/** Returns the first error-banner-like phrase in visible text, or null. */
export function findErrorBanner(text: string): string | null {
  return ERROR_RE.exec(text)?.[0] ?? null;
}
