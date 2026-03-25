import type { GatewayRpcResponseEnvelope } from "./protocol.js";
import {
  GATEWAY_ADMIN_RPC_READ_METHODS,
  GATEWAY_ADMIN_RPC_WRITE_METHODS,
  type GatewayAdminRpcContext,
  handleGatewayAdminRpcMethod,
} from "./server-methods/admin.js";
import {
  GATEWAY_RPC_WRITE_METHODS,
  type GatewayRpcCoreContext,
  handleGatewayCoreRpcMethod,
} from "./server-methods/rpc-core.js";

type GatewayRpcRequest = {
  id: string;
  method: string;
  params: Record<string, unknown>;
  userId: string;
  isAdmin: boolean;
  handler: Parameters<GatewayRpcCoreContext["processInboundMessage"]>[0]["handler"];
};

type GatewayRpcRouterContext = GatewayAdminRpcContext & GatewayRpcCoreContext;

export async function handleGatewayRpcRequest(
  ctx: GatewayRpcRouterContext,
  params: GatewayRpcRequest,
): Promise<GatewayRpcResponseEnvelope> {
  const ok = (result: unknown): GatewayRpcResponseEnvelope => ({
    type: "rpc-response",
    id: params.id,
    result,
  });
  const error = (message: string): GatewayRpcResponseEnvelope => ({
    type: "rpc-response",
    id: params.id,
    error: message,
  });

  if (
    (GATEWAY_RPC_WRITE_METHODS.has(params.method) ||
      GATEWAY_ADMIN_RPC_WRITE_METHODS.has(params.method)) &&
    !params.isAdmin
  ) {
    return error("admin role required");
  }
  if (GATEWAY_ADMIN_RPC_READ_METHODS.has(params.method) && !params.isAdmin) {
    return error("admin role required");
  }

  const adminResult = await handleGatewayAdminRpcMethod(ctx, params.method, params.params);
  if (adminResult.handled) {
    return "error" in adminResult ? error(adminResult.error) : ok(adminResult.result);
  }

  const coreResult = await handleGatewayCoreRpcMethod(ctx, params);
  if (coreResult.handled) {
    return "error" in coreResult ? error(coreResult.error) : ok(coreResult.result);
  }

  return error(`unknown method: ${params.method}`);
}
