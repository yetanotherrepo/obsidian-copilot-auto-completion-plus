import {describe, expect, test} from "@jest/globals";

import {isOfficialDeepSeekChatUrl, selectDeepSeekModels} from "../deepseek";

describe("DeepSeek API helpers", () => {
    test.each([
        "https://api.deepseek.com/chat/completions",
        "https://api.deepseek.com/chat/completions/",
    ])("accepts official chat URL %s", (url) => {
        expect(isOfficialDeepSeekChatUrl(url)).toEqual(true);
    });

    test.each([
        "http://api.deepseek.com/chat/completions",
        "https://example.com/chat/completions",
        "https://api.deepseek.com/v1/chat/completions",
        "https://api.deepseek.com/chat/completions?target=example.com",
        "https://api.deepseek.com/chat/completions#fragment",
        "https://user:password@api.deepseek.com/chat/completions",
    ])("rejects non-official chat URL %s", (url) => {
        expect(isOfficialDeepSeekChatUrl(url)).toEqual(false);
    });

    test("selects and sorts valid model IDs", () => {
        expect(selectDeepSeekModels({
            data: [
                {id: "deepseek-v4-pro"},
                {id: ""},
                {id: "deepseek-v4-flash"},
                {name: "missing-id"},
            ],
        })).toEqual([
            {id: "deepseek-v4-flash", name: "deepseek-v4-flash"},
            {id: "deepseek-v4-pro", name: "deepseek-v4-pro"},
        ]);
    });
});
