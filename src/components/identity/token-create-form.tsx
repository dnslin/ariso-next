'use client';

import { Button } from '@heroui/react/button';
import { FieldError } from '@heroui/react/field-error';
import { Form } from '@heroui/react/form';
import { Input } from '@heroui/react/input';
import { Label } from '@heroui/react/label';
import { Modal } from '@heroui/react/modal';
import { Radio } from '@heroui/react/radio';
import { RadioGroup } from '@heroui/react/radio-group';
import { TextField } from '@heroui/react/textfield';
import { Plus } from 'lucide-react';
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
      className="grid w-full gap-5"
      validationBehavior="aria"
      onSubmit={(event) => {
        event.preventDefault();
        void creator.submit();
      }}
    >
      <Modal.Body className="m-0 grid flex-none gap-5 overflow-visible p-0 text-sm leading-normal text-foreground">
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
        <RadioGroup
          aria-label="有效期"
          value={creator.finite ? 'finite' : 'never'}
          onChange={(value) =>
            value === 'finite' ? creator.enableExpiry() : creator.removeExpiry()
          }
          orientation="horizontal"
          className="flex-col! items-stretch gap-2"
        >
          <Label className="text-sm font-normal">有效期</Label>
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <Radio value="never" data-testid="api-no-expiry">
              <Radio.Content className="min-h-11 gap-2.5 font-normal">
                <Radio.Control className="border border-muted/50">
                  <Radio.Indicator />
                </Radio.Control>
                <Label className="text-sm font-normal">永不过期</Label>
              </Radio.Content>
            </Radio>
            <Radio value="finite" data-testid="api-set-expiry">
              <Radio.Content className="min-h-11 gap-2.5 font-normal">
                <Radio.Control className="border border-muted/50">
                  <Radio.Indicator />
                </Radio.Control>
                <Label className="text-sm font-normal">指定时间</Label>
              </Radio.Content>
            </Radio>
          </div>
        </RadioGroup>
        {creator.finite ? (
          <TokenExpiryField
            value={creator.expiry}
            onChange={creator.changeExpiry}
            timeZone={timeZone}
            error={errors.expiresIn}
          />
        ) : null}
        <p className="text-xs leading-relaxed text-muted">
          完整 Token 只显示一次，创建后请立即保存。
        </p>
        {creator.feedback ? (
          <p role="alert" className="text-danger">
            {creator.feedback}
          </p>
        ) : null}
      </Modal.Body>
      <Modal.Footer className="m-0 flex w-full justify-end border-t border-border p-0 pt-4">
        <Button
          data-testid="api-create-submit"
          type="submit"
          className="h-12 min-h-12 w-28 rounded-lg text-sm font-normal"
        >
          <Plus className="size-4" aria-hidden />
          创建
        </Button>
      </Modal.Footer>
    </Form>
  );
}
