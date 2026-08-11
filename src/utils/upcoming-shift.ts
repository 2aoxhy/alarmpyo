export type StartsAtValue = {
  startsAt: Date;
};

/** 이미 시작한 근무는 종료 전이어도 '다가오는 근무'에서 제외해요. */
export function isUpcomingShift<T extends StartsAtValue>(
  moment: T,
  now: Date,
): boolean {
  return moment.startsAt.getTime() > now.getTime();
}
