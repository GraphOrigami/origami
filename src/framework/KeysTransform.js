import { sortNatural } from "../core/utilities.js";

const publicKeys = Symbol("publicKeys");
const realKeys = Symbol("realKeys");
const allKeys = Symbol("allKeys");
const newKeyQueue = Symbol("newKeyQueue");

export default function KeysTransform(Base) {
  return class Keys extends Base {
    constructor(...args) {
      super(...args);
      this[allKeys] = null;
      this[publicKeys] = null;
      this[realKeys] = null;
      this[newKeyQueue] = [];
    }

    addKey(key, options = {}) {
      const entry = {
        key,
        virtual: options.virtual ?? true,
        hidden: options.hidden ?? false,
      };

      // TODO: Use Set
      const exists =
        this[allKeys].includes(key) ||
        this[newKeyQueue].find((entry) => entry.key === key);
      if (!exists) {
        this[newKeyQueue].push(entry);
      }
    }

    async allKeys() {
      if (!this[allKeys]) {
        await this.getKeys();
      }
      return this[allKeys];
    }

    async *[Symbol.asyncIterator]() {
      if (!this[publicKeys]) {
        await this.getKeys();
      }
      yield* this[publicKeys];
    }

    async getKeys() {
      this[allKeys] = [];
      this[publicKeys] = [];
      this[realKeys] = [];
      for await (const key of super[Symbol.asyncIterator]()) {
        this.addKey(key, { virtual: false });
      }

      for (
        let length = -1;
        length !== this[allKeys].length || this[newKeyQueue].length > 0;

      ) {
        length = this[allKeys].length;

        const keysThisCycle = [];

        while (this[newKeyQueue].length > 0) {
          const entry = this[newKeyQueue].shift();
          const key = entry.key;
          const options = await this.keyAdded(key, this[allKeys]);

          keysThisCycle.push(key);

          const virtual = options?.virtual ?? entry.virtual;
          if (!virtual) {
            this[realKeys].push(key);
          }

          const hidden = options?.hidden ?? entry.hidden;
          if (!hidden) {
            this[publicKeys].push(key);
          }
        }

        if (keysThisCycle.length > 0) {
          this[allKeys].push(...keysThisCycle);
          await this.keysAdded(keysThisCycle);
        }
      }

      // REVIEW: Should sortNatural sort in place?
      this[realKeys] = sortNatural(this[realKeys]);
      this[publicKeys] = sortNatural(this[publicKeys]);
      this[allKeys] = sortNatural(this[allKeys]);
    }

    async keyAdded(key, existingKeys) {
      return super.keyAdded?.(key, existingKeys);
    }

    async keysAdded(newKeys) {
      return super.keysAdded?.(newKeys);
    }

    onChange(key) {
      super.onChange?.(key);
      this[allKeys] = null;
      this[publicKeys] = null;
      this[realKeys] = null;
      this[newKeyQueue] = [];
    }

    async publicKeys() {
      if (!this[publicKeys]) {
        await this.getKeys();
      }
      return this[publicKeys];
    }

    async realKeys() {
      if (!this[realKeys]) {
        await this.getKeys();
      }
      return this[realKeys];
    }
  };
}
