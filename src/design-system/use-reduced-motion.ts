import { useReduceMotion } from '@/hooks/use-reduce-motion';

/** 시스템 조회를 앱 전역에서 한 번만 공유하는 공통 훅이에요. */
export function useReducedMotion(): boolean {
  return useReduceMotion();
}
