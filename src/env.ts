const read = (key: string, fallback = "") => {
  const env = (import.meta as unknown as { env: Record<string, string | undefined> }).env || {};
  return (env[key] || fallback).trim();
};

export const ENV = {
  openaiKey: read("VITE_OPENAI_API_KEY"),
  openaiModel: read("VITE_OPENAI_MODEL", "gpt-4.1-mini"),
  googleClientId: read("VITE_GOOGLE_CLIENT_ID"),
  spreadsheetId: read("VITE_GOOGLE_SPREADSHEET_ID", "16wFlke0bHFcmfn-3UyuYlGnImBq0DY7ouVYAlAFTZys"),
  spreadsheetName: read("VITE_GOOGLE_SPREADSHEET_NAME", "Sessions Performance Data"),
};

export function hasOpenAI() {
  return Boolean(ENV.openaiKey);
}
