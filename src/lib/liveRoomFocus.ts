// Which Live Tournament room is open on screen right now, if any. The
// foreground notification handler (app/_layout.tsx) reads it to keep a
// "Half N starts now" push silent on the phone that's already showing that
// room's countdown; anywhere else in the app the banner still shows.
let openRoomId: string | null = null;

export function setOpenLiveRoom(roomId: string | null): void {
  openRoomId = roomId;
}

export function isLiveRoomOpen(roomId: unknown): boolean {
  return typeof roomId === 'string' && roomId === openRoomId;
}
