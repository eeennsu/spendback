/**
 * 버릴 코드(PROTOTYPE): LLM 스파이크 러너.
 *
 * PC의 `pnpm spike`가 딥 링크로 실행한다.
 *   llmspike://run?suite=threads&models=qwen&threads=2,4,6,8
 *   llmspike://run?suite=full&models=qwen,kanana,exaone&threads=6&runs=3
 * 모든 측정값은 logcat(ReactNativeJS)에 `SPIKE <seq> <i>/<n> <json 조각>`으로 내보내고 화면에도 보여준다.
 */
import React, {useEffect, useRef, useState} from 'react';
import {Linking, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {initLlama, type LlamaContext} from 'llama.rn';
import {FACTS, PROMPT_VERSION, buildGrammar, buildMessages, check} from './src/retro';

const MODEL_DIR = '/storage/emulated/0/Android/data/com.llmspike/files/models';
const MODELS: Record<string, string> = {
  qwen: 'Qwen3.5-2B-Q4_K_M.gguf',
  kanana: 'kakaocorp.kanana-1.5-2.1b-instruct-2505.Q4_K_M.gguf',
  exaone: 'EXAONE-4.0-1.2B-Q4_K_M.gguf',
};
const N_CTX = 4096;
const SPEED_PROMPT = '가계부를 꾸준히 쓰는 방법을 한 문단으로 설명해 줘.';
const RETRO_SAMPLING = {temperature: 0.7, top_k: 20, top_p: 0.9, min_p: 0};

type Params = {suite: string; models: string[]; threads: number[]; runs: number};

let seq = 0;
function emit(ev: Record<string, unknown>) {
  const s = JSON.stringify({t: Date.now(), ...ev});
  const id = seq++;
  const size = 700;
  const n = Math.ceil(s.length / size);
  for (let i = 0; i < n; i++) {
    console.log(`SPIKE ${id} ${i + 1}/${n} ${s.slice(i * size, (i + 1) * size)}`);
  }
}

function parseUrl(url: string | null | undefined): Params | null {
  if (!url || !url.startsWith('llmspike://run')) return null;
  const q = new URLSearchParams(url.split('?')[1] ?? '');
  return {
    suite: q.get('suite') ?? 'full',
    models: (q.get('models') ?? 'qwen,kanana,exaone').split(','),
    threads: (q.get('threads') ?? '6').split(',').map(Number),
    runs: Number(q.get('runs') ?? '3'),
  };
}

async function timed(ctx: LlamaContext, params: Parameters<LlamaContext['completion']>[0]) {
  const t0 = Date.now();
  let first = 0;
  let headline = 0;
  let acc = '';
  const res = await ctx.completion(params, d => {
    if (!first) first = Date.now();
    acc += d.token;
    if (!headline && /"headline":\s?"[^"]*"/.test(acc)) headline = Date.now();
  });
  return {
    res,
    wallMs: Date.now() - t0,
    firstTokenMs: first ? first - t0 : null,
    headlineMs: headline ? headline - t0 : null,
  };
}

async function runSuite(p: Params, log: (s: string) => void) {
  emit({ev: 'suite-start', ...p, nCtx: N_CTX});
  const messages = buildMessages(FACTS);
  const grammar = buildGrammar(FACTS);
  for (const m of p.models) {
    for (const threads of p.threads) {
      const tag = `${m}:t${threads}`;
      emit({ev: 'phase', phase: `load:${tag}`});
      log(`${tag} 로드 중`);
      const t0 = Date.now();
      let ctx: LlamaContext;
      try {
        ctx = await initLlama({model: `${MODEL_DIR}/${MODELS[m]}`, n_ctx: N_CTX, n_threads: threads, n_gpu_layers: 0, use_mlock: false});
      } catch (e) {
        emit({ev: 'load-error', model: m, threads, error: String(e)});
        log(`${tag} 로드 실패: ${String(e)}`);
        continue;
      }
      const loadMs = Date.now() - t0;
      emit({
        ev: 'loaded', model: m, threads, loadMs,
        androidLib: ctx.androidLib, gpu: ctx.gpu, reasonNoGPU: ctx.reasonNoGPU, devices: ctx.devices,
        systemInfo: ctx.systemInfo, desc: ctx.model.desc, size: ctx.model.size, nParams: ctx.model.nParams,
        jinja: ctx.model.chatTemplates?.jinja?.default,
      });
      log(`${tag} 로드 ${loadMs}ms, ${ctx.androidLib}, gpu=${ctx.gpu}`);

      emit({ev: 'phase', phase: `speed:${tag}`});
      const sp = await timed(ctx, {
        messages: [{role: 'user', content: SPEED_PROMPT}],
        jinja: true, enable_thinking: false, reasoning_format: 'none',
        // ignore_eos: true는 llama.rn 0.12.9에서 SIGSEGV를 낸다(JSIParams.cpp:629, 빈 logit_bias 벡터에 EOS 인덱스로 씀).
        n_predict: 128, temperature: 0,
      });
      emit({ev: 'speed', model: m, threads, wallMs: sp.wallMs, firstTokenMs: sp.firstTokenMs, timings: sp.res.timings, text: sp.res.text});
      log(`${tag} 생성 ${sp.res.timings.predicted_per_second.toFixed(1)} tok/s, 프롬프트 ${sp.res.timings.prompt_per_second.toFixed(1)} tok/s`);

      if (p.suite === 'full') {
        const variants = [
          ...Array.from({length: p.runs}, (_, i) => ({grammar: true, seed: i + 1})),
          {grammar: false, seed: 1},
        ];
        for (const v of variants) {
          const name = `${v.grammar ? 'gbnf' : 'free'}#${v.seed}`;
          emit({ev: 'phase', phase: `retro:${tag}:${name}`});
          log(`${tag} 회고 ${name}`);
          const r = await timed(ctx, {
            messages, jinja: true, enable_thinking: false, reasoning_format: 'none',
            n_predict: 768, seed: v.seed, ...RETRO_SAMPLING,
            ...(v.grammar ? {grammar} : {}),
          });
          const c = check(r.res.text, FACTS);
          emit({
            ev: 'retro', promptVersion: PROMPT_VERSION, model: m, threads, variant: name, contentEmpty: !r.res.content, grammar: v.grammar, seed: v.seed,
            wallMs: r.wallMs, firstTokenMs: r.firstTokenMs, headlineMs: r.headlineMs, timings: r.res.timings,
            stoppedLimit: r.res.stopped_limit, contextFull: r.res.context_full,
            ...c, text: r.res.text,
          });
          log(`${tag} ${name}: 스키마 ${c.schemaOk} 키 ${c.distinctKeys} 키 포함 문장 ${c.sentencesWithPh}/${c.sentences} 숫자 [${c.digits}] 외국 문자 [${c.foreign}] 수사 ${c.numerals.length}\n  ${c.rendered.join('\n  ')}`);
        }
      }
      emit({ev: 'phase', phase: `release:${tag}`});
      await ctx.release();
    }
  }
  emit({ev: 'phase', phase: 'idle'});
  emit({ev: 'suite-done'});
  log('끝');
}

export default function App() {
  const [lines, setLines] = useState<string[]>(['llmspike://run 딥 링크를 기다리는 중']);
  const running = useRef(false);
  const log = (s: string) => setLines(prev => [...prev.slice(-60), s]);

  const start = (p: Params | null) => {
    if (!p || running.current) return;
    running.current = true;
    log(`시작: ${JSON.stringify(p)}`);
    runSuite(p, log)
      .catch(e => {
        emit({ev: 'suite-error', error: String(e)});
        log(`오류: ${String(e)}`);
      })
      .finally(() => (running.current = false));
  };

  useEffect(() => {
    Linking.getInitialURL().then(u => start(parseUrl(u)));
    const sub = Linking.addEventListener('url', e => start(parseUrl(e.url)));
    return () => sub.remove();
  }, []);

  return (
    <View style={styles.root}>
      <Text style={styles.title}>LLM 스파이크(버릴 코드)</Text>
      <Pressable style={styles.button} onPress={() => start(parseUrl('llmspike://run?suite=full&models=exaone&threads=6&runs=1'))}>
        <Text style={styles.buttonText}>EXAONE 빠른 실행</Text>
      </Pressable>
      <ScrollView style={styles.log}>
        {lines.map((l, i) => (
          <Text key={i} style={styles.line}>{l}</Text>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, paddingTop: 48, paddingHorizontal: 16, backgroundColor: '#111'},
  title: {color: '#fff', fontSize: 18, fontWeight: '600', marginBottom: 12},
  button: {backgroundColor: '#335', padding: 12, borderRadius: 8, marginBottom: 12},
  buttonText: {color: '#fff'},
  log: {flex: 1},
  line: {color: '#ddd', fontSize: 12, marginBottom: 6, fontFamily: 'monospace'},
});
