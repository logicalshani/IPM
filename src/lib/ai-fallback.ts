export function hasConfiguredAIProvider() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY);
}

export function textFallbackStream(text: string) {
  return {
    toDataStreamResponse() {
      return new Response(text, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8"
        }
      });
    }
  };
}
