import {describe, expect, test} from "@jest/globals";

import {hasPath, setPath} from "../json";

describe("JSON path safety", () => {
    test("does not read inherited properties", () => {
        const value = Object.create({inherited: true}) as Record<string, unknown>;

        expect(hasPath(value, "inherited")).toBe(false);
    });

    test.each(["__proto__", "constructor", "prototype"])(
        "does not write through the %s key",
        (key) => {
            const value: Record<string, unknown> = {};

            setPath(value, `${key}.polluted`, true);

            expect(Object.getOwnPropertyDescriptor(value, key)).toBeUndefined();
            expect(Object.prototype).not.toHaveProperty("polluted");
        }
    );
});
