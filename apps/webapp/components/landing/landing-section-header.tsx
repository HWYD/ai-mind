type LandingSectionHeaderProps = {
    title: string
    description: string
}

export function LandingSectionHeader({ title, description }: LandingSectionHeaderProps) {
    return (
        <div className="mx-auto max-w-3xl text-center">
            <div className="flex min-w-0 items-center justify-center gap-5 sm:gap-6">
                <span className="h-px w-8 shrink-0 bg-[var(--landing-brand-border)] sm:w-12" aria-hidden="true" />
                <h2 className="min-w-0 break-words text-3xl font-semibold tracking-tight text-[#0F172A] lg:text-4xl">{title}</h2>
                <span className="h-px w-8 shrink-0 bg-[var(--landing-brand-border)] sm:w-12" aria-hidden="true" />
            </div>

            <p className="mt-4 break-words text-lg leading-8 text-muted-foreground">{description}</p>
        </div>
    )
}
