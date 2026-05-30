import Context from "../../context_detection";
import {PreProcessor, PrefixAndSuffix} from "../types";

const REDACTION_PATTERNS: Array<[RegExp, string]> = [
    [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]"],
    [/\bBearer\s+[A-Za-z0-9._~+/=-]{16,}\b/g, "Bearer [redacted-token]"],
    [/\b(?:sk|rk|pk|ghp|gho|github_pat|xoxb|xoxp|xoxa|xoxr)[A-Za-z0-9_\-]{12,}\b/g, "[redacted-token]"],
    [/\bAKIA[0-9A-Z]{16}\b/g, "[redacted-aws-key]"],
    [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[redacted-private-key]"],
];

class SensitiveDataRedactor implements PreProcessor {
    process(prefix: string, suffix: string, context: Context): PrefixAndSuffix {
        return {
            prefix: redact(prefix),
            suffix: redact(suffix),
        };
    }

    removesCursor(prefix: string, suffix: string): boolean {
        return false;
    }
}

export function redact(value: string): string {
    return REDACTION_PATTERNS.reduce(
        (redacted, [pattern, replacement]) => redacted.replace(pattern, replacement),
        value
    );
}

export default SensitiveDataRedactor;
