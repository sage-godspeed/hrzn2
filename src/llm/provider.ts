export type JsonSchema = Record<string, unknown>;

export interface LLMGenerateRequest {
  system?: string;
  input: string;
  temperature?: number;
}

export interface LLMStructuredRequest<T> extends LLMGenerateRequest {
  schema: JsonSchema;
  validate?: (x: unknown) => x is T;
}

export interface LLMProvider {
  name: string;
  generate(req: LLMGenerateRequest): Promise<string>;
  structured<T>(req: LLMStructuredRequest<T>): Promise<T>;
}

