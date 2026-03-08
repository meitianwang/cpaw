import type { Handler } from "../types.js";
import type {
  ChannelPlugin,
  ChannelMeta,
  ChannelCapabilities,
} from "./types.js";

export type { Handler };

export abstract class Channel {
  abstract start(handler: Handler): Promise<void>;
  /** Optional: proactively send a message to a user. */
  deliver?(to: string, text: string): Promise<void>;
}

/**
 * Wrap a legacy Channel subclass into a ChannelPlugin.
 * Transition helper: keeps existing classes working while
 * we incrementally convert them to direct ChannelPlugin objects.
 */
export function fromLegacyChannel(
  ChannelCls: new () => Channel,
  meta: ChannelMeta,
  capabilities: ChannelCapabilities,
): ChannelPlugin {
  let instance: Channel | undefined;
  return {
    meta,
    capabilities,
    start: (handler) => {
      instance = new ChannelCls();
      return instance.start(handler);
    },
    deliver: (to, text) => {
      if (!instance?.deliver) {
        return Promise.reject(
          new Error(`Channel "${meta.id}" does not support proactive delivery`),
        );
      }
      return instance.deliver(to, text);
    },
  };
}
