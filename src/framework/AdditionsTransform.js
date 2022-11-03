import MergeGraph from "../common/MergeGraph.js";
import ExplorableGraph from "../core/ExplorableGraph.js";
import { transformObject } from "../core/utilities.js";
import KeysTransform from "./KeysTransform.js";
import MetaTransform from "./MetaTransform.js";

const additions = Symbol("additions");
const childAdditions = Symbol("childAdditions");
const inheritedAdditions = Symbol("inheritedAdditions");
const inheritableAdditions = Symbol("inheritableAdditions");
const addedPeerAdditions = Symbol("addedPeerAdditions");
const gettingChildAdditions = Symbol("gettingChildAdditions");
// We used to define peerAdditions as a Symbol as well, but there seem to be
// cases where Node loads two copies of this transform. One presumably is loaded
// by the CLI, and the other is loaded later via a dynamic import. It's unclear
// why they don't share the same copy of this module. In any event,
// peerAdditions is the one property that's used to communicate between a parent
// and a child, and the parent and child may be using a different copy of this
// transform. To let them communicate, we define peerAdditions with a regular
// string name.

export const additionsPrefix = "+";
export const inheritableAdditionsPrefix = "…";
export const peerAdditionsSuffix = "+";

export default function AdditionsTransform(Base) {
  return class Additions extends Base {
    constructor(...args) {
      super(...args);
      this[additions] = undefined;
      this[childAdditions] = undefined;
      this[inheritedAdditions] = undefined;
      this[inheritableAdditions] = undefined;
      this.peerAdditions = undefined;
      this[addedPeerAdditions] = undefined;
      this[gettingChildAdditions] = false;
    }

    async additions() {
      if (this[additions] === undefined) {
        await this.ensureKeys();
        const children = this[childAdditions] ?? [];
        const peers = this.peerAdditions ?? [];
        const allAdditions = [...children, ...peers];
        this[additions] =
          allAdditions.length === 0
            ? null
            : allAdditions.length === 1
            ? allAdditions[0]
            : new MergeGraph(...allAdditions);
      }
      return this[additions];
    }

    async get(key) {
      let value = await super.get(key);
      if (
        value === undefined &&
        !isChildAdditionKey(key) &&
        !this[gettingChildAdditions]
      ) {
        // Not found locally, check additions.
        const additions = await this.additions();
        value = await additions?.get(key);
      }

      if (ExplorableGraph.isExplorable(value)) {
        // Add peer additions.
        if (!this.peerAdditions && !this[gettingChildAdditions]) {
          await this.getKeys();
        }
        // Preserve any peer additions on the value that were set by its
        // containing graph as it was passed up to us.
        const existingPeerAdditions = value.peerAdditions ?? [];
        const localPeerAdditions = await getPeerValues(this, key);
        const additions = [...existingPeerAdditions, ...localPeerAdditions];
        if (additions.length > 0) {
          if (!("peerAdditions" in value)) {
            // Make the value a metagraph so we can give it peer additions.
            value = transformObject(MetaTransform, value);
          }
          value.peerAdditions = additions;
        }
      }

      return value;
    }

    async getKeys() {
      this[childAdditions] = [];
      if (!this.peerAdditions) {
        this.peerAdditions = [];
      }
      await super.getKeys();
    }

    async keyAdded(key, options, existingKeys) {
      const result = (await super.keyAdded?.(key, options, existingKeys)) ?? {};
      if (isChildAdditionKey(key)) {
        // To avoid an infinite loop, we set a flag to indicate that we're in
        // the process of getting additions. During that process, the get method
        // will be able to get other things, but not additions.
        this[gettingChildAdditions] = true;
        const addition = await this.get(key);
        this[gettingChildAdditions] = false;
        if (addition) {
          /** @type {any} */
          const graph = ExplorableGraph.from(addition);
          graph.applyFormulas = false;
          graph.parent = null;
          this[childAdditions].push(graph);
          // Expose real+virtual keys from the child addition. However, don't
          // expose any child or peer addition keys found inside the child
          // addition, since anything those add will already by included in
          // `allKeys`.
          for (const graphKey of await KeysTransform.allKeys(graph)) {
            if (!isChildAdditionKey(graphKey)) {
              this.addKey(graphKey);
            }
          }
        }
        // Hide this addition from the public keys.
        result.hidden = true;
      } else if (isInheritableAdditionKey(key)) {
        if (!this[inheritableAdditions]) {
          this[inheritableAdditions] = [];
        }
        this[inheritableAdditions].push(key);
      } else if (isPeerAdditionKey(key)) {
        result.hidden = true;
      }
      return result;
    }

    async keysAdded(keys) {
      await super.keysAdded?.(keys);

      // After the first cycle of keys have been added, add keys from any
      // pending peer additions that were passed down to use from the parent.
      if (!this[addedPeerAdditions]) {
        for (const peerGraph of this.peerAdditions ?? []) {
          for (const peerKey of await KeysTransform.realKeys(peerGraph)) {
            this.addKey(peerKey, { source: peerGraph });
          }
        }

        if (!this[inheritedAdditions]) {
          this[inheritedAdditions] = this.parent?.[inheritableAdditions] ?? [];
          for (const inheritedKey of this[inheritedAdditions]) {
            this.addKey(inheritedKey);
          }
        }

        this[addedPeerAdditions] = true;
      }
    }

    // Reset memoized values when the underlying graph changes.
    onChange(key) {
      super.onChange?.(key);
      this[additions] = undefined;
      this[childAdditions] = undefined;
      this[inheritedAdditions] = undefined;
      this[inheritableAdditions] = undefined;
      this.peerAdditions = undefined;
      this[addedPeerAdditions] = undefined;
      this[gettingChildAdditions] = false;
    }
  };
}

