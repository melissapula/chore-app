// An avatar is either a chosen emoji or an uploaded image (stored as a
// downscaled data URL — see AvatarPickerModal). Shared by the picker and the
// pages that persist it.
export type AvatarValue =
    { kind: 'emoji'; emoji: string } | { kind: 'image'; dataUrl: string };
