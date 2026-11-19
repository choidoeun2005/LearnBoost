import { postResponse } from './rag.js';

export const chatModels = [
  { id: 'furiosa-ai/gpt-oss-120b', label: 'GPT OSS 120B', description: '복잡한 문제 풀이와 코드 분석' },
  { id: 'furiosa-ai/gemma-4-31B-it-FP8-block', label: 'Gemma 4 31B', description: '설명, 요약, 글쓰기' },
  { id: 'furiosa-ai/EXAONE-4.5-33B-FP8', label: 'EXAONE 4.5 33B', description: '한국어 질의와 긴 문서 분석' },
  { id: 'furiosa-ai/Qwen3-VL-32B-Instruct', label: 'Qwen3 VL 32B', description: '문서의 표와 구조 이해' },
  { id: 'furiosa-ai/Qwen3-30B-A3B-FP8', label: 'Qwen3 30B A3B', description: '빠른 질의응답과 다국어 작업' },
];

export function createFuriosaConfig(env = process.env) {
  const llmBase = (env.LLM_BASE_URL || 'https://endpoint.access.furiosa.dev/v1').replace(/\/$/, '');
  const llmModel = env.LLM_MODEL || chatModels[0].id;
  const llmKey = env.LLM_API_KEY || '';
  const embeddingUrl = env.FURIOSA_EMBEDDING_URL || `${llmBase}/embeddings`;
  const rerankUrl = env.FURIOSA_RERANK_URL || `${llmBase}/rerank`;
  const models = chatModels.some(model => model.id === llmModel) ? chatModels : [
    { id: llmModel, label: llmModel, description: '서버에 설정된 모델' }, ...chatModels,
  ];
  return {
    llmBase, llmModel, llmKey, models, embeddingUrl, rerankUrl,
    embeddingModel: env.FURIOSA_EMBEDDING_MODEL || 'furiosa-ai/Qwen3-Embedding-8B',
    rerankModel: env.FURIOSA_RERANK_MODEL || 'furiosa-ai/Qwen3-Reranker-8B',
    embeddingKey: env.FURIOSA_EMBEDDING_API_KEY || (embeddingUrl === `${llmBase}/embeddings` ? llmKey : ''),
    rerankKey: env.FURIOSA_RERANK_API_KEY || (rerankUrl === `${llmBase}/rerank` ? llmKey : ''),
  };
}

function parseCompletionEvent(event) {
  try { return JSON.parse(event); }
  catch { throw new Error('모델이 올바르지 않은 응답 형식을 보냈어요. 다시 시도해 주세요.'); }
}

async function* completionEvents(body) {
  const decoder = new TextDecoder();
  let buffer = '';
  let data = [];
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    let newline;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newline).replace(/\r$/, '');
      buffer = buffer.slice(newline + 1);
      if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
      if (line === '' && data.length) {
        const event = data.join('\n');
        data = [];
        if (event === '[DONE]') return;
        yield parseCompletionEvent(event);
      }
    }
  }
  buffer += decoder.decode();
  if (buffer.startsWith('data:')) data.push(buffer.slice(5).trim());
  const finalEvent = data.join('\n');
  if (finalEvent && finalEvent !== '[DONE]') yield parseCompletionEvent(finalEvent);
}

export function normalizeCitations(content, sourceCount) {
  // Some chat templates refer to a numbered source with line markers of their own.
  return content.replace(/【(\d+)(?:†[^】\r\n]{1,48})?】/g, (citation, index) => (
    Number(index) > 0 && Number(index) <= sourceCount ? `[${Number(index)}]` : citation
  ));
}

export async function completeChat({ config, model, messages, signal, emit, sourceCount = 0 }) {
  const deepReasoning = ['furiosa-ai/gpt-oss-120b', 'furiosa-ai/EXAONE-4.5-33B-FP8'].includes(model);
  const result = await postResponse(`${config.llmBase}/chat/completions`, {
    model, messages, stream: Boolean(emit), temperature: 0.5, max_tokens: deepReasoning ? 8192 : 2048,
    ...(model === 'furiosa-ai/gpt-oss-120b' ? { reasoning_effort: 'medium' } : {}),
    ...(model === 'furiosa-ai/Qwen3-30B-A3B-FP8' ? { chat_template_kwargs: { enable_thinking: false } } : {}),
  }, { key: config.llmKey, signal, timeout: 180000 });

  let content = '';
  let finishReason;
  if (emit && result.headers.get('content-type')?.includes('text/event-stream')) {
    let analyzing = false;
    let writing = false;
    for await (const event of completionEvents(result.body)) {
      if (event?.error) throw new Error('모델의 답변 생성이 중단됐어요. 다시 시도해 주세요.');
      const choice = event?.choices?.[0];
      if (!choice) continue;
      const delta = choice.delta;
      finishReason = choice.finish_reason || finishReason;
      if (!analyzing && !writing && (delta?.reasoning || delta?.reasoning_content)) {
        analyzing = true;
        emit({ type: 'progress', message: '질문과 답변에 사용할 정보를 검토하고 있어요.' });
      }
      if (typeof delta?.content === 'string' && delta.content) {
        if (!writing) {
          writing = true;
          emit({ type: 'progress', message: '답변을 작성하고 있어요.' });
        }
        content += delta.content;
        emit({ type: 'delta', content: delta.content });
      }
    }
    if (!finishReason) throw new Error('답변 스트림이 중간에 끊겼어요. 다시 시도해 주세요.');
  } else {
    const payload = await result.json().catch(() => { throw new Error('모델이 올바르지 않은 응답 형식을 보냈어요. 다시 시도해 주세요.'); });
    const choice = payload?.choices?.[0];
    content = choice?.message?.content;
    finishReason = choice?.finish_reason;
    if (emit && typeof content === 'string' && content.trim()) emit({ type: 'delta', content });
  }
  if (typeof content !== 'string' || !content.trim()) throw new Error('모델이 빈 답변을 반환했어요. 질문을 간단히 쓰거나 모델을 바꿔 다시 시도해 주세요.');
  return { content: sourceCount ? normalizeCitations(content, sourceCount) : content, truncated: finishReason === 'length' };
}
