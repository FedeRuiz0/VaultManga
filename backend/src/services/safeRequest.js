import axios from 'axios';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getRetryAfterMs = (error) => {
  const retryAfter = error?.response?.headers?.['retry-after'];
  if (!retryAfter) return null;

  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds)) return seconds * 1000;

  const asDate = Date.parse(retryAfter);
  if (Number.isNaN(asDate)) return null;

  return Math.max(asDate - Date.now(), 0);
};

export async function safeRequest(
  requestFactory,
  {
    label = 'request',
    maxRetries = 4,
    baseDelayMs = 800,
    maxDelayMs = 12_000,
    requestDelayMs = 300,
  } = {}
) {
  let attempt = 0;

  while (attempt <= maxRetries) {
    if (requestDelayMs > 0) {
      await sleep(requestDelayMs);
    }

    try {
      return await requestFactory();
    } catch (error) {
      const status = error?.response?.status;
      const shouldRetry = status === 429 && attempt < maxRetries;

      if (!shouldRetry) {
        throw error;
      }

      const retryAfterMs = getRetryAfterMs(error);
      const backoffMs = Math.min(baseDelayMs * (2 ** attempt), maxDelayMs);
      const jitterMs = Math.floor(Math.random() * 250);
      const delayMs = Math.max(retryAfterMs || 0, backoffMs + jitterMs);

      console.warn(
        `⚠️ ${label} hit 429. Retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})`
      );

      await sleep(delayMs);
      attempt += 1;
    }
  }

  throw new Error(`${label} failed after retries`);
}

export async function safeGet(url, config = {}, options = {}) {
  return safeRequest(() => axios.get(url, config), {
    label: options.label || `GET ${url}`,
    ...options,
  });
}

// Compatibilidad con el código actual que usa safeGet.get(...)
safeGet.get = (url, config = {}, options = {}) => {
  return safeGet(url, config, options);
};

export async function safePost(url, data = {}, config = {}, options = {}) {
  return safeRequest(() => axios.post(url, data, config), {
    label: options.label || `POST ${url}`,
    ...options,
  });
}

safePost.post = (url, data = {}, config = {}, options = {}) => {
  return safePost(url, data, config, options);
};

export default {
  safeRequest,
  safeGet,
  safePost,
};