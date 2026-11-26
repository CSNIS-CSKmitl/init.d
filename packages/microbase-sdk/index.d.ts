export interface RecordModel {
  id: string;
  collectionId?: string;
  collectionName?: string;
  created?: string;
  updated?: string;
  created_at?: string;
  updated_at?: string;
  expand?: Record<string, any>;
  [key: string]: any;
}

export interface ListOptions {
  page?: number;
  perPage?: number;
  batch?: number;
  sort?: string;
  search?: string;
  filter?: string;
  expand?: string;
  fields?: string;
}

export interface ListResult<T = RecordModel> {
  page: number;
  per_page: number;
  perPage: number;
  total_items: number;
  totalItems: number;
  total_pages: number;
  totalPages: number;
  items: T[];
}

export interface AuthResult<T = RecordModel> {
  token: string;
  record: T | null;
  user: T | null;
}

export interface RealtimeEvent<T = RecordModel> {
  action: "create" | "update" | "delete" | string;
  collection?: string;
  record: T;
}

export class MicrobaseError extends Error {
  status: number;
  code: string;
  data?: unknown;
  constructor(status: number, code: string, message: string, data?: unknown);
}

export class AuthStore {
  token: string;
  record: RecordModel | null;
  constructor(storageKey?: string);
  get isValid(): boolean;
  get isSuperuser(): boolean;
  save(token: string, record?: RecordModel | null): void;
  clear(): void;
  onChange(
    callback: (token: string, record: RecordModel | null) => void,
    fireImmediately?: boolean,
  ): () => void;
}

export class CollectionClient<T = RecordModel> {
  constructor(client: Microbase, name: string);
  getList<R = T>(
    page?: number,
    perPage?: number,
    opts?: ListOptions,
  ): Promise<ListResult<R>>;
  getFullList<R = T>(opts?: ListOptions): Promise<R[]>;
  getFirstListItem<R = T>(filter: string, opts?: ListOptions): Promise<R>;
  getOne<R = T>(
    id: string | number,
    opts?: Pick<ListOptions, "expand" | "fields">,
  ): Promise<R>;
  create<R = T>(
    body: Record<string, any>,
    opts?: Pick<ListOptions, "expand" | "fields">,
  ): Promise<R>;
  update<R = T>(
    id: string | number,
    body: Record<string, any>,
    opts?: Pick<ListOptions, "expand" | "fields">,
  ): Promise<R>;
  delete(id: string | number): Promise<{ deleted: string | number }>;
  vectorSearch<R = T>(
    field: string,
    vector: number[],
    limit?: number,
  ): Promise<R[]>;
  register<R = T>(
    body: { email: string; password: string } & Record<string, any>,
  ): Promise<AuthResult<R>>;
  authWithPassword<R = T>(
    identity: string,
    password: string,
  ): Promise<AuthResult<R>>;
  authRefresh<R = T>(): Promise<AuthResult<R>>;
  subscribe<R = T>(
    callback: (event: RealtimeEvent<R>) => void,
  ): Promise<() => void>;
  subscribe<R = T>(
    topic: string,
    callback: (event: RealtimeEvent<R>) => void,
    opts?: Record<string, any>,
  ): Promise<() => void>;
}

export class Microbase {
  readonly baseUrl: string;
  readonly authStore: AuthStore;
  constructor(baseUrl?: string, authStore?: AuthStore);
  autoCancellation(enable: boolean): this;
  filter(expr: string, params?: Record<string, unknown>): string;
  collection<T = RecordModel>(name: string): CollectionClient<T>;
  get superusers(): CollectionClient<RecordModel>;
  getOAuth2Url(provider: string, redirectTo?: string): string;
  exchangeOAuth2Code<T = RecordModel>(code: string): Promise<AuthResult<T>>;
  uploadFile(
    file: File | Blob,
    filename?: string,
  ): Promise<{ filename: string; url: string; backend: string }>;
  send<T = any>(path: string, init?: RequestInit): Promise<T>;
}

export default Microbase;