async function getPeerValues(graph, graphKey) {
  const values = [];
  // A child or peer additions graph itself can't have peer values.
  if (!isChildAdditionKey(graphKey) && !isPeerAdditionKey(graphKey)) {
    const peerAdditionsKey = `${graphKey}${peerAdditionsSuffix}`;

    // Step 1: See if the peer addition key by itself ("foo+") exists. We can
    // limit our search to real keys, since we'll use formulas to match virtual
    // keys in step 2.
    const realKeys = await graph.realKeys();
    const peerAdditionsKeyIsRealKey = realKeys.includes(peerAdditionsKey);
    if (peerAdditionsKeyIsRealKey) {
      const value = await graph.get(peerAdditionsKey);
      if (value) {
        value.applyFormulas = false;
        value.parent = null;
        values.push(value);
      }
    }

    // Step 2: Look in formulas.
    const matches = (await graph.matchAll?.(peerAdditionsKey)) || [];
    const peerGraphs = matches.map((match) => {
      /** @type {any} */
      const peerGraph = ExplorableGraph.from(match);
      peerGraph.applyFormulas = false;
      peerGraph.parent = null;
      return peerGraph;
    });
    values.push(...peerGraphs);

    // Step 3: a child addition may have contributed a peer addition, a case
    // that is not be picked up by either of the two steps above. As a last
    // chance, we check allKeys, which will contain child additions that aren't
    // real keys. We only do this if the formulas didn't already find a match,
    // because formulas add their implied keys to allKeys.
    if (values.length === 0 && !peerAdditionsKeyIsRealKey) {
      const allKeys = await graph.allKeys();
      if (allKeys.includes(peerAdditionsKey)) {
        const value = await graph.get(peerAdditionsKey);
        if (value) {
          value.applyFormulas = false;
          value.parent = null;
          values.push(value);
        }
      }
    }
  }
  return values;
}

function isChildAdditionKey(key) {
  return key.startsWith?.(additionsPrefix);
}

function isInheritableAdditionKey(key) {
  return key.startsWith?.(inheritableAdditionsPrefix);
}

function isPeerAdditionKey(key) {
  return key.endsWith?.(peerAdditionsSuffix);
}
