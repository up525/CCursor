import type { ProviderModel, ThinkingLevel } from '../server/data/defaults'

export interface RemoteCodexModel {
  id?: string
  model?: string
  displayName?: string
  description?: string
  defaultReasoningEffort?: string
  supportedReasoningEfforts?: Array<{ reasoningEffort?: string, description?: string }>
  upgrade?: string
}

const VALID_REASONING_EFFORTS = new Set<ThinkingLevel>([
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
  'ultra',
])

function reasoningEfforts(remoteModel: RemoteCodexModel): ThinkingLevel[] {
  if (!Array.isArray(remoteModel.supportedReasoningEfforts))
    return []
  const values = remoteModel.supportedReasoningEfforts.flatMap((item) => {
    const value = String(item?.reasoningEffort || '').trim() as ThinkingLevel
    return VALID_REASONING_EFFORTS.has(value) ? [value] : []
  })
  return [...new Set(values)]
}

export function remoteCodexModelLabel(remoteModel: RemoteCodexModel): string {
  const base = remoteModel.displayName || remoteModel.id || '(unknown model)'
  const efforts = reasoningEfforts(remoteModel)
  return efforts.length > 0 ? `${base} · ${efforts.join(' / ')}` : base
}

/** Convert one official model/list row into a persisted Cursor++ model entry. */
export function mergeCodexCatalogModel(
  remoteModel: RemoteCodexModel,
  existing?: ProviderModel,
): ProviderModel | null {
  const apiModel = String(remoteModel.model || remoteModel.id || '').trim()
  if (!apiModel)
    return null

  const efforts = reasoningEfforts(remoteModel)
  const requestedDefault = String(remoteModel.defaultReasoningEffort || '').trim() as ThinkingLevel
  const thinkingLevel = existing?.thinkingLevel && efforts.includes(existing.thinkingLevel)
    ? existing.thinkingLevel
    : efforts.includes(requestedDefault)
      ? requestedDefault
      : efforts[0]
  const tooltipParts = [
    String(remoteModel.description || '').trim(),
    remoteModel.upgrade ? `Recommended upgrade: ${remoteModel.upgrade}` : '',
    'Synced from the official Codex App Server for the current ChatGPT login.',
  ].filter(Boolean)
  const safeId = apiModel.replace(/[^\w.-]+/g, '-')
  const parameters = { ...(existing?.parameters || {}) }
  if (efforts.length > 0)
    parameters.reasoning = efforts
  else
    delete parameters.reasoning

  const model: ProviderModel = {
    ...existing,
    id: existing?.id || `openai-codex-${safeId}`,
    apiModel,
    displayName: String(remoteModel.displayName || remoteModel.id || apiModel),
    thinking: efforts.length > 0,
    ...(thinkingLevel ? { thinkingLevel } : {}),
    contextTokenLimit: existing?.contextTokenLimit ?? 200000,
    maxOutputTokens: existing?.maxOutputTokens ?? 8192,
    supportsAgent: true,
    // The current adapter sends one textual `codex exec` turn and cannot
    // forward Cursor's in-memory image bytes yet.
    supportsImages: false,
    supportsCmdK: true,
    supportsSandboxing: true,
    defaultOn: existing?.defaultOn ?? true,
    tooltipMarkdown: tooltipParts.join('\n\n'),
    ...(Object.keys(parameters).length > 0 ? { parameters } : {}),
  }
  if (!thinkingLevel)
    delete model.thinkingLevel
  if (Object.keys(parameters).length === 0)
    delete model.parameters
  return model
}
