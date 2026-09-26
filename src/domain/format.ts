/**
 * 금액은 어디서나 `32,000원`, 비율은 정수 %다(PRD 4.6). 금액은 원 단위 정수로 받는다.
 * 원 단위로 내리는 것(PRD 4.3)은 계산하는 쪽의 일이다.
 */

// Intl 대신 직접 묶는다. Hermes의 Intl 지원과 Jest(Node)의 결과가 같다는 보장이 없다
function groupDigits(amount: number) {
  return String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function formatWon(amount: number) {
  return `${groupDigits(amount)}원`;
}

/** 사용액과 전체를 나란히 쓸 때는 단위를 끝에 한 번 붙인다(docs/DESIGN.md 3.4) */
export function formatWonFraction(part: number, whole: number) {
  return `${groupDigits(part)} / ${formatWon(whole)}`;
}

/**
 * part ÷ whole을 사사오입한 정수 %. 비율 대신 두 정수를 받아 `0.285 * 100 = 28.499…` 같은 부동소수 오차를 피한다.
 * 음수는 절댓값 기준으로 반올림한다(-17.5% → -18%). Math.round만 쓰면 -17이 된다.
 */
export function formatPercent(part: number, whole: number) {
  if (whole === 0) throw new RangeError('전체가 0이면 비율을 정할 수 없다');
  const percent = (part * 100) / whole;
  // -0은 템플릿 문자열에서 "0"이 된다
  return `${Math.sign(percent) * Math.round(Math.abs(percent))}%`;
}
