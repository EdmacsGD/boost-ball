// Uploaded anthems, kept in this browser (IndexedDB). Each record:
// { id, name, blob (the original song file), start, length (seconds), created }.
// When IndexedDB is blocked (some private windows), uploads last for this visit only.
const DB_NAME = 'boostball-anthems';
const STORE = 'clips';
export const MAX_UPLOADS = 12;
export const MAX_FILE_MB = 30;

export class AnthemStore {
  constructor() {
    this.mem = new Map();
    this.persistent = true;
    this.dbp = null;
  }

  open() {
    if (this.dbp) return this.dbp;
    this.dbp = new Promise((resolve) => {
      try {
        if (typeof indexedDB === 'undefined') throw new Error('no indexedDB');
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    }).then((db) => {
      if (!db) this.persistent = false;
      return db;
    });
    return this.dbp;
  }

  async run(mode, fn) {
    const db = await this.open();
    if (!db) return null;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req ? req.result : null);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  // All uploads, oldest first.
  async list() {
    let all;
    try {
      all = (await this.run('readonly', (s) => s.getAll())) || [];
    } catch (e) {
      all = [];
    }
    if (!this.persistent) all = [...this.mem.values()];
    return all.sort((a, b) => a.created - b.created);
  }

  async get(id) {
    if (!this.persistent || this.mem.has(id)) return this.mem.get(id) || (await this.run('readonly', (s) => s.get(id)).catch(() => null));
    try {
      return (await this.run('readonly', (s) => s.get(id))) || null;
    } catch (e) {
      return null;
    }
  }

  async put(rec) {
    await this.open();
    if (!this.persistent) {
      this.mem.set(rec.id, rec);
      return;
    }
    try {
      await this.run('readwrite', (s) => s.put(rec));
    } catch (e) {
      // Out of space or blocked: keep it for this visit.
      this.mem.set(rec.id, rec);
      throw e;
    }
  }

  async remove(id) {
    this.mem.delete(id);
    if (this.persistent) {
      try {
        await this.run('readwrite', (s) => s.delete(id));
      } catch (e) {
        // Ignore.
      }
    }
  }
}

export const newClipId = () => `u${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
