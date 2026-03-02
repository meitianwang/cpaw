import type { Handler } from "../types.js";

export type { Handler };

export abstract class Channel {
  abstract start(handler: Handler): Promise<void>;
}
