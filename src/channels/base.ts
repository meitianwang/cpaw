import type { Handler } from "../types.js";
import type {
  ChannelPlugin,
  ChannelMeta,
  ChannelCapabilities,
} from "./types.js";

export type { Handler };

export abstract class Channel {
  abstract start(handler: Handler): Promise<void>;
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
  return {
    meta,
    capabilities,
    start: (handler) => new ChannelCls().start(handler),
  };
}
