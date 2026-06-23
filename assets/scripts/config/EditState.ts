import { Rect } from 'cc';

/**
 * Shared EDIT-mode state — lets EditMode and EditPanel coordinate WITHOUT a cross-node @property reference
 * (those have to be wired in the inspector and are easy to leave null). Same idea as DebugDraw.
 *
 *  - `editing`  : EditMode writes it on toggle; EditPanel reads it to show/hide itself.
 *  - `panelRect`: EditPanel publishes its on-screen box while visible; EditMode reads it to avoid grabbing
 *                 an arena stone through the panel. Null when the panel is hidden.
 */
export const EditState: { editing: boolean; panelRect: Rect | null } = {
    editing: false,
    panelRect: null,
};
