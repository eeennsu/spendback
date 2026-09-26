/**
 * 앱에 내장한 모델 레지스트리(PRD 6장, 7장). 커밋을 고정한 URL로 받아 SHA-256으로 확인한다.
 * 하네스(scripts/eval)와 모델 관리(PRD 12장 7번)가 같이 쓴다.
 */
export const MODELS = [
  {
    id: 'qwen3.5-2b',
    name: 'Qwen3.5-2B',
    repo: 'unsloth/Qwen3.5-2B-GGUF',
    commit: 'f6d5376be1edb4d416d56da11e5397a961aca8ae',
    fileName: 'Qwen3.5-2B-Q4_K_M.gguf',
    sizeBytes: 1_280_835_840,
    sha256: 'aaf42c8b7c3cab2bf3d69c355048d4a0ee9973d48f16c731c0520ee914699223',
    license: 'Apache-2.0',
  },
  {
    id: 'kanana-1.5-2.1b',
    name: 'Kanana-1.5-2.1B',
    repo: 'DevQuasar/kakaocorp.kanana-1.5-2.1b-instruct-2505-GGUF',
    commit: '4d3b6203857d893ebfcaca6c51901e3ea1d00d00',
    fileName: 'kakaocorp.kanana-1.5-2.1b-instruct-2505.Q4_K_M.gguf',
    sizeBytes: 1_522_796_768,
    sha256: '24d3db59d0af2c85c0afc0bbc99da1174b73ef6728bce2650bd91bec28ad1c81',
    license: 'Apache-2.0',
  },
  {
    id: 'exaone-4.0-1.2b',
    name: 'EXAONE 4.0 1.2B',
    repo: 'LGAI-EXAONE/EXAONE-4.0-1.2B-GGUF',
    commit: '162446400ea4596377a3ce1d3ddffa32971af0a6',
    fileName: 'EXAONE-4.0-1.2B-Q4_K_M.gguf',
    sizeBytes: 812_437_792,
    sha256: '7b5e753540183ae4d56e6febd9b48cdd944de53386e6faa8f51c8f98cb2b47df',
    license: 'EXAONE AI Model License Agreement 1.2 - NC',
  },
] as const;

export type Model = (typeof MODELS)[number];
export type ModelId = Model['id'];

/** 잠정 기본값. 평가 하네스로 확인한다(PRD 6장) */
export const DEFAULT_MODEL_ID: ModelId = 'qwen3.5-2b';

export const modelUrl = (model: Model) =>
  `https://huggingface.co/${model.repo}/resolve/${model.commit}/${model.fileName}`;

/**
 * 추론 설정. 앱(llama.rn)과 하네스(node-llama-cpp)가 같은 값을 쓴다. 스레드 6은 스파이크에서 가장 빨랐다.
 * 컨텍스트와 샘플링은 스파이크 값에서 시작해 하네스로 정한다(PRD 6장, 11장)
 */
export const INFERENCE = {
  threads: 6,
  contextSize: 4096,
  maxTokens: 768,
  temperature: 0.7,
  topK: 20,
  topP: 0.9,
  minP: 0,
  /** 최근 토큰의 반복 벌점. 1이면 끈다. 두 런타임의 기본값이 달라 명시한다 */
  repeatPenalty: 1.1,
  repeatLastTokens: 64,
};
