'use client';

import { Button } from '@heroui/react/button';
import { FieldError } from '@heroui/react/field-error';
import { Form } from '@heroui/react/form';
import { Input } from '@heroui/react/input';
import { Label } from '@heroui/react/label';
import { Modal } from '@heroui/react/modal';
import { TextField } from '@heroui/react/textfield';
import { TokenExpiryField } from './token-expiry-field';
import type { TokenCreator } from './token-use-create';

export function TokenCreateForm({
  creator,
  timeZone,
}: {
  creator: TokenCreator;
  timeZone: string;
}) {
  const { errors } = creator;
  return (
    <Form
      className="grid w-full gap-4"
      validationBehavior="aria"
      onSubmit={(event) => {
        event.preventDefault();
        void creator.submit();
      }}
    >
      <Modal.Body className="m-0 grid flex-none gap-3.5 overflow-visible p-0 text-sm leading-normal text-foreground">
        <p className="text-muted">仅允许上传图片，可创建多个 Token。</p>
        <TextField
          name="name"
          value={creator.name}
          onChange={creator.changeName}
          isRequired
          isInvalid={!!errors.name}
          validationBehavior="aria"
          className="gap-1.5"
        >
          <Label className="text-sm font-normal after:content-none">名称</Label>
          <Input
            id="api-name"
            data-testid="api-name"
            autoFocus
            autoComplete="off"
            placeholder="例如：部署脚本"
            className="h-12 rounded-lg border border-border bg-background px-3.5 text-sm shadow-none"
          />
          <FieldError>{errors.name}</FieldError>
        </TextField>
        {creator.finite ? (
          <TokenExpiryField
            value={creator.expiry}
            onChange={creator.changeExpiry}
            timeZone={timeZone}
            error={errors.expiresIn}
            onRemove={creator.removeExpiry}
          />
        ) : (
          <>
            <p>有效期：永不过期</p>
            <Button
              data-testid="api-set-expiry"
              variant="outline"
              className="h-12 w-full rounded-lg bg-background text-sm font-normal"
              onPress={creator.enableExpiry}
            >
              设置到期时间
            </Button>
          </>
        )}
        <p className="text-[13px] text-muted">
          完整 Token 只显示一次，创建后请立即保存。
        </p>
        {creator.feedback ? (
          <p role="alert" className="text-danger">
            {creator.feedback}
          </p>
        ) : null}
      </Modal.Body>
      <Modal.Footer className="m-0 grid w-full grid-cols-1 gap-3 p-0">
        <Button
          data-testid="api-create-submit"
          type="submit"
          className="h-12 min-h-12 w-full rounded-lg text-sm font-normal"
        >
          创建 Token
        </Button>
        <Button
          data-testid="api-create-cancel"
          variant="outline"
          className="h-12 min-h-12 w-full rounded-lg bg-background text-sm font-normal"
          onPress={creator.close}
        >
          取消
        </Button>
      </Modal.Footer>
    </Form>
  );
}
