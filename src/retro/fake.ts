import type { Generate, GenerateRequest } from './narrate';

/**
 * 가짜 Generate(PRD 6장). 시도마다 준비한 출력을 몇 글자씩 흘린다. Error를 주면 그 시도에서 던진다.
 * 도메인·화면 테스트는 이것으로 돌린다. calls로 받은 요청을 본다.
 */
export function fakeGenerate(outputs: Array<string | Error>, chunk = 4) {
  const calls: GenerateRequest[] = [];
  const generate: Generate = async (request, onToken, signal) => {
    const output = outputs[calls.length] ?? outputs[outputs.length - 1];
    calls.push(request);
    if (output instanceof Error) throw output;
    let sent = '';
    for (let i = 0; i < output.length && !signal.aborted; i += chunk) {
      // 실제 모델처럼 토큰 사이에 다른 일이 끼어들 수 있게 한 틱 쉰다
      await Promise.resolve();
      const token = output.slice(i, i + chunk);
      sent += token;
      onToken(token);
    }
    return sent;
  };
  return { generate, calls };
}
