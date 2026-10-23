const messages: Record<string, string> = {
  BACKUP_NO_SPACE: '可用磁盘空间不足，请释放空间后重试',
  ENOSPC: '可用磁盘空间不足，请释放空间后重试',
  BACKUP_OBJECT_MISSING: '备份所需文件缺失，请查看日志中的文件位置并修复后重试',
  BACKUP_OBJECT_INVALID: '备份所需文件与数据库不一致，请检查日志后重试',
  RESTORE_TARGET_NOT_EMPTY: '新 S3 位置已有对象，请停止本次恢复后选择空位置',
  RESTORE_TARGET_OWNED: '新 S3 位置正在由另一恢复任务使用，请选择其他位置',
  RESTORE_REMOTE_UNKNOWN_OBJECT:
    '目标发现本任务以外的对象，已停止复制并保留现场，请查看目标位置和日志',
  RESTORE_REMOTE_CLEANUP_FAILED:
    '部分 S3 目标尚未清理，请修复权限或凭据后继续清理',
  RESTORE_REMOTE_WRITE_UNCERTAIN:
    'S3 更改结果尚未确认，已保留原目标的清理责任；请稍后继续清理并检查存储日志',
  RESTORE_TARGET_TEST_REQUIRED: '请先测试全部 S3 目标的当前配置',
  RESTORE_TARGET_REQUIRED: '请先配置全部 S3 恢复目标',
  STORAGE_OPERATION_FAILED: 'S3 文件操作失败，请检查存储连接和服务日志后重试',
  STORAGE_TIMEOUT: 'S3 文件传输超时，请检查连接后重试',
  BACKUP_DATABASE_INVALID: '备份数据库无法通过完整性检查，请检查服务日志',
  BACKUP_MANIFEST_MISMATCH: '备份摘要与内容不一致，请重新选择完整备份文件',
  BACKUP_INVALID_ARCHIVE:
    '备份文件不完整或格式不受支持，请重新选择完整备份文件',
  BACKUP_VERSION_MISMATCH: '备份版本与当前应用不一致，请使用同一版本和构建恢复',
  BACKUP_PREPARATION_TIMEOUT:
    '已有操作尚未结束，本次备份已停止，原操作会继续；请稍后重新创建备份',
  BACKUP_NOT_QUIESCENT: '持久任务尚未稳定，请等待现有操作结束后重试',
  BACKUP_INTERRUPTED: '任务被进程重启中断，请重新创建备份或重试当前恢复阶段',
};

export function backupFailure(error: unknown, phase: string) {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String(error.code)
      : 'BACKUP_OPERATION_FAILED';
  return {
    code,
    message:
      messages[code] ??
      (phase === 'decrypting'
        ? '无法解密备份，请检查密码和文件是否完整后重试'
        : '操作未完成，请查看服务日志后重试'),
  };
}
