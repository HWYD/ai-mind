export const seedreamImageProviderConfig = {
    endpoint: 'https://ark.cn-beijing.volces.com/api/plan/v3/images/generations',
    model: 'doubao-seedream-5.0-lite',
    resultHosts: ['ark-acg-cn-beijing.tos-cn-beijing.volces.com'],
    sizeByAspectRatio: {
        landscape: '2K',
        portrait: '2K',
        square: '2K',
    },
} as const
