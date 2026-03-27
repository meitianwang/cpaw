/**
 * Sensitive text redaction — aligned with OpenClaw's logging/redact.ts.
 * Masks API keys, tokens, secrets, PEM blocks before indexing.
 */

type RedactPattern = {
  pattern: RegExp;
  replace: (match: string, ...groups: string[]) => string;
};

function maskToken(token: string): string {
  if (token.length >= 18) {
    return `${token.slice(0, 6)}...${token.slice(-4)}`;
  }
  if (token.length >= 8) {
    return `${token.slice(0, 3)}...`;
  }
  return "***";
}

const PATTERNS: RedactPattern[] = [
  // ENV variable assignments: API_KEY=xxx, TOKEN=xxx, SECRET=xxx
  {
    pattern: /\b((?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)[=:]\s*)(\S{8,})/gi,
    replace: (_m, prefix, token) => `${prefix}${maskToken(token)}`,
  },
  // JSON fields: "apiKey": "xxx", "token": "xxx", "secret": "xxx"
  {
    pattern: /("(?:api[_-]?key|token|secret|password|credential|authorization)":\s*")([^"]{8,})(")/gi,
    replace: (_m, pre, token, post) => `${pre}${maskToken(token)}${post}`,
  },
  // CLI flags: --api-key VALUE, --token VALUE
  {
    pattern: /(--(?:api[_-]?key|token|secret|password)\s+)(\S{8,})/gi,
    replace: (_m, flag, token) => `${flag}${maskToken(token)}`,
  },
  // Authorization header: Bearer xxx
  {
    pattern: /(Bearer\s+)(\S{8,})/gi,
    replace: (_m, prefix, token) => `${prefix}${maskToken(token)}`,
  },
  // OpenAI keys: sk-xxx
  { pattern: /\bsk-[a-zA-Z0-9]{20,}\b/g, replace: (m) => maskToken(m) },
  // GitHub tokens: ghp_xxx, gho_xxx, ghu_xxx, ghs_xxx, ghr_xxx
  { pattern: /\bgh[pousr]_[a-zA-Z0-9]{36,}\b/g, replace: (m) => maskToken(m) },
  // Slack tokens: xoxb-xxx, xoxp-xxx, xoxa-xxx, xoxr-xxx, xoxs-xxx
  { pattern: /\bxox[bpars]-[a-zA-Z0-9-]{10,}\b/g, replace: (m) => maskToken(m) },
  // Google API keys: AIzaXxx
  { pattern: /\bAIza[a-zA-Z0-9_-]{35}\b/g, replace: (m) => maskToken(m) },
  // AWS keys: AKIA...
  { pattern: /\bAKIA[A-Z0-9]{16}\b/g, replace: (m) => maskToken(m) },
  // Groq keys: gsk_xxx
  { pattern: /\bgsk_[a-zA-Z0-9]{20,}\b/g, replace: (m) => maskToken(m) },
  // PEM private key blocks
  {
    pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
    replace: (m) => {
      const lines = m.split("\n");
      if (lines.length <= 2) return m;
      return `${lines[0]}\n...redacted...\n${lines[lines.length - 1]}`;
    },
  },
];

/**
 * Redact sensitive tokens from text before indexing into memory.
 */
export function redactSensitiveText(text: string): string {
  let result = text;
  for (const { pattern, replace } of PATTERNS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    result = result.replace(pattern, replace as (...args: string[]) => string);
  }
  return result;
}
