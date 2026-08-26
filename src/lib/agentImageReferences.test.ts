import { describe, expect, it } from 'vitest';
import { extractReferenceIds, replaceAgentPromptImageReferencesForApi, resolveReferenceIdsToAssetIds } from './agentImageReferences';
import type { AgentConversation } from '../../types';

const conversation: AgentConversation = {
  id: 'c1',
  title: 'test',
  createdAt: 1,
  updatedAt: 1,
  rounds: [
    {
      id: 'r1',
      index: 1,
      prompt: 'first',
      status: 'done',
      createdAt: 1,
      finishedAt: 2,
      error: null,
      inputImageIds: ['input-1'],
      outputImageIds: ['output-1'],
    },
  ],
  messages: [],
};

describe('agentImageReferences', () => {
  it('extracts ref ids from prompt', () => {
    expect(extractReferenceIds('参考 <ref id="round-1-image-1" /> 和 <ref id="round-1-reference-1" />')).toEqual([
      'round-1-image-1',
      'round-1-reference-1',
    ]);
  });

  it('replaces round image mentions with ref tags', () => {
    expect(replaceAgentPromptImageReferencesForApi('继续参考 @第1轮图1 生成', conversation)).toContain(
      '<ref id="round-1-image-1" />',
    );
  });

  it('resolves ref ids to stored asset ids', () => {
    expect(resolveReferenceIdsToAssetIds(['round-1-image-1', 'round-1-reference-1'], conversation)).toEqual([
      'output-1',
      'input-1',
    ]);
  });
});
