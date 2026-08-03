import { Transaction } from "@codemirror/state";

enum UserEvent {
    INPUT = "input",
    INPUT_TYPE = "input.type",
    INPUT_TYPE_COMPOSE = "input.type.compose",
    INPUT_PASTE = "input.paste",
    INPUT_DROP = "input.drop",
    INPUT_COMPLETE = "input.complete",
    DELETE = "delete",
    DELETE_SELECTION = "delete.selection",
    DELETE_FORWARD = "delete.forward",
    DELETE_BACKWARDS = "delete.backward",
    DELETE_CUT = "delete.cut",
    MOVE = "move",
    MOVE_DROP = "move.drop",
    CURSOR_MOVED = "select",
    CURSOR_MOVED_BY_MOUSE = "select.pointer",
    UNDO = "undo",
    REDO = "redo",
}

// eslint-disable-next-line @typescript-eslint/no-namespace -- The namespace adds typed helpers to the UserEvent enum.
namespace UserEvent {
    export function values(): UserEvent[] {
        return [
            UserEvent.INPUT,
            UserEvent.INPUT_TYPE,
            UserEvent.INPUT_TYPE_COMPOSE,
            UserEvent.INPUT_PASTE,
            UserEvent.INPUT_DROP,
            UserEvent.INPUT_COMPLETE,
            UserEvent.DELETE,
            UserEvent.DELETE_SELECTION,
            UserEvent.DELETE_FORWARD,
            UserEvent.DELETE_BACKWARDS,
            UserEvent.DELETE_CUT,
            UserEvent.MOVE,
            UserEvent.MOVE_DROP,
            UserEvent.CURSOR_MOVED,
            UserEvent.CURSOR_MOVED_BY_MOUSE,
            UserEvent.UNDO,
            UserEvent.REDO,
        ];
    }

    export function isDelete(event: UserEvent) {
        return String(event).contains("delete");
    }

    export function values_string(): Array<string> {
        return values().map((event) => String(event));
    }

    export function fromString(event: string): UserEvent | null {
        return values()
            .find((value) => String(value) === event) ?? null;
    }

    export function fromTransaction(transaction: Transaction): UserEvent | null {
        for (const inputType of UserEvent.values_string()) {
            if (transaction.isUserEvent(inputType)) {
                const event = UserEvent.fromString(inputType);
                if (event) {
                    return event;
                }
            }
        }
        return null;
    }
}

export default UserEvent;
