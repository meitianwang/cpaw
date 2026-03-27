/**
 * Multimodal memory support — ported from OpenClaw.
 * Supports image and audio files for indexing with Gemini embedding-2.
 */

const SPECS = {
  image: {
    labelPrefix: "Image file",
    extensions: [".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".heif"],
  },
  audio: {
    labelPrefix: "Audio file",
    extensions: [".mp3", ".wav", ".ogg", ".opus", ".m4a", ".aac", ".flac"],
  },
} as const;

export type MultimodalModality = keyof typeof SPECS;

export type MultimodalSettings = {
  enabled: boolean;
  modalities: MultimodalModality[];
  maxFileBytes: number;
};

export function getExtensions(modality: MultimodalModality): readonly string[] {
  return SPECS[modality].extensions;
}

export function buildLabel(modality: MultimodalModality, normalizedPath: string): string {
  return `${SPECS[modality].labelPrefix}: ${normalizedPath}`;
}

/**
 * Classify a file path as a multimodal modality, or null if not applicable.
 */
export function classify(filePath: string, settings: MultimodalSettings): MultimodalModality | null {
  if (!settings.enabled || settings.modalities.length === 0) return null;
  const lower = filePath.trim().toLowerCase();
  for (const modality of settings.modalities) {
    for (const ext of getExtensions(modality)) {
      if (lower.endsWith(ext)) return modality;
    }
  }
  return null;
}

/**
 * Check if a provider+model combination supports multimodal embeddings.
 */
export function supportsMultimodal(provider: string, model: string): boolean {
  if (provider !== "gemini") return false;
  const normalized = model.trim().replace(/^models\//, "").replace(/^(gemini|google)\//, "");
  return normalized === "gemini-embedding-2-preview";
}
