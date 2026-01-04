type FetchFn = typeof globalThis.fetch;

type FetchInput = Parameters<FetchFn>[0];
type FetchInit = Parameters<FetchFn>[1];
type FetchReturn = ReturnType<FetchFn>;
type Preconnect = NonNullable<FetchFn["preconnect"]>;

export function getFetchUrl(input: FetchInput): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

export function getFetchMethod(input: FetchInput, init?: FetchInit): string {
  return init?.method ?? (input instanceof Request ? input.method : "GET");
}

export function formatFetchCall(input: FetchInput, init?: FetchInit): string {
  return `${getFetchMethod(input, init)} ${getFetchUrl(input)}`;
}

export function installMockFetch(originalFetch: FetchFn, mockedFetch: FetchFn) {
  mockedFetch.preconnect =
    originalFetch.preconnect?.bind(originalFetch) ??
    (((..._args: Parameters<Preconnect>) => Promise.resolve()) as Preconnect);

  globalThis.fetch = mockedFetch;
}

export function denyUnmockedFetch(originalFetch: FetchFn) {
  const mockedFetch = (async (
    input: FetchInput,
    init?: FetchInit
  ): FetchReturn => {
    throw new Error(`Unmocked fetch: ${formatFetchCall(input, init)}`);
  }) as FetchFn;

  installMockFetch(originalFetch, mockedFetch);
}

export function mockFetchError(originalFetch: FetchFn, message: string) {
  const mockedFetch = (async (
    input: FetchInput,
    init?: FetchInit
  ): FetchReturn => {
    throw new Error(`${message} (${formatFetchCall(input, init)})`);
  }) as FetchFn;

  installMockFetch(originalFetch, mockedFetch);
}
