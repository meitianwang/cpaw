#!/bin/bash
# KlausAI 一键编译、安装、启动脚本
# 用法: ./run.sh [设备名称]
# 示例: ./run.sh "iPhone 17 Pro"
# 不传参数默认使用 iPhone 17 Pro

set -e

# ============ 配置 ============
SCHEME="KlausAI"
BUNDLE_ID="com.twm.KlausAI"
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEFAULT_DEVICE="iPhone 17 Pro"
DEVICE_NAME="${1:-$DEFAULT_DEVICE}"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

info()    { echo -e "${CYAN}▸${NC} $1"; }
success() { echo -e "${GREEN}✔${NC} $1"; }
warn()    { echo -e "${YELLOW}⚠${NC} $1"; }
error()   { echo -e "${RED}✘${NC} $1"; exit 1; }

# ============ 查找模拟器 UDID ============
info "正在查找模拟器: ${DEVICE_NAME} ..."
DEVICE_UDID=$(xcrun simctl list devices available -j \
  | python3 -c "
import json, sys
data = json.load(sys.stdin)
for runtime, devices in data['devices'].items():
    for d in devices:
        if d['name'] == '${DEVICE_NAME}' and d['isAvailable']:
            print(d['udid'])
            sys.exit(0)
sys.exit(1)
" 2>/dev/null) || error "找不到可用的模拟器: ${DEVICE_NAME}\n  可用设备: $(xcrun simctl list devices available | grep -E 'iPhone|iPad' | sed 's/^/    /')"

success "找到设备: ${DEVICE_NAME} (${DEVICE_UDID})"

# ============ 停止已有进程 ============
info "检查是否有正在运行的 ${SCHEME} ..."
if xcrun simctl get_app_container "${DEVICE_UDID}" "${BUNDLE_ID}" >/dev/null 2>&1; then
    xcrun simctl terminate "${DEVICE_UDID}" "${BUNDLE_ID}" 2>/dev/null && warn "已停止旧进程" || true
fi

# ============ 启动模拟器 ============
BOOT_STATE=$(xcrun simctl list devices -j | python3 -c "
import json, sys
data = json.load(sys.stdin)
for runtime, devices in data['devices'].items():
    for d in devices:
        if d['udid'] == '${DEVICE_UDID}':
            print(d['state'])
            sys.exit(0)
")

if [ "$BOOT_STATE" != "Booted" ]; then
    info "正在启动模拟器 ..."
    xcrun simctl boot "${DEVICE_UDID}" 2>/dev/null || true
fi
open -a Simulator

# ============ 编译 ============
info "正在编译 ${SCHEME} ..."
BUILD_DIR="${PROJECT_DIR}/build"

xcodebuild \
    -project "${PROJECT_DIR}/${SCHEME}.xcodeproj" \
    -scheme "${SCHEME}" \
    -sdk iphonesimulator \
    -destination "id=${DEVICE_UDID}" \
    -derivedDataPath "${BUILD_DIR}" \
    build \
    2>&1 | tail -5

if [ ${PIPESTATUS[0]} -ne 0 ]; then
    error "编译失败！请查看上方错误信息。"
fi
success "编译成功"

# ============ 安装 ============
APP_PATH=$(find "${BUILD_DIR}" -name "${SCHEME}.app" -type d | head -1)
if [ -z "$APP_PATH" ]; then
    error "找不到编译产物 ${SCHEME}.app"
fi

info "正在安装到模拟器 ..."
xcrun simctl install "${DEVICE_UDID}" "${APP_PATH}"
success "安装完成"

# ============ 启动 ============
info "正在启动 ${SCHEME} ..."
xcrun simctl launch "${DEVICE_UDID}" "${BUNDLE_ID}"
success "${SCHEME} 已启动！"
