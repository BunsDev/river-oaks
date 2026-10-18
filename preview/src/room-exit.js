// A room's street door is in its facade (d 0). Step outside is offered within this reach of it:
// every ordinary shop (at most 10 m deep) keeps it everywhere, while a deep venue such as IPIC's
// lounge and auditorium, 20-34 m in and a floor up, does not. Map travel still leaves from anywhere.
export const ROOM_EXIT_REACH = 12;

export const nearRoomExit = (room, [east, north]) => typeof room?.toLocal !== 'function' || room.toLocal(east, north)[1] <= ROOM_EXIT_REACH;
