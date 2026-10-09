import { z } from 'zod';
import {
  publicUploadErrorSchema,
  publicUploadInputSchema,
  publicUploadSuccessSchema,
} from './public-contract.ts';
import { PUBLIC_UPLOAD_WAIT_TIMEOUT_MS } from './public-result.ts';

/** Zod owns conversion; override only the two OpenAPI 3.0 representation gaps. */
function schema(schema: z.ZodType, io: 'input' | 'output') {
  return z.toJSONSchema(schema, {
    target: 'openapi-3.0',
    io,
    override({ jsonSchema }) {
      // Binary multipart uses format; contentEncoding is not an OAS 3.0 keyword.
      delete jsonSchema.contentEncoding;
      // nullable does not remove enum constraints in OAS 3.0.
      if (
        jsonSchema.nullable &&
        jsonSchema.enum &&
        !jsonSchema.enum.includes(null)
      )
        jsonSchema.enum.push(null);
    },
  });
}

const errorResponses = {
  '400': '输入无效、未知或重复单值字段、额外/缺失/空文件、截断或取消的接收流。',
  '401': 'Bearer Token 缺失、无效、已停用或已过期；Cookie 不能代替 Token。',
  '408': '接收超时：120 秒无进度，或超过 1800 秒接收预算。',
  '409':
    '存储/目标状态冲突，或已接收图片已回收、删除/任务不可用（IMAGE_UNAVAILABLE，保留原 imageId）。',
  '413': '文件超过接收开始时固定的站点当前大小上限。',
  '415': '不是支持的图片，或无法识别图片内容。',
  '422': '已接收后的图片处理失败；保留真实 imageId、原图和已保存版本。',
  '500': '上传内部错误、数据库错误或接收/发布的未分类故障。',
  '502': '对象存储依赖故障。',
  '503': '图片处理工具不可用，或服务正在停止。',
  '504':
    '存储/工具超时，或等待本次媒体任务超过 900 秒（UPLOAD_WAIT_TIMEOUT）；等待超时包含真实 imageId 和当时状态，处理任务仍会继续。',
  '507': '暂存、存储或处理所需磁盘空间不足。',
};

const noStoreHeader = {
  description: '结果禁止共享缓存。',
  schema: { type: 'string', enum: ['no-store'] },
};

function response(description: string, schemaName: string) {
  return {
    description,
    headers: { 'Cache-Control': noStoreHeader },
    content: {
      'application/json': {
        schema: { $ref: `#/components/schemas/${schemaName}` },
      },
    },
  };
}

/** The only public business operation is upload; internal Web routes stay private. */
export function createUploadOpenApiDocument(publicUrl?: string) {
  const responses: Record<string, ReturnType<typeof response>> = {
    '201': response(
      '本次上传处理完成；可空 actualVersion 不改变 ready 的成功结果。',
      'PublicUploadSuccess',
    ),
    ...Object.fromEntries(
      Object.entries(errorResponses).map(([status, description]) => [
        status,
        response(
          `${description} 尚未创建资产时 imageId=null、status=not_created；已接收后的错误保留 imageId。error 包含 code、stage、message，requestId 用于诊断。`,
          'PublicUploadError',
        ),
      ]),
    ),
  };
  return {
    openapi: '3.0.4',
    info: {
      title: 'Ariso 上传 API',
      version: '1.0.0',
      description:
        '单文件同步上传契约。GET /api/openapi.json 提供本站当前地址的规范；/settings/api 提供用法及 Token 管理。此规范不公开内部 Web 管理接口。',
    },
    servers: [
      {
        url: publicUrl ?? '/',
        description: publicUrl
          ? '当前站点公开地址'
          : '相对当前服务地址；静态生成的契约未绑定站点。',
      },
    ],
    paths: {
      '/api/upload': {
        post: {
          operationId: 'uploadImage',
          summary: '上传一张图片并等待本次处理结果',
          description: [
            '只使用 Authorization: Bearer <token>，在读取文件体前认证；Cookie 不能代替。Token 可上传到所有者图库，中途到期或撤销不取消已接纳请求。',
            '每次请求必需且恰好一个 file，字段顺序任意。storageId 省略才采用默认存储；空串无效。visibility 省略采用正式提交时的默认可见性。',
            'albumId 和 tag 用重复同名字段；相册 ID 去重，不接受名称、逗号串或 albumId[]。标签按名称匹配/创建，逗号属于名称；标签含 1–50 个 Unicode 码点，不含换行或控制字符。拒绝未知字段和重复 storageId/visibility。',
            '文件大小使用接收开始时的站点当前上限。初始默认 50 MiB，可由所有者调整；该默认值不是本站当前上限，规范不把它写成 file 的固定 maxLength。普通字段总字节数不超过 256 KiB。',
            '只有本次媒体任务完成才返回 201，status 表示本次结果；currentImageStatus 仅在当前图片状态不同或已接收后不可用时出现。只列已保存版本。actualVersion 可为 null，此时 defaultResolution.available=false 且 code=VERSION_UNAVAILABLE，固定版本链接仍可用。',
            '私有图片也正常返回 201，但图片链接需要所有者 Cookie；上传 Bearer Token 不授权查看私有图片。',
            '交接后最多等待 900 秒（含排队）。代理与客户端超时应覆盖接收及等待。等待超时或断连不终止已接收后的处理任务；结果不确定时到所有者图库核对。',
            '不提供幂等键或公开状态轮询。每个 POST 都是一次新上传，相同文件也可生成新 imageId；不要盲目自动重发，以免重复。',
          ].join('\n\n'),
          security: [{ uploadToken: [] }],
          'x-wait-timeout-ms': PUBLIC_UPLOAD_WAIT_TIMEOUT_MS,
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: { $ref: '#/components/schemas/PublicUploadInput' },
                encoding: {
                  albumId: {
                    contentType: 'text/plain',
                    style: 'form',
                    explode: true,
                  },
                  tag: {
                    contentType: 'text/plain',
                    style: 'form',
                    explode: true,
                  },
                },
              },
            },
          },
          responses,
        },
      },
    },
    components: {
      securitySchemes: {
        uploadToken: {
          type: 'http',
          scheme: 'bearer',
          description:
            '所有者在 /settings/api 创建的上传 Token；仅授权上传，不授权管理接口或私有图片读取。',
        },
      },
      schemas: {
        PublicUploadInput: schema(publicUploadInputSchema, 'input'),
        PublicUploadSuccess: schema(publicUploadSuccessSchema, 'output'),
        PublicUploadError: schema(publicUploadErrorSchema, 'output'),
      },
    },
  };
}
