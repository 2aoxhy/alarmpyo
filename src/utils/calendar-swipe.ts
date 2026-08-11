export type CalendarSwipeGesture = {
  dx: number;
  dy: number;
  vx: number;
};

const MIN_SWIPE_DISTANCE = 48;
const MIN_SWIPE_VELOCITY = 0.45;
const MIN_HORIZONTAL_START_DISTANCE = 16;
const HORIZONTAL_DOMINANCE_RATIO = 1.2;

export function isCalendarHorizontalSwipe(
  gesture: Pick<CalendarSwipeGesture, 'dx' | 'dy'>,
): boolean {
  const horizontalDistance = Math.abs(gesture.dx);
  const verticalDistance = Math.abs(gesture.dy);

  return (
    horizontalDistance >= MIN_HORIZONTAL_START_DISTANCE &&
    horizontalDistance > verticalDistance * HORIZONTAL_DOMINANCE_RATIO
  );
}

export function resolveCalendarSwipeMonthOffset(
  gesture: CalendarSwipeGesture,
): -1 | 0 | 1 {
  if (!isCalendarHorizontalSwipe(gesture)) return 0;

  const completedSwipe =
    Math.abs(gesture.dx) >= MIN_SWIPE_DISTANCE ||
    Math.abs(gesture.vx) >= MIN_SWIPE_VELOCITY;
  if (!completedSwipe) return 0;

  return gesture.dx < 0 ? 1 : -1;
}
