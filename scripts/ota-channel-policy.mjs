export function extractChannelArgument(args) {
  let channel = null;
  const publishArgs = [];
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === '--branch' || value.startsWith('--branch=')) {
      throw new Error(
        'OTA 후보 브랜치는 릴리스 파이프라인이 자동으로 지정해요.',
      );
    }
    if (value === '--channel') {
      channel = args[index + 1];
      index += 1;
      continue;
    }
    if (value.startsWith('--channel=')) {
      channel = value.slice('--channel='.length);
      continue;
    }
    publishArgs.push(value);
  }
  if (!['stable', 'canary'].includes(channel)) {
    throw new Error('OTA 승격 채널은 stable 또는 canary여야 해요.');
  }
  return { channel, publishArgs };
}

export function readChannelBranch(value) {
  const page = value?.currentPage ?? value;
  if (!page || !Array.isArray(page.updateBranches)) {
    throw new Error('EAS 채널이 가리키는 브랜치를 확인하지 못했어요.');
  }
  let mappedBranchId = null;
  try {
    const mapping = JSON.parse(page.branchMapping);
    const active = mapping.data?.filter(
      (entry) => entry.branchMappingLogic === 'true',
    );
    if (active?.length === 1) mappedBranchId = active[0].branchId;
  } catch {
    // 오래된 EAS 응답은 updateBranches 한 개로도 안전하게 판별해요.
  }
  const branches = mappedBranchId
    ? page.updateBranches.filter((branch) => branch.id === mappedBranchId)
    : page.updateBranches;
  if (branches.length !== 1 || typeof branches[0].name !== 'string') {
    throw new Error('EAS 채널의 단일 운영 브랜치를 확인하지 못했어요.');
  }
  return branches[0].name;
}
