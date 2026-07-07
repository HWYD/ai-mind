import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { z, ZodError } from 'zod'

import { createChatModel, getModelProviderConfig, logProviderError, resolveModelSelection } from '@/lib/ai/model-provider'

import {
    userMemoryActionSchema,
    type UserMemoryCandidate,
    type UserMemoryExtractionJob,
    userMemoryIdentitySchema,
    userMemorySourceSignalSchema,
    userMemoryStabilitySchema,
    userMemoryTypeSchema,
} from './state-schema'

export const USER_MEMORY_EXTRACTION_MODEL_ID = 'deepseek/deepseek-v4-pro'

export const USER_MEMORY_EXTRACTION_PROMPT = [
    'Return strict JSON that matches this schema: {"candidates": Candidate[]}.',
    'Candidate fields: action, type, text, tags, confidence, stability, identity, sourceSignal, reason, conflictSignal.',
    '你是长期用户记忆候选提取器，服务于通用长期协作聊天场景，不局限于 AI Mind 项目本身。',
    '目标：提取未来跨会话仍值得复用的长期用户记忆；没有就返回 {"candidates":[]}。',
    '事实来源优先级：latest user text > safe pinned decisions / safe summary > assistant final text。',
    'latest user text 是第一事实源；safe pinned decisions 和 safe summary 只能辅助消歧；assistant final text 只能辅助理解，不得单独生成新 memory。',
    '不要仅凭 assistant final text、safe summary 或 safe pinned decisions 复述出一条看似合理的新长期记忆。',
    '优先识别用户明确要求“记住 / 以后 / 后续 / 都沿用”的长期记忆意图。',
    '优先提取：长期偏好、沟通偏好、工作流偏好、长期指令、反复约束、稳定用户背景、稳定项目上下文、风险控制偏好。',
    '直接返回空数组：一次性问答、当前任务进度、临时计划、临时情绪、短期状态、猜测、未确认信息、敏感个人信息、raw runtime/provider/tool/resource 数据。',
    '如果内容不是 stable memory，就不要输出 candidate；默认返回空数组，比输出 temporary/speculative 更好。',
    '只有在你必须显式表达“这条候选不应入库”时，才使用 stability=temporary 或 speculative；正常情况下这两类直接不输出。',
    '同一句话里出现多个独立长期事实时，拆成多条 candidate；同一条长期指令不要为了语气、原因或补充解释而过度拆分。',
    'Candidate.text 必须是第三人称、稳定、简短、可直接持久化的中文事实句。',
    'type 选择规则：user_preference=长期可复用的喜欢/不喜欢/避免；communication_preference=回答或解释风格偏好；workflow_preference=做事方式或交付偏好；standing_instruction=长期固定执行指令；recurring_constraint=长期约束或禁止项；stable_user_context=稳定、非敏感、对后续协作有帮助的用户背景；project_context=长期反复出现的项目/产品/主题上下文；risk_preference=风险边界或保守偏好。',
    'Candidate.identity 是 stable key v2 的结构化 identity：必须至少给出 subject；需要时可补 facet；user_preference 必须给 polarity=prefer 或 avoid。',
    'identity 规则：user_preference 用 subject=核心对象、polarity=prefer|avoid；communication_preference 用 subject=沟通场景、facet=表达方式；workflow_preference 用 subject=任务对象、facet=执行偏好；standing_instruction 用 subject=任务场景、facet=固定规则；recurring_constraint 用 subject=约束对象、facet=限制规则；stable_user_context / project_context / risk_preference 用稳定主题做 subject，必要时再补 facet。',
    'identity.subject 必须稳定、简短、可复用；不要把整句、原因说明、语气词或“用户 / 记住 / 以后”这类虚词塞进 subject。',
    'Candidate.tags 是检索锚点，不是摘要。默认每条输出 2-4 个 tags；stable_user_context 的职业/背景/技术栈信息可输出 3-6 个 tags；至少 1 个核心对象词，至少 1 个未来用户查询里可能直接出现的词。',
    '优先使用短而有区分度、可直接重叠的 tags，例如“桃子 / 水果 / 吃”、“技术解释 / 大白话”、“Codex提示词 / 中文 / 复制”、“Windows / PowerShell”。',
    'stable_user_context 如果涉及职业、工作背景、经验或技术栈，tags 必须包含具体事实词和通用查询锚点，例如“工作 / 职业 / 经验 / 技术栈 / 前端工程师 / Vue / React”。',
    '不要输出低信号 tags，例如单独的“喜欢”、“用户”、“记住”、“要求”、“规则”。',
    'confidence 标尺：0.9-1.0=用户明确要求长期记住或沿用；0.8-0.89=稳定且复用价值高；0.7-0.79=边界较强但证据有限；低于 0.7 不要输出。',
    'sourceSignal 只允许使用：explicit_memory_intent、implicit_stable_preference、standing_instruction_signal、forget_or_negation。',
    '当用户明确否定或更新旧长期记忆时，可输出 action=suppress 并设置 conflictSignal=true；只有当你能明确写出被 suppress 的旧 memory identity 时才输出 suppress，如果目标模糊，不要猜，直接返回空数组。',
    '不要输出完整 transcript、raw tool result、raw resource content、GraphState、RuntimeArtifact、workflow progress、raw prompt、provider response、API key、cookie 或 provider config。',
    '示例输入：请记住我喜欢吃桃子，不喜欢吃香菜。',
    '示例输出：{"candidates":[{"action":"add","type":"user_preference","text":"用户喜欢吃桃子。","tags":["桃子","水果","吃"],"confidence":0.95,"stability":"stable","identity":{"subject":"桃子","polarity":"prefer"},"sourceSignal":"explicit_memory_intent","reason":"用户明确要求记住用户偏好"},{"action":"add","type":"user_preference","text":"用户不喜欢吃香菜。","tags":["香菜","蔬菜","吃"],"confidence":0.95,"stability":"stable","identity":{"subject":"香菜","polarity":"avoid"},"sourceSignal":"explicit_memory_intent","reason":"用户明确要求记住用户偏好"}]}',
    '示例输入：以后解释技术问题，先用大白话，再补充专业说法。',
    '示例输出：{"candidates":[{"action":"add","type":"communication_preference","text":"用户喜欢技术解释先用大白话，再补充专业说法。","tags":["技术解释","大白话","专业说明"],"confidence":0.93,"stability":"stable","identity":{"subject":"技术解释","facet":"先大白话再专业"},"sourceSignal":"explicit_memory_intent","reason":"用户明确给出长期回答风格偏好"}]}',
    '示例输入：以后帮我整理提示词时，尽量用中文，并且能直接复制。',
    '示例输出：{"candidates":[{"action":"add","type":"workflow_preference","text":"用户希望整理提示词时尽量使用中文并可直接复制。","tags":["提示词","中文","复制"],"confidence":0.92,"stability":"stable","identity":{"subject":"提示词整理","facet":"中文可复制"},"sourceSignal":"explicit_memory_intent","reason":"用户明确给出长期工作流偏好"}]}',
    '示例输入：以后评估需求时，先判断是不是 Spec 阶段，不要直接进入实现细节。',
    '示例输出：{"candidates":[{"action":"add","type":"standing_instruction","text":"用户要求评估需求时先判断是否处于 Spec 阶段。","tags":["需求评估","Spec阶段","先判断"],"confidence":0.91,"stability":"stable","identity":{"subject":"需求评估","facet":"先判断Spec阶段"},"sourceSignal":"standing_instruction_signal","reason":"用户明确给出长期执行指令"}]}',
    '示例输入：以后不要凭空发明不存在的项目功能。',
    '示例输出：{"candidates":[{"action":"add","type":"recurring_constraint","text":"用户要求不要凭空发明不存在的项目功能。","tags":["项目功能","不要发明","约束"],"confidence":0.9,"stability":"stable","identity":{"subject":"项目功能","facet":"不要凭空发明"},"sourceSignal":"standing_instruction_signal","reason":"用户明确给出长期约束"}]}',
    '示例输入：请记住，我是一名前端工程师，主要使用 Windows 和 PowerShell。',
    '示例输出：{"candidates":[{"action":"add","type":"stable_user_context","text":"用户是一名前端工程师，主要使用 Windows 和 PowerShell。","tags":["前端工程师","Windows","PowerShell"],"confidence":0.9,"stability":"stable","identity":{"subject":"前端工程师"},"sourceSignal":"explicit_memory_intent","reason":"用户明确要求记住稳定背景信息"}]}',
    '示例输入：请记住，我是一名有五年工作经验的前端工程师，主要使用 Vue 和 React。',
    '示例输出：{"candidates":[{"action":"add","type":"stable_user_context","text":"用户是一名有五年工作经验的前端工程师，主要使用 Vue 和 React。","tags":["工作","前端工程师","五年经验","技术栈","Vue","React"],"confidence":0.92,"stability":"stable","identity":{"subject":"前端工程师","facet":"五年经验 Vue React"},"sourceSignal":"explicit_memory_intent","reason":"用户明确要求记住稳定职业背景"}]}',
    '示例输入：请记住，我最近一直在做个人知识库产品的版本规划。',
    '示例输出：{"candidates":[{"action":"add","type":"project_context","text":"用户正在持续围绕个人知识库产品做版本规划。","tags":["个人知识库","产品规划","版本规划"],"confidence":0.88,"stability":"stable","identity":{"subject":"个人知识库产品","facet":"版本规划"},"sourceSignal":"explicit_memory_intent","reason":"用户明确要求记住稳定项目上下文"}]}',
    '示例输入：长期记忆不要保存完整聊天历史。',
    '示例输出：{"candidates":[{"action":"add","type":"risk_preference","text":"用户要求长期记忆不要保存完整聊天历史。","tags":["长期记忆","聊天历史","不要保存"],"confidence":0.92,"stability":"stable","identity":{"subject":"长期记忆","facet":"不要保存完整聊天历史"},"sourceSignal":"explicit_memory_intent","reason":"用户明确给出风险控制边界"}]}',
    '示例输入：我现在不太喜欢桃子了，以后别按这个推荐。',
    '示例输出：{"candidates":[{"action":"suppress","type":"user_preference","text":"用户喜欢吃桃子。","tags":["桃子","水果","吃"],"confidence":0.9,"stability":"stable","identity":{"subject":"桃子","polarity":"prefer"},"sourceSignal":"forget_or_negation","reason":"用户明确否定旧偏好","conflictSignal":true}]}',
].join('\n')

