export class AccountError extends Error {
  readonly code: string;
  readonly status: number;
  readonly fields?: { field: string; message: string }[];
  constructor(
    code: string,
    status: number,
    message: string,
    fields?: { field: string; message: string }[],
  ) {
    super(message);
    this.code = code;
    this.status = status;
    this.fields = fields;
  }
}
