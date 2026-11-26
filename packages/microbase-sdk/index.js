export class MicrobaseError extends Error {
  /**
   * @param {number} status
   * @param {string} code
   * @param {string} message
   * @param {unknown} [data]
   */
  constructor(status, code, message, data = undefined) {
    super(message);
    this.name = "MicrobaseError";
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

export class AuthStore {
  /** @param {string} [storageKey] */
  constructor(storageKey = "microbase_auth") {
    this._storageKey = storageKey;
    /** @type {string} */
    this.token = "";
    /** @type {Record<string, any> | null} */
    this.record = null;
    /** @type {Set<(token: string, record: Record<string, any> | null) => void>} */
    this._listeners = new Set();
    this._load();
  }

  get isValid() {
    return this.token.length > 0;
  }

  get isSuperuser() {
    if (!this.isValid) return false;
    if (this.record?.role === "superuser") return true;
    try {
      const parts = this.token.split(".");
      if (parts.length === 3) {
        const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        const json =
          typeof atob === "function"
            ? atob(b64)
            : Buffer.from(b64, "base64").toString("utf8");
        const claims = JSON.parse(json);
        return claims?.role === "superuser";
      }
    } catch {
      // ignore malformed jwt
    }
    return false;
  }

  /**
   * @param {string} token
   * @param {Record<string, any> | null} [record]
   */
  save(token, record = null) {
    this.token = token || "";
    this.record = record ?? null;
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(
          this._storageKey,
          JSON.stringify({ token: this.token, record: this.record }),
        );
      } catch {
        // ignore storage quota errors
      }
    }
    this._notify();
  }

  clear() {
    this.token = "";
    this.record = null;
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.removeItem(this._storageKey);
      } catch {
        // ignore
      }
    }
    this._notify();
  }

  /**
   * @param {(token: string, record: Record<string, any> | null) => void} callback
   * @param {boolean} [fireImmediately]
   * @returns {() => void}
   */
  onChange(callback, fireImmediately = false) {
    this._listeners.add(callback);
    if (fireImmediately) {
      callback(this.token, this.record);
    }
    return () => {
      this._listeners.delete(callback);
    };
  }

  _notify() {
    for (const cb of this._listeners) {
      try {
        cb(this.token, this.record);
      } catch {
        // ignore listener errors
      }
    }
  }

  _load() {
    if (typeof localStorage === "undefined") return;
    try {
      const raw = localStorage.getItem(this._storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      this.token = parsed?.token ?? "";
      this.record = parsed?.record ?? null;
    } catch {
      // ignore corrupted storage
    }
  }
}

export class CollectionClient {
  /**
   * @param {Microbase} client
   * @param {string} name
   */
  constructor(client, name) {
    this.client = client;
    this.name = name;
  }

  _recordsPath() {
    return `/api/collections/${encodeURIComponent(this.name)}/records`;
  }

  /**
   * @param {number} [page]
   * @param {number} [perPage]
   * @param {Record<string, any>} [opts]
   */
  async getList(page = 1, perPage = 30, opts = {}) {
    const qs = new URLSearchParams({
      page: String(page),
      per_page: String(perPage),
    });
    if (opts.sort) qs.set("sort", String(opts.sort));
    if (opts.search) qs.set("search", String(opts.search));
    if (opts.filter) qs.set("filter", String(opts.filter));
    if (opts.expand) qs.set("expand", String(opts.expand));
    if (opts.fields) qs.set("fields", String(opts.fields));

    const res = await this.client.send(`${this._recordsPath()}?${qs.toString()}`);
    const items = Array.isArray(res?.items) ? res.items : [];
    const totalItems =
      typeof res?.total_items === "number"
        ? res.total_items
        : typeof res?.totalItems === "number"
          ? res.totalItems
          : items.length;
    const pp =
      typeof res?.per_page === "number"
        ? res.per_page
        : typeof res?.perPage === "number"
          ? res.perPage
          : perPage;
    const totalPages =
      typeof res?.total_pages === "number"
        ? res.total_pages
        : Math.max(1, Math.ceil(totalItems / Math.max(1, pp)));

    return {
      page: typeof res?.page === "number" ? res.page : page,
      per_page: pp,
      perPage: pp,
      total_items: totalItems,
      totalItems,
      total_pages: totalPages,
      totalPages,
      items,
    };
  }

