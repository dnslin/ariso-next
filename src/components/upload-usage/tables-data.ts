export const parametersTable = {
  label: '请求参数表',
  headers: ['参数', '必填', '省略时', '说明'],
  rows: [
    [
      'file',
      '是',
      '—',
      '恰好一个图片文件，不支持 URL。大小受当前站点上限限制。',
    ],
    [
      'storageId',
      '否',
      '当前默认存储',
      '存储 ID。空串无效；没有默认存储时需要显式提供。',
    ],
    [
      'albumId',
      '否',
      '不加入相册',
      '重复同名字段传多个 ID，自动去重；不使用逗号串或 albumId[]。',
    ],
    [
      'tag',
      '否',
      '不添加标签',
      '重复同名字段传多个名称，匹配或创建；逗号属于名称。每个名称 1–50 个 Unicode 码点，不含换行或控制字符。',
    ],
    [
      'visibility',
      '否',
      '提交时默认可见性',
      'public 或 private。私有链接需要所有者 Cookie，上传 Token 不能读取。',
    ],
  ],
};

export const responseTable = {
  label: '响应字段表',
  headers: ['字段', '类型 / 出现条件', '含义'],
  rows: [
    [
      'imageId',
      'string / null',
      '图片 ID。尚未创建时为 null；接收后的错误保留真实 ID。',
    ],
    [
      'status',
      'string',
      '本次请求的结果状态。成功为 ready；未创建为 not_created，错误也可为 pending、processing、ready、failed 或 unavailable。',
    ],
    [
      'currentImageStatus',
      'string，可选',
      '仅在当前图片状态与本次结果不同等情况出现。',
    ],
    ['url', 'string，成功时', '默认版本链接；私有图片需要所有者 Cookie。'],
    [
      'actualVersion',
      'string / null，成功时',
      '默认链接实际采用的版本：original、compressed、thumbnail、watermark，或 null。',
    ],
    [
      'defaultResolution',
      'object，成功时',
      'available 表示默认版本是否可用；不可用时 code 为 VERSION_UNAVAILABLE，否则为 null。',
    ],
    [
      'versions',
      'object，成功时',
      '只列已保存的版本；每项包含 url 与 mime，不返回尚未生成的版本。',
    ],
    ['processing.status', 'string，成功时', '本次处理成功，值为 succeeded。'],
    [
      'processing.versions',
      'object，成功时',
      '各版本的 status 与可空 reason；状态为 succeeded、not_applicable、disabled 或 not_generated。',
    ],
    [
      'processing.warnings',
      'array，成功时',
      '处理警告列表，每项包含 code、stage、message。',
    ],
    [
      'error',
      'object，错误时',
      '错误 code、发生阶段 stage 和可读信息 message。',
    ],
    ['requestId', 'string', '请求诊断 ID，成功与错误均返回。'],
  ],
};

export const statusTable = {
  label: 'HTTP 状态表',
  headers: ['状态码', '结果', '说明'],
  rows: [
    [
      '201',
      '本次处理完成',
      '返回真实保存版本。actualVersion 为 null 不改变成功结果。',
    ],
    [
      '400',
      '输入无效',
      '未知字段、重复单值字段、缺失/额外/空文件，或截断/取消的接收流。',
    ],
    ['401', '认证失败', 'Token 缺失、无效、停用或过期。'],
    ['408', '接收超时', '120 秒无进度，或超过 1800 秒接收预算。'],
    ['409', '状态冲突', '存储/目标冲突，或已接收图片、任务不可用。'],
    ['413', '文件过大', '超过接收开始时固定的当前上限。'],
    ['415', '格式不支持', '不是支持的图片，或无法识别内容。'],
    ['422', '处理失败', '保留真实图片 ID、原图和已保存版本。'],
    ['500', '内部错误', '数据库、接收/发布等未分类故障。'],
    ['502', '存储依赖故障', '对象存储服务请求失败。'],
    ['503', '处理不可用', '处理工具不可用，或服务正在停止。'],
    [
      '504',
      '等待/依赖超时',
      '等待本次任务超过 900 秒，或存储/工具超时。等待任务结果超时不会取消已接收任务。',
    ],
    ['507', '空间不足', '暂存、存储或处理所需磁盘空间不足。'],
  ],
};
