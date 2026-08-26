import type { AgentConversation, AgentImageReference } from '../../types';

const REF_TAG_RE = /<ref\b[^>]*\bid=(["'])([^"']+)\1[^>]*\/?>/g;
const ROUND_IMAGE_MENTION_RE = /@第(\d+)轮图(\d+)/g;

export const getRoundGeneratedReferenceId = (roundIndex: number, imageIndex: number) =>
  `round-${roundIndex}-image-${imageIndex + 1}`;

export const getRoundInputReferenceId = (roundIndex: number, imageIndex: number) =>
  `round-${roundIndex}-reference-${imageIndex + 1}`;

export const getReferenceTag = (id: string) => `<ref id="${id}" />`;

export function extractReferenceIds(text: string) {
  return Array.from(text.matchAll(REF_TAG_RE), (match) => match[2]).filter(Boolean);
}

export function getAvailableReferences(conversation: AgentConversation | null) {
  if (!conversation) return [];

  const references: AgentImageReference[] = [];
  for (const round of conversation.rounds) {
    round.inputImageIds.forEach((imageId, index) => {
      references.push({
        id: getRoundInputReferenceId(round.index, index),
        assetId: imageId,
        label: `第${round.index}轮参考图${index + 1}`,
        source: 'upload',
        roundId: round.id,
      });
    });

    round.outputImageIds.forEach((imageId, index) => {
      references.push({
        id: getRoundGeneratedReferenceId(round.index, index),
        assetId: imageId,
        label: `第${round.index}轮图${index + 1}`,
        source: 'generated',
        roundId: round.id,
      });
    });
  }

  return references;
}

export function replaceAgentPromptImageReferencesForApi(
  prompt: string,
  conversation: AgentConversation | null,
) {
  if (!conversation) return prompt;

  const refs = getAvailableReferences(conversation);
  return prompt.replace(ROUND_IMAGE_MENTION_RE, (_, roundText, imageText) => {
    const roundIndex = Number(roundText);
    const imageIndex = Number(imageText) - 1;
    const match = refs.find((item) => item.id === getRoundGeneratedReferenceId(roundIndex, imageIndex));
    return match ? getReferenceTag(match.id) : '';
  });
}

export function resolveReferenceIdsToAssetIds(referenceIds: string[], conversation: AgentConversation | null) {
  if (!conversation || referenceIds.length === 0) return [];
  const refs = getAvailableReferences(conversation);
  return referenceIds
    .map((id) => refs.find((item) => item.id === id)?.assetId)
    .filter((id): id is string => Boolean(id));
}
