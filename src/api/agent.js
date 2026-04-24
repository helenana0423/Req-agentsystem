// src/api/agent.js
// Agent 相关 API：抽取 + 问答（SSE 流式）

import { api } from './client.js';

/**
 * 调后端抽取接口
 * @returns {Promise<{enabled: boolean, actions: Array, ...}>}
 *   enabled=false 表示后端未配 LLM Key，前端应 fallback 到本地规则引擎
 */
export async function extractFromText(text) {
  return api.post('/agent/extract', { text });
}

/**
 * SSE 流式问答
 * @param {string} question
 * @param {Function} onChunk - (content: string) => void
 * @param {Function} onDone
 * @param {Function} onError - (err: string) => void
 * @param {AbortSignal} signal - 可选，传入可中断请求
 */
export async function askAgentStream(question, onChunk, onDone, onError, signal) {
  let resp;
  try {
    resp = await fetch('/api/agent/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
      signal,
    });
  } catch (e) {
    // fetch 被 abort 时抛 AbortError
    if (e.name === 'AbortError') {
      onError?.('aborted');
    } else {
      onError?.(`网络错误: ${e.message}`);
    }
    return;
  }

  if (!resp.ok) {
    onError?.(`HTTP ${resp.status}`);
    return;
  }

  const reader = resp.body?.getReader();
  if (!reader) {
    onError?.('流式响应不可用');
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let gotAny = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE 规范：事件之间用空行分隔，兼容 \r\n\r\n / \n\n 两种换行
      // 先统一换行符为 \n
      buffer = buffer.replace(/\r\n/g, '\n');
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() || '';

      for (const chunk of chunks) {
        const lines = chunk.split('\n');
        let event = 'message';
        let data = '';
        for (const line of lines) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) {
            // data: 后规范只有一个空格，用 slice 按 SSE 规范去掉前导一个空格
            let d = line.slice(5);
            if (d.startsWith(' ')) d = d.slice(1);
            data += d;
          }
        }
        if (!data) continue;

        try {
          const parsed = JSON.parse(data);
          if (event === 'message' && typeof parsed.content === 'string') {
            gotAny = true;
            onChunk?.(parsed.content);
          } else if (event === 'done') {
            onDone?.(parsed);
            return; // 显式结束，避免后续逻辑
          } else if (event === 'error') {
            onError?.(parsed.error || '未知错误');
            try { reader.cancel(); } catch {}
            return; // 错误后立即停止，避免触发"未返回任何内容"误报
          }
        } catch (err) {
          console.warn('[SSE] JSON parse fail, raw:', data);
        }
      }

      // 外部 abort
      if (signal?.aborted) {
        try { reader.cancel(); } catch {}
        onError?.('aborted');
        return;
      }
    }
    if (!gotAny) {
      onError?.('后端未返回任何内容（可能 LLM 调用失败）');
      return;
    }
    onDone?.();
  } catch (e) {
    if (e.name === 'AbortError' || /abort/i.test(e.message)) {
      onError?.('aborted');
    } else {
      onError?.(`流式读取失败: ${e.message}`);
    }
  }
}
