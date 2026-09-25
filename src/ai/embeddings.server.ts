/*  The one place that turns text into embeddings. File processing and search must use the
    same model and size, so both go through here; changing models means re-processing
    every stored file and updating vector(1536) in schema_file_vectors.sql. */

export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;
const BATCH_SIZE = 100;

// Returns one embedding per input text, in the same order. Throws if OpenAI fails.
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const embeddings: number[][] = [];
  for (let start = 0; start < texts.length; start += BATCH_SIZE) {
    const batch = texts.slice(start, start + BATCH_SIZE);
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.API_KEY}`,
      },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: batch }),
    });
    if (!response.ok) {
      throw new Error(`OpenAI embeddings error ${response.status}: ${await response.text()}`);
    }

    const data: { data: { index: number; embedding: number[] }[] } = await response.json();
    data.data
      .sort((a, b) => a.index - b.index)
      .forEach((item) => embeddings.push(item.embedding));
  }
  return embeddings;
}
