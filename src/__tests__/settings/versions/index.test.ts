import {describe, expect, test} from "@jest/globals";
import {DEFAULT_SETTINGS, settingsSchema} from "../../../settings/versions";
import {parseWithSchema} from "../../../settings/utils";
import {ok} from "neverthrow";
import {cloneDeep} from "../../../test_utils/clone";


describe('smoketest', () => {
    test("default settings should be valid", () => {
        const parsed = parseWithSchema(settingsSchema, cloneDeep(DEFAULT_SETTINGS));
        expect(parsed).toEqual(ok(DEFAULT_SETTINGS));
    });
});
