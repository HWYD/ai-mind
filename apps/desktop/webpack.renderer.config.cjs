/* global module */

/** @type {import('webpack').Configuration} */
module.exports = {
    // 本地 Chrome/recovery 受严格 CSP 保护，开发构建不能使用 Forge 默认的 eval-source-map。
    devtool: 'source-map',
    module: {
        rules: [
            {
                exclude: /node_modules/,
                test: /\.ts$/,
                use: {
                    loader: 'ts-loader',
                    options: {
                        transpileOnly: true,
                    },
                },
            },
            {
                generator: {
                    filename: 'chrome/styles.css',
                },
                include: /chrome-renderer/,
                test: /\.css$/,
                type: 'asset/resource',
            },
            {
                generator: {
                    filename: 'recovery/styles.css',
                },
                include: /recovery-renderer/,
                test: /\.css$/,
                type: 'asset/resource',
            },
        ],
    },
    resolve: {
        extensions: ['.js', '.ts'],
    },
    target: 'web',
}