// LLM 输出的候选记忆结构。模型只做"建议"，最终由 validation.ts 程序化决定是否入库。
const extractedUserMemoryCandidateSchema = z
    .object({
        // 操作类型：add=新增记忆，suppress=压制旧记忆（用户说"不要了""改掉"时）
        action: userMemoryActionSchema,
        // 模型自评置信度 0-1。0.9+=明确要求记住，0.8-0.89=稳定复用价值高，0.7-0.79=边界较强。低于 0.7 模型不应输出，validation 也会拒绝。
        confidence: z.number().min(0).max(1),
        // 冲突标记：用户明确否定/更新旧记忆时为 true，配合 action=suppress 使用
        conflictSignal: z.boolean().optional(),
        // stable key v2 的结构化 identity。subject 必填（稳定对象），facet 选填（细分面），user_preference 还需 polarity=prefer|avoid
        identity: userMemoryIdentitySchema,
        // 模型提取这条候选的原因说明，最长 200 字，辅助调试和理解
        reason: z.string().trim().min(1).max(200).optional(),
        // 信号来源：explicit_memory_intent（用户说"记住"）、implicit_stable_preference（隐式稳定偏好）、standing_instruction_signal（长期指令信号）、forget_or_negation（否定旧记忆）
        sourceSignal: userMemorySourceSignalSchema.optional(),
        // 稳定性标记。stable=可持久化，temporary=临时不应入库，speculative=推测不应入库。validation 只放行 stable，temporary/speculative 直接拒绝。模型默认应输出空数组而非 temporary/speculative。
        stability: userMemoryStabilitySchema,
        // 检索锚点标签，不是摘要。每条 2-4 个，stable_user_context 可 3-6 个。至少一个核心对象词、一个用户查询里可能出现的词。过滤掉"喜欢""用户""记住"等低信号词。
        tags: z.array(z.string()).max(8).default([]),
        // 记忆正文，第三人称、稳定、简短的中文事实句，最长 300 字
        text: z.string().trim().min(1).max(300),
        // 记忆类型，共 8 种：user_preference / communication_preference / workflow_preference / standing_instruction / recurring_constraint / stable_user_context / project_context / risk_preference
        type: userMemoryTypeSchema,
    })
    .strict()

