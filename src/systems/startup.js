export function createStartupScene({ recovery, loadAssets, buildScene } = {}) {
  if (!recovery || typeof recovery.reportAssetFailure !== 'function') {
    throw new TypeError('createStartupScene requires recovery.reportAssetFailure()');
  }
  if (typeof loadAssets !== 'function') {
    throw new TypeError('createStartupScene requires loadAssets()');
  }
  if (typeof buildScene !== 'function') {
    throw new TypeError('createStartupScene requires buildScene()');
  }

  const build = async (state) => {
    await loadAssets();
    return buildScene(state);
  };

  return {
    build,
    async start(state) {
      try {
        return await build(state);
      } catch (error) {
        if (typeof error?.assetId === 'string' && error.assetId.length > 0) {
          recovery.reportAssetFailure(error.assetId);
          return null;
        }
        throw error;
      }
    },
  };
}

export async function loadLocalAsset(assetId, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') {
    const error = new Error(`Unable to load ${assetId}`);
    error.assetId = assetId;
    throw error;
  }
  try {
    const response = await fetchImpl(assetId, { cache: 'no-store' });
    if (!response?.ok) throw new Error(`Unable to load ${assetId}`);
    return response;
  } catch (cause) {
    const error = new Error(`Unable to load ${assetId}`, { cause });
    error.assetId = assetId;
    throw error;
  }
}
