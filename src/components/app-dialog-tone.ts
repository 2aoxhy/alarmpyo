const FAILURE_WORDS = /실패|못했|오류|필요|문제/;
const SUCCESS_WORDS =
  /완료|저장했어요|가져왔어요|복구했어요|만들었어요|초기화했어요|적용했어요|마쳤어요|준비됐어요|준비했어요|했습니다/;

/** 실패 제목을 성공 색상으로 오인하지 않으면서 해요체 완료 문구도 인식해요. */
export function isSuccessDialogTitle(title: string): boolean {
  return !FAILURE_WORDS.test(title) && SUCCESS_WORDS.test(title);
}
