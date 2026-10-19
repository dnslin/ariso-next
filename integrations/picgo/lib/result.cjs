/** @param {unknown} value @returns {value is Record<string, unknown>} */
const object = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
/** @param {unknown} value @returns {value is string} */
const text = (value) => typeof value === 'string' && value.length > 0;
const kinds = ['original', 'compressed', 'thumbnail', 'watermark'];

/** @param {unknown} value @returns {value is {code: string, stage: string, message: string}} */
function diagnostic(value) {
  return (
    object(value) &&
    text(value.code) &&
    text(value.stage) &&
    text(value.message)
  );
}

/** Only consume the public HTTP contract; no imports from the Ariso server. */
/** @param {unknown} response @param {string} selected */
function readResult(response, selected) {
  if (!object(response) || typeof response.status !== 'number')
    throw new Error(
      '未取得有效 Ariso 上传结果，结果未确认；请先到图库核对，不要直接重传',
    );
  const { status, data } = response;
  if (status !== 201) {
    if (
      object(data) &&
      diagnostic(data.error) &&
      text(data.requestId) &&
      (data.imageId === null || text(data.imageId))
    ) {
      const asset = data.imageId
        ? `图片 ID：${data.imageId}；已接收，请到图库核对`
        : data.status === 'not_created'
          ? '尚未创建图片'
          : '结果未确认，请到图库核对';
      throw new Error(
        `HTTP ${status} / ${data.error.code} / ${data.error.stage}：${data.error.message}；${asset}；请求 ID：${data.requestId}`,
      );
    }
    throw new Error(
      `HTTP ${status}：未取得有效 Ariso 上传结果，结果未确认；请先到图库核对，不要直接重传`,
    );
  }
  if (
    !object(data) ||
    data.status !== 'ready' ||
    !text(data.imageId) ||
    !text(data.requestId) ||
    !object(data.versions) ||
    !object(data.defaultResolution) ||
    !object(data.processing) ||
    data.processing.status !== 'succeeded' ||
    !Array.isArray(data.processing.warnings) ||
    !data.processing.warnings.every(diagnostic)
  )
    throw new Error(
      '未取得有效 Ariso 上传结果，结果未确认；请先到图库核对，不要直接重传',
    );
  const kind = selected === 'site' ? data.actualVersion : selected;
  const version = typeof kind === 'string' ? data.versions[kind] : null;
  if (
    (selected === 'site' && data.defaultResolution.available !== true) ||
    typeof kind !== 'string' ||
    !kinds.includes(kind) ||
    !object(version) ||
    !text(version.url) ||
    !text(version.mime)
  )
    throw new Error(
      `图片已保存，但无法生成所选版本外链；图片 ID：${data.imageId}；版本：${selected}；已有版本：${Object.keys(data.versions).join(', ')}；请求 ID：${data.requestId}。请到图库核对，不要重新上传`,
    );
  let url;
  try {
    url = new URL(version.url);
  } catch {
    throw new Error(
      `图片已保存，但版本地址无效；图片 ID：${data.imageId}；请求 ID：${data.requestId}`,
    );
  }
  if (!['http:', 'https:'].includes(url.protocol))
    throw new Error(
      `图片已保存，但版本地址不是 http/https；图片 ID：${data.imageId}；请求 ID：${data.requestId}`,
    );
  return {
    imageId: data.imageId,
    requestId: data.requestId,
    url: version.url,
    mime: version.mime,
    warnings: /** @type {{code: string, stage: string, message: string}[]} */ (
      data.processing.warnings
    ),
  };
}

module.exports = { readResult };
