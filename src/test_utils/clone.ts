import {cloneJson} from "../json";

export function cloneDeep<T>(value: T): T {
    return cloneJson(value);
}
