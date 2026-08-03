declare module "micromatch" {
    export function isMatch(value: string, pattern: string | string[]): boolean;
    export function some(values: string | string[], patterns: string | string[]): boolean;
}