  /** @param {Record<string, any>} [opts] */
  async getFullList(opts = {}) {
    const batch = typeof opts.batch === "number" && opts.batch > 0 ? opts.batch : 200;
    const items = [];
    let page = 1;
    while (true) {
      const res = await this.getList(page, batch, opts);
      items.push(...res.items);
      if (items.length >= res.totalItems || res.items.length < batch) break;
      page++;
    }
    return items;
  }

  /**
   * @param {string} filter
   * @param {Record<string, any>} [opts]
   */
  async getFirstListItem(filter, opts = {}) {
    const res = await this.getList(1, 1, { ...opts, filter });
    if (!res.items.length) {
      throw new MicrobaseError(
        404,
        "NOT_FOUND",
        `The requested resource wasn't found.`,
      );
    }
    return res.items[0];
  }

  /**
   * @param {string | number} id
   * @param {Record<string, any>} [opts]
   */
  async getOne(id, opts = {}) {
    const qs = new URLSearchParams();
    if (opts.expand) qs.set("expand", String(opts.expand));
    if (opts.fields) qs.set("fields", String(opts.fields));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return this.client.send(
      `${this._recordsPath()}/${encodeURIComponent(String(id))}${suffix}`,
    );
  }

  /**
   * @param {Record<string, any>} body
   * @param {Record<string, any>} [opts]
   */
  async create(body, opts = {}) {
    const qs = new URLSearchParams();
    if (opts.expand) qs.set("expand", String(opts.expand));
    if (opts.fields) qs.set("fields", String(opts.fields));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    const path =
      this.name === "users" && body && typeof body.password === "string"
        ? "/api/auth/register"
        : `${this._recordsPath()}${suffix}`;
    return this.client.send(path, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /**
   * @param {string | number} id
   * @param {Record<string, any>} body
   * @param {Record<string, any>} [opts]
   */
  async update(id, body, opts = {}) {
    const qs = new URLSearchParams();
    if (opts.expand) qs.set("expand", String(opts.expand));
    if (opts.fields) qs.set("fields", String(opts.fields));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return this.client.send(
      `${this._recordsPath()}/${encodeURIComponent(String(id))}${suffix}`,
      {
        method: "PATCH",
        body: JSON.stringify(body),
      },
    );
  }

  /** @param {string | number} id */
  async delete(id) {
    return this.client.send(
      `${this._recordsPath()}/${encodeURIComponent(String(id))}`,
      { method: "DELETE" },
    );
  }

  /**
   * @param {string} field
   * @param {number[]} vector
   * @param {number} [limit]
   */
  async vectorSearch(field, vector, limit = 10) {
    const res = await this.client.send(
      `/api/collections/${encodeURIComponent(this.name)}/search/vector`,
      {
        method: "POST",
        body: JSON.stringify({ field, vector, limit }),
      },
    );
    return res?.items ?? [];
  }

  /** @param {Record<string, any>} body */
  async register(body) {
    const path =
      this.name === "users"
        ? "/api/auth/register"
        : `/api/collections/${encodeURIComponent(this.name)}/register`;
    const res = await this.client.send(path, {
      method: "POST",
      body: JSON.stringify(body),
    });
    const record = res?.record ?? res?.user ?? null;
    if (res?.token) this.client.authStore.save(res.token, record);
    return { ...res, token: res?.token ?? "", record, user: record };
  }

  /**
   * @param {string} identity
   * @param {string} password
   */
  async authWithPassword(identity, password) {
    const path =
      this.name === "_superusers"
        ? "/api/superusers/login"
        : this.name === "users"
          ? "/api/auth/login"
          : `/api/collections/${encodeURIComponent(this.name)}/auth-with-password`;
    const res = await this.client.send(path, {
      method: "POST",
      body: JSON.stringify({ email: identity, identity, password }),
    });
    const record = res?.record ?? res?.user ?? null;
    if (res?.token) this.client.authStore.save(res.token, record);
    return { ...res, token: res?.token ?? "", record, user: record };
  }

  async authRefresh() {
    const path =
      this.name === "users"
        ? "/api/auth/refresh"
        : `/api/collections/${encodeURIComponent(this.name)}/auth-refresh`;
    const res = await this.client.send(path, { method: "POST" });
    const record = res?.record ?? res?.user ?? this.client.authStore.record ?? null;
    if (res?.token) this.client.authStore.save(res.token, record);
    return { ...res, token: res?.token ?? "", record, user: record };
  }

  /**
   * Subscribe to realtime SSE events for this collection.
   * Supports both `subscribe(cb)` and `subscribe(topic, cb, opts)`.
   * @param {string | ((e: any) => void)} topicOrCb
   * @param {(e: any) => void} [maybeCb]
   * @param {Record<string, any>} [_opts]
   */
  async subscribe(topicOrCb, maybeCb, _opts) {
    const topic = typeof topicOrCb === "string" ? topicOrCb : "*";
    const callback = typeof topicOrCb === "function" ? topicOrCb : maybeCb;
    if (typeof callback !== "function") {
      return () => {};
    }

    const params = new URLSearchParams({ collections: this.name });
    if (this.client.authStore.token) {
      params.set("token", this.client.authStore.token);
    }
    const url = `${this.client.baseUrl}/api/realtime?${params.toString()}`;
    const es = new EventSource(url);
    const onEvent = (e) => {
      try {
        const parsed = JSON.parse(e.data);
        if (topic !== "*" && parsed?.record?.id && String(parsed.record.id) !== topic) {
          return;
        }
        callback(parsed);
      } catch {
        // ignore keepalive frames
      }
    };
    for (const action of ["create", "update", "delete"]) {
      es.addEventListener(action, onEvent);
    }
    return () => es.close();
  }
}

export class Microbase {
  /**
   * @param {string} [baseUrl]
   * @param {AuthStore} [authStore]
   */
  constructor(baseUrl = "http://localhost:3000", authStore = new AuthStore()) {
    this.baseUrl = String(baseUrl || "http://localhost:3000").replace(/\/+$/, "");
    this.authStore = authStore;
  }

  /** No-op for ergonomics with callers that disable auto-cancellation. */
  autoCancellation(_enable) {
    return this;
  }

  /**
   * Safely interpolates `{:param}` placeholders in filter expressions.
   * @param {string} expr
   * @param {Record<string, any>} [params]
   */
  filter(expr, params = {}) {
    if (!params) return expr;
    let out = String(expr);
    for (const [key, val] of Object.entries(params)) {
      let serialized;
      if (val === null || val === undefined) {
        serialized = "null";
      } else if (typeof val === "number" || typeof val === "boolean") {
        serialized = String(val);
      } else if (val instanceof Date) {
        serialized = `'${val.toISOString().replace("T", " ")}'`;
      } else {
        const str = typeof val === "string" ? val : JSON.stringify(val);
        serialized = `'${str.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
      }
      out = out.replaceAll(`{:${key}}`, serialized);
    }
    return out;
  }

  /** @param {string} name */
  collection(name) {
    return new CollectionClient(this, name);
  }

  /** Convenience helper for `_superusers` authentication. */
  get superusers() {
    return this.collection("_superusers");
  }

  /**
   * @param {string} provider
   * @param {string} [redirectTo]
   */
  getOAuth2Url(provider, redirectTo) {
    const qs = redirectTo
      ? `?redirect_to=${encodeURIComponent(redirectTo)}`
      : "";
    return `${this.baseUrl}/api/auth/oauth/${encodeURIComponent(provider)}${qs}`;
  }

  /** @param {string} code */
  async exchangeOAuth2Code(code) {
    const res = await this.send("/api/auth/oauth/exchange", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
    const record = res?.record ?? res?.user ?? null;
    if (res?.token) this.authStore.save(res.token, record);
    return { ...res, token: res?.token ?? "", record, user: record };
  }

  /**
   * @param {File | Blob} file
   * @param {string} [filename]
   */
  async uploadFile(file, filename) {
    const form = new FormData();
    form.append("file", file, filename);
    /** @type {Record<string, string>} */
    const headers = {};
    if (this.authStore.token) {
      headers.Authorization = `Bearer ${this.authStore.token}`;
    }
    const res = await fetch(`${this.baseUrl}/api/files`, {
      method: "POST",
      headers,
      body: form,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new MicrobaseError(
        res.status,
        json?.code ?? json?.error?.code ?? "UPLOAD_ERROR",
        json?.message ?? json?.error?.message ?? res.statusText,
        json,
      );
    }
    return json?.data ?? json;
  }

  /**
   * @param {string} path
   * @param {RequestInit} [init]
   */
  async send(path, init = {}) {
    /** @type {Record<string, string>} */
    const headers = {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    };
    if (this.authStore.token && !headers.Authorization) {
      headers.Authorization = `Bearer ${this.authStore.token}`;
    }
    const res = await fetch(`${this.baseUrl}${path}`, { ...init, headers });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new MicrobaseError(
        res.status,
        json?.code ?? json?.error?.code ?? "REQUEST_FAILED",
        json?.message ?? json?.error?.message ?? res.statusText,
        json,
      );
    }
    return json;
  }
}

export default Microbase;
