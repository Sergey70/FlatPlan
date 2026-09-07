/** A multi-touch gesture must never be interpreted as a room-selection tap. */
export function createTapTracker() {
  const pointers = new Map<number, { x: number; y: number }>();
  let blocked = false;
  return {
    down(id: number, x: number, y: number, button: number) {
      pointers.set(id, { x, y });
      if (pointers.size > 1 || button !== 0) blocked = true;
    },
    up(id: number, x: number, y: number) {
      const start = pointers.get(id);
      const tap =
        !!start &&
        !blocked &&
        pointers.size === 1 &&
        Math.hypot(x - start.x, y - start.y) <= 5;
      pointers.delete(id);
      if (!pointers.size) blocked = false;
      return tap;
    },
    cancel(id: number) {
      pointers.delete(id);
      if (!pointers.size) blocked = false;
    },
  };
}
