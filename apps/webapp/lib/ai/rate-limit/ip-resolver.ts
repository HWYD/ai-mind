/**
 * 从请求头解析客户端 IP。
 * 只在可信代理注入 x-forwarded-for 时信任，IP 缺失时降级为 'unknown'。
 */
export function resolveClientIp(request: { headers: Headers }): string {
    // 仅在服务端环境中信任 x-forwarded-for，
    // 当前仅支持单层代理注入的格式："client, proxy1, ..."
    const forwarded = request.headers.get('x-forwarded-for')
    if (forwarded && forwarded.trim().length > 0) {
        return forwarded.split(',')[0]?.trim() || 'unknown'
    }

    return 'unknown'
}
