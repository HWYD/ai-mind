// 静态资源类型声明，tsc --noEmit 需要这些声明来识别 Next.js 打包层处理的模块导入。
declare module '*.png' {
    const value: string
    export default value
}

declare module '*.jpg' {
    const value: string
    export default value
}

declare module '*.svg' {
    import type { FC, SVGProps } from 'react'
    export const ReactComponent: FC<SVGProps<SVGSVGElement>>
    const value: unknown
    export default value
}