export const userMemoryExtractorOutputSchema = z
    .object({
        candidates: z.array(extractedUserMemoryCandidateSchema).max(5).default([]),
    })
    .strict()

function formatPinnedDecisions(pinnedDecisions: string[] | undefined): string {
    if (!pinnedDecisions || pinnedDecisions.length === 0) {
        return '无'
    }

    return pinnedDecisions.map((decision, index) => `${index + 1}. ${decision}`).join('\n')
}

function buildExtractionMessages(input: UserMemoryExtractionJob) {
    return [
        new SystemMessage(USER_MEMORY_EXTRACTION_PROMPT),
        new HumanMessage(
            [
                `path: ${input.path}`,
                '',
                'latest user text:',
                input.latestUserText,
                '',
                'assistant final text:',
                input.assistantFinalText,
                '',
                'safe summary:',
                input.safeShortTermContext?.summary?.trim() || '无',
                '',
                'safe pinned decisions:',
                formatPinnedDecisions(input.safeShortTermContext?.pinnedDecisions),
            ].join('\n')
        ),
    ]
}

export async function extractUserMemoryCandidates(input: UserMemoryExtractionJob): Promise<UserMemoryCandidate[]> {
    const config = getModelProviderConfig()
    const resolvedModelSelection = resolveModelSelection({
        modelId: USER_MEMORY_EXTRACTION_MODEL_ID,
        routeType: 'chat',
    })
    const modelHandle = createChatModel({
        config,
        enableReasoning: false,
        resolvedModelSelection,
        streaming: false,
        temperature: 0,
    })
    const runnable = modelHandle.model.withStructuredOutput(userMemoryExtractorOutputSchema, {
        name: 'ai_mind_user_memory_extractor',
    })

    try {
        const output = await runnable.invoke(buildExtractionMessages(input))

        return output.candidates.map(candidate => ({
            ...candidate,
            source: 'eligible_completed_turn',
            sourceConversationId: input.sourceConversationId,
            sourceText: input.latestUserText,
            tags: candidate.tags ?? [],
        }))
    } catch (error) {
        if (!(error instanceof ZodError)) {
            logProviderError(error)
        }

        throw error
    }
}
