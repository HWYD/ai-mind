import { describe, expect, it } from 'vitest'

import { assertOutboundDataAllowed, OutboundSecretDeniedError } from '@/lib/ai/tools/web/outbound-secret-guard'
import { assertNoForbiddenWebUrlInText, canonicalizePublicWebUrl, WebAccessPolicyError } from '@/lib/ai/tools/web/web-access-policy'

describe('outbound-secret-guard', () => {
    it.each([
        'Authorization: Bearer abc.def.ghi',
        'Basic dXNlcjpwYXNz',
        'Cookie: session=private-value',
        'api_key=sk-sensitive-value',
        'access_token=private-token',
        'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signature',
    ])('拒绝可识别的凭据且错误不回显原值：%s', value => {
        expect(() => assertOutboundDataAllowed(value)).toThrow(OutboundSecretDeniedError)
        try {
            assertOutboundDataAllowed(value)
        } catch (error) {
            expect(String(error)).not.toContain(value)
        }
    })

    it('拒绝与进程已配置 secret 精确匹配的业务值', () => {
        expect(() => assertOutboundDataAllowed('server-secret-value', { knownSecrets: ['server-secret-value'] })).toThrow(
            OutboundSecretDeniedError
        )
    })

    it('只在 secret 独立边界命中，避免普通词中的嵌入子串误杀', () => {
        const options = { knownSecrets: ['server-secret-value'] }

        expect(() => assertOutboundDataAllowed('请解释 prefixserver-secret-valuesuffix 的命名', options)).not.toThrow()
        expect(() => assertOutboundDataAllowed('配置值是 server-secret-value；请勿外发。', options)).toThrow(OutboundSecretDeniedError)
    })

    it('过短的 known secret 不做子串匹配，避免误杀普通文本', () => {
        expect(() => assertOutboundDataAllowed('普通文本包含 abc', { knownSecrets: ['abc'] })).not.toThrow()
    })

    it.each(['token 的工作原理', 'cookie 与 authorization 有什么区别', '随机字符串 abc123'])('不误伤普通技术查询：%s', value => {
        expect(() => assertOutboundDataAllowed(value)).not.toThrow()
    })
})

describe('web-access-policy', () => {
    it('规范化 HTTP(S) URL、移除 fragment 和默认端口', () => {
        expect(canonicalizePublicWebUrl('HTTPS://Example.COM:443/docs?q=react#private')).toBe('https://example.com/docs?q=react')
    })

    it.each([
        'ftp://example.com/file',
        'https://user:password@example.com',
        'http://localhost:3000/admin',
        'http://127.0.0.1/private',
        'http://10.1.2.3/private',
        'http://172.16.1.2/private',
        'http://192.168.1.2/private',
        'http://169.254.1.2/metadata',
        'http://[::1]/private',
        'http://[fc00::1]/private',
        'http://[ff02::1]/multicast',
        'http://[::ffff:127.0.0.1]/private',
        'http://[::ffff:10.1.2.3]/private',
        'http://[::ffff:169.254.169.254]/metadata',
        'http://[::127.0.0.1]/private',
        'http://[::10.1.2.3]/private',
        'https://example.com/file?X-Amz-Signature=secret',
        'https://example.com/blob?sv=1&sig=secret',
        'https://example.com/file?Policy=p&Signature=s&Key-Pair-Id=k',
    ])('拒绝不可外发或签名 URL：%s', value => {
        expect(() => canonicalizePublicWebUrl(value)).toThrow(WebAccessPolicyError)
    })

    it('拒绝自由文本中内嵌的签名或凭据 URL，放行普通 URL', () => {
        expect(() => assertNoForbiddenWebUrlInText('看这个 https://example.com/file?X-Amz-Signature=secret 链接')).toThrow(
            WebAccessPolicyError
        )
        expect(() => assertNoForbiddenWebUrlInText('更多信息见 https://example.com/docs?q=react 与文档')).not.toThrow()
    })
})
