import { ScoutError } from '@vsix-scout/core';

export interface WebErrorMessage {
  readonly title: string;
  readonly detail: string;
  readonly retryable: boolean;
}

export function webErrorMessage(error: unknown): WebErrorMessage {
  if (!(error instanceof ScoutError)) {
    return {
      title: '发生了未预期的错误',
      detail: '请刷新页面后重试。若问题持续存在，请在 GitHub 提交问题。',
      retryable: true,
    };
  }

  const resource = error.details?.resource;
  const status = error.details?.status;

  if (error.code === 'INVALID_INPUT') {
    return {
      title: '输入无效',
      detail:
        '请输入完整的 publisher.extension 或官方 Marketplace URL，并填写完整 VS Code 版本号。',
      retryable: false,
    };
  }
  if (error.code === 'EXTENSION_NOT_FOUND') {
    return {
      title: '没有找到这个扩展',
      detail:
        '请检查 publisher 和 extension 名称是否准确。第一版不支持关键词搜索。',
      retryable: false,
    };
  }
  if (error.code === 'NO_COMPATIBLE_VERSION') {
    return {
      title: '没有兼容版本',
      detail:
        'Marketplace 历史版本中没有同时匹配当前 VS Code、平台和 channel 的版本。',
      retryable: false,
    };
  }
  if (error.code === 'UNSAFE_RESOURCE_URL') {
    return {
      title: '下载地址未通过安全校验',
      detail:
        'Marketplace 返回了 allowlist 之外的资源地址，因此页面已阻止使用该链接。',
      retryable: false,
    };
  }
  if (status === 429) {
    return {
      title: 'Marketplace 请求过于频繁',
      detail: 'Microsoft Marketplace 返回了 429。请稍后重试。',
      retryable: true,
    };
  }
  if (resource === 'manifest') {
    return {
      title: 'Manifest fallback 失败',
      detail:
        'Marketplace metadata 缺少 engine，浏览器读取官方 manifest 时失败。请稍后重试。',
      retryable: error.retryable,
    };
  }
  if (error.code === 'UPSTREAM_INVALID_RESPONSE') {
    return {
      title: 'Marketplace 响应格式异常',
      detail:
        '上游数据未通过 schema 或响应大小校验。页面没有使用原始 payload。',
      retryable: false,
    };
  }
  if (error.code === 'UPSTREAM_UNAVAILABLE') {
    return {
      title: '无法连接 Marketplace',
      detail:
        '请求超时或网络异常。请确认当前网络可以访问 Visual Studio Marketplace。',
      retryable: true,
    };
  }

  return {
    title: '查询失败',
    detail: '页面无法完成这次解析，请稍后重试。',
    retryable: error.retryable,
  };
}
