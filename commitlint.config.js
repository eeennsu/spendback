module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // 커밋 접두어 규칙: hotfix는 배포된 것의 긴급 수정, update는 의존성·버전 갱신
    'type-enum': [2, 'always', ['feat', 'fix', 'refactor', 'hotfix', 'update', 'chore', 'docs']],
    // 제목은 한국어로 쓰고 RN·PRD·LLM 같은 영어 약어로 시작할 수 있어 대소문자 규칙을 끈다
    'subject-case': [0],
  },
};
