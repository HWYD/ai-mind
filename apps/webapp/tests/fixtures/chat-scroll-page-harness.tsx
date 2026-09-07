import '../../app/globals.css'

import { createRoot } from 'react-dom/client'

import InstantMindPage from '@/components/instamind/instantmind-page'
import { message } from '@/components/ui/message'
import { Messages } from '@/components/ui/messages'
import { TooltipProvider } from '@/components/ui/tooltip'

Object.assign(window, {
    addFixtureMessage: message.add,
})

createRoot(document.getElementById('root')!).render(
    <TooltipProvider>
        <InstantMindPage
            initialChatModelsState={{
                defaultModelId: 'deepseek/deepseek-chat',
                modelError: null,
                models: [{ id: 'deepseek/deepseek-chat', label: 'DeepSeek', provider: 'deepseek', family: 'deepseek' }],
            }}
        />
        <Messages />
    </TooltipProvider>
)
