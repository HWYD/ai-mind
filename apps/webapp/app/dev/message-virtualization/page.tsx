import { notFound } from 'next/navigation'

import DevMessageVirtualizationPreparation from './fixture-preparation-client'

export default function DevMessageVirtualizationPage() {
    if (process.env.NODE_ENV !== 'development') {
        notFound()
    }

    return <DevMessageVirtualizationPreparation />
}
