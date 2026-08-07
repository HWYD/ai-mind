/* global module */

/** @type {import('webpack').Configuration} */
module.exports = {
    entry: './src/main/main.ts',
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
        ],
    },
    resolve: {
        extensions: ['.js', '.ts'],
    },
    target: 'electron-main',
}
