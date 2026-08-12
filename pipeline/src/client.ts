export type FetchClient = (url: string) => Promise<string>;

export const liveClient: FetchClient = async (url) => {
  const res = await fetch(url, { headers: { "User-Agent": "FrontierAIFeed-Pipeline/1.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
};
