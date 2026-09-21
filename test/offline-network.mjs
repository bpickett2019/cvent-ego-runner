// Offline suites may use local fixture servers, never Cvent or another remote.
const nativeFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : input);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('Offline test attempted unmocked external fetch');
  return nativeFetch(input, init);
};
