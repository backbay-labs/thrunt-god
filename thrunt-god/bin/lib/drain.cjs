'use strict';

const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Security-specific mask patterns applied before tokenization.
 * Order matters: most-specific (longest) patterns first to prevent partial matches.
 * Each regex MUST use the /g flag.
 */
const DEFAULT_SECURITY_MASKS = Object.freeze([
  // SHA-256 hex hash (64 chars) -- before shorter hashes
  { regex: /\b[0-9a-fA-F]{64}\b/g, replacement: '<HASH>' },
  // SHA-1 hex hash (40 chars)
  { regex: /\b[0-9a-fA-F]{40}\b/g, replacement: '<HASH>' },
  // MD5 hex hash (32 chars)
  { regex: /\b[0-9a-fA-F]{32}\b/g, replacement: '<HASH>' },
  // UUIDs (8-4-4-4-12)
  { regex: /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g, replacement: '<UUID>' },
  // IPv6 addresses (8 groups of 4 hex digits)
  { regex: /\b[0-9a-fA-F]{1,4}(?::[0-9a-fA-F]{1,4}){7}\b/g, replacement: '<IP>' },
  // MAC addresses (6 groups of 2 hex digits with colons)
  { regex: /\b[0-9a-fA-F]{2}(?::[0-9a-fA-F]{2}){5}\b/g, replacement: '<MAC>' },
  // ISO timestamps (2024-01-15T10:30:00Z variants)
  { regex: /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?\b/g, replacement: '<TS>' },
  // Syslog timestamps (Mar 31 10:15:32)
  { regex: /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\b/g, replacement: '<TS>' },
  // Email addresses
  { regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, replacement: '<EMAIL>' },
  // IPv4 addresses
  { regex: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, replacement: '<IP>' },
  // Windows file paths (C:\Users\admin\...)
  { regex: /[A-Z]:\\(?:[\w.-]+\\){1,}/g, replacement: '<WINPATH>' },
  // Unix file paths (two or more segments: /usr/bin/ssh)
  { regex: /(?:\/[\w.-]+){2,}/g, replacement: '<PATH>' },
  // Unix epoch timestamps (10-13 digits starting with 1)
  { regex: /\b1[0-9]{9,12}\b/g, replacement: '<EPOCH>' },
]);

// ---------------------------------------------------------------------------
// Data Structures
// ---------------------------------------------------------------------------

/**
 * Node -- A node in the fixed-depth prefix tree.
 *
 * Internal nodes hold child pointers (string -> Node). Leaf nodes additionally
 * hold a list of cluster IDs that share the same length + prefix path.
 */
class Node {
  constructor() {
    /** @type {Map<string, Node>} */
    this.children = new Map();
    /** @type {string[]} */
    this.clusterIds = [];
  }
}

/**
 * LogCluster -- Represents a group of log messages that share the same
 * structural template.
 */
class LogCluster {
  /**
   * @param {string[]} templateTokens
   * @param {string}   clusterId
   */
  constructor(templateTokens, clusterId) {
    /** @type {string[]} */
    this.templateTokens = templateTokens;
    /** @type {string} */
    this.clusterId = clusterId;
    /** @type {number} */
    this.size = 1;
  }

  /** @returns {string} */
  getTemplate() {
    return this.templateTokens.join(' ');
  }
}

// ---------------------------------------------------------------------------
// Module-private helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if `s` contains at least one ASCII digit (charCode 48-57).
 * Uses a for-loop over characters, not regex.
 *
 * @param {string} s
 * @returns {boolean}
 */
function hasNumbers(s) {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 48 && c <= 57) return true;
  }
  return false;
}

/**
 * Compute sequence distance between a template and input tokens.
 *
 * Precondition: both arrays must be the same length (guaranteed by the
 * token-count layer in the prefix tree).
 *
 * @param {string[]} templateTokens
 * @param {string[]} inputTokens
 * @param {string}   paramStr
 * @returns {{ similarity: number, paramCount: number }}
 */
function getSeqDistance(templateTokens, inputTokens, paramStr) {
  if (templateTokens.length === 0) return { similarity: 1, paramCount: 0 };

  let simTokens = 0;
  let paramCount = 0;

  for (let i = 0; i < templateTokens.length; i++) {
    if (templateTokens[i] === paramStr) {
      paramCount++;
      continue;
    }
    if (templateTokens[i] === inputTokens[i]) {
      simTokens++;
    }
  }

  return { similarity: simTokens / templateTokens.length, paramCount };
}

/**
 * Merge an input token sequence with an existing template.
 *
 * Position-by-position: if same keep it, else paramStr.
 * Returns a new Array (never mutates inputs).
 *
 * @param {string[]} inputTokens
 * @param {string[]} templateTokens
 * @param {string}   paramStr
 * @returns {string[]}
 */
function createTemplate(inputTokens, templateTokens, paramStr) {
  const result = new Array(inputTokens.length);
  for (let i = 0; i < inputTokens.length; i++) {
    result[i] = (inputTokens[i] === templateTokens[i]) ? inputTokens[i] : paramStr;
  }
  return result;
}

// ---------------------------------------------------------------------------
// DrainParser
// ---------------------------------------------------------------------------

/**
 * DrainParser -- Online log template mining via a fixed-depth prefix tree.
 *
 * Based on the Drain algorithm (He et al., ICWS 2017) as implemented in
 * the Drain3 project (logpai/Drain3, MIT license).
 */
class DrainParser {
  /**
   * @param {object} [options]
   * @param {number} [options.depth=4]                     Max tree depth (min 3)
   * @param {number} [options.simTh=0.4]                   Similarity threshold
   * @param {number} [options.maxChildren=100]             Max child nodes per internal tree node
   * @param {number|null} [options.maxClusters=null]       Optional cap (null = unlimited)
   * @param {string} [options.paramStr='<*>']              Wildcard placeholder
   * @param {boolean} [options.parametrizeNumericTokens=true] Route numeric tokens to wildcard
   * @param {string[]} [options.extraDelimiters=[]]        Additional split characters
   * @param {Array<{regex: RegExp, replacement: string}>} [options.maskPatterns=DEFAULT_SECURITY_MASKS] Pre-masking patterns
   */
  constructor(options = {}) {
    this.depth = Math.max(3, options.depth || 4);
    this.simTh = options.simTh != null ? options.simTh : 0.4;
    this.maxChildren = options.maxChildren || 100;
    this.maxClusters = options.maxClusters != null ? options.maxClusters : null;
    this.paramStr = options.paramStr || '<*>';
    this.parametrizeNumericTokens = options.parametrizeNumericTokens !== false;
    this.extraDelimiters = options.extraDelimiters || [];
    this.maskPatterns = options.maskPatterns || DEFAULT_SECURITY_MASKS;

    /** @type {Node} */
    this.root = new Node();
    /** @type {Map<string, LogCluster>} */
    this.idToCluster = new Map();
    /** @type {number} */
    this.totalMessages = 0;
    /** @type {number} */
    this.maxNodeDepth = this.depth - 2;
  }

  // -----------------------------------------------------------------------
  // Pre-masking
  // -----------------------------------------------------------------------

  /**
   * Apply mask patterns to content before tokenization.
   * Replaces security-variable content (IPs, UUIDs, hashes, etc.) with
   * fixed placeholder tokens so they cluster together.
   *
   * @param {string} content
   * @returns {string}
   */
  _applyMasks(content) {
    const masks = this.maskPatterns;
    if (masks.length === 0) return content;
    let result = content;
    for (let i = 0; i < masks.length; i++) {
      result = result.replace(masks[i].regex, masks[i].replacement);
    }
    return result;
  }

  // -----------------------------------------------------------------------
  // Tokenization
  // -----------------------------------------------------------------------

  /**
   * Tokenize a content string. Split on whitespace first; if extraDelimiters
   * is non-empty, further split each token by those delimiters.
   *
   * @param {string} content
   * @returns {string[]}
   */
  _tokenize(content) {
    let tokens = content.split(/\s+/).filter(Boolean);

    if (this.extraDelimiters.length > 0) {
      const expanded = [];
      for (let i = 0; i < tokens.length; i++) {
        let parts = [tokens[i]];
        for (let d = 0; d < this.extraDelimiters.length; d++) {
          const delim = this.extraDelimiters[d];
          const next = [];
          for (let p = 0; p < parts.length; p++) {
            const split = parts[p].split(delim);
            for (let s = 0; s < split.length; s++) {
              if (split[s]) next.push(split[s]);
            }
          }
          parts = next;
        }
        for (let p = 0; p < parts.length; p++) {
          expanded.push(parts[p]);
        }
      }
      tokens = expanded;
    }

    return tokens;
  }

  // -----------------------------------------------------------------------
  // Tree search
  // -----------------------------------------------------------------------

  /**
   * Search the prefix tree for a matching cluster.
   *
   * @param {string[]} tokens
   * @returns {LogCluster|null}
   */
  _treeSearch(tokens) {
    // Layer 1: token count
    const lenKey = String(tokens.length);
    const lenNode = this.root.children.get(lenKey);
    if (!lenNode) return null;

    // Walk token positions
    let currentNode = lenNode;
    const walkDepth = Math.min(this.maxNodeDepth, tokens.length);
    for (let i = 0; i < walkDepth; i++) {
      const token = tokens[i];

      if (this.parametrizeNumericTokens && hasNumbers(token)) {
        // Numeric token -> follow wildcard child if it exists
        const wildcardNode = currentNode.children.get(this.paramStr);
        if (!wildcardNode) return null;
        currentNode = wildcardNode;
      } else if (currentNode.children.has(token)) {
        currentNode = currentNode.children.get(token);
      } else if (currentNode.children.has(this.paramStr)) {
        currentNode = currentNode.children.get(this.paramStr);
      } else {
        return null;
      }
    }

    // At leaf: fast match among candidate clusters
    return this._fastMatch(currentNode.clusterIds, tokens);
  }

  // -----------------------------------------------------------------------
  // Fast match
  // -----------------------------------------------------------------------

  /**
   * Find the best matching cluster from a list of candidate IDs.
   *
   * @param {string[]} clusterIds
   * @param {string[]} tokens
   * @returns {LogCluster|null}
   */
  _fastMatch(clusterIds, tokens) {
    let bestCluster = null;
    let bestSim = -1;
    let bestParam = -1;

    for (let i = 0; i < clusterIds.length; i++) {
      const cluster = this.idToCluster.get(clusterIds[i]);
      if (!cluster) continue;

      const { similarity, paramCount } = getSeqDistance(
        cluster.templateTokens, tokens, this.paramStr,
      );

      if (similarity > bestSim || (similarity === bestSim && paramCount > bestParam)) {
        bestSim = similarity;
        bestParam = paramCount;
        bestCluster = cluster;
      }
    }

    if (bestCluster && bestSim >= this.simTh) {
      return bestCluster;
    }
    return null;
  }

  // -----------------------------------------------------------------------
  // Tree insertion
  // -----------------------------------------------------------------------

  /**
   * Insert a cluster into the prefix tree.
   *
   * @param {LogCluster} cluster
   * @param {string[]} tokens
   */
  _addSeqToPrefixTree(cluster, tokens) {
    // Layer 1: token count node
    const lenKey = String(tokens.length);
    if (!this.root.children.has(lenKey)) {
      this.root.children.set(lenKey, new Node());
    }
    let currentNode = this.root.children.get(lenKey);

    // Walk token positions
    const walkDepth = Math.min(this.maxNodeDepth, tokens.length);
    for (let i = 0; i < walkDepth; i++) {
      const token = tokens[i];

      if (this.parametrizeNumericTokens && hasNumbers(token)) {
        // Numeric token -> route to wildcard child
        if (!currentNode.children.has(this.paramStr)) {
          currentNode.children.set(this.paramStr, new Node());
        }
        currentNode = currentNode.children.get(this.paramStr);
      } else if (currentNode.children.has(token)) {
        // Existing literal child -> follow it
        currentNode = currentNode.children.get(token);
      } else {
        // Token does not exist as child -- decide whether to create literal or wildcard
        const childCount = currentNode.children.size;
        const hasWildcard = currentNode.children.has(this.paramStr);

        if (hasWildcard) {
          if (childCount < this.maxChildren) {
            // Room for a new literal node
            currentNode.children.set(token, new Node());
            currentNode = currentNode.children.get(token);
          } else {
            // Overflow -> route to existing wildcard
            currentNode = currentNode.children.get(this.paramStr);
          }
        } else {
          // No wildcard child yet
          if (childCount + 1 < this.maxChildren) {
            // Room for a new literal node (still leaves space for future wildcard)
            currentNode.children.set(token, new Node());
            currentNode = currentNode.children.get(token);
          } else if (childCount + 1 === this.maxChildren) {
            // Last slot -- reserve it for the wildcard node
            currentNode.children.set(this.paramStr, new Node());
            currentNode = currentNode.children.get(this.paramStr);
          } else {
            // Already at max -- create wildcard if somehow missing (safety)
            if (!currentNode.children.has(this.paramStr)) {
              currentNode.children.set(this.paramStr, new Node());
            }
            currentNode = currentNode.children.get(this.paramStr);
          }
        }
      }
    }

    // At leaf: register cluster ID
    currentNode.clusterIds.push(cluster.clusterId);
  }

  // -----------------------------------------------------------------------
  // Cluster ID generation
  // -----------------------------------------------------------------------

  /**
   * Generate a content-hash-based cluster ID from a template string.
   * Same template text always produces the same ID across runs.
   *
   * @param {string} templateStr
   * @returns {string}
   */
  _generateClusterId(templateStr) {
    return crypto.createHash('sha256').update(templateStr).digest('hex').slice(0, 16);
  }

  // -----------------------------------------------------------------------
  // Main public method
  // -----------------------------------------------------------------------

  /**
   * Process a log message. Either matches it to an existing cluster (updating
   * the template if needed) or creates a new cluster.
   *
   * @param {string} content
   * @returns {{ clusterId: string, template: string, changeType: string, clusterSize: number }|null}
   */
  addMessage(content) {
    this.totalMessages++;

    // Pre-mask variable content, then tokenize
    const masked = this._applyMasks(content);
    const tokens = this._tokenize(masked);
    if (tokens.length === 0) return null;

    // Search for matching cluster
    const match = this._treeSearch(tokens);

    if (match) {
      // Merge template
      const newTemplateTokens = createTemplate(tokens, match.templateTokens, this.paramStr);
      const oldTemplate = match.getTemplate();
      const newTemplate = newTemplateTokens.join(' ');
      const templateChanged = oldTemplate !== newTemplate;

      // Update cluster
      match.templateTokens = newTemplateTokens;
      match.size++;

      if (templateChanged) {
        const oldId = match.clusterId;
        const newId = this._generateClusterId(newTemplate);
        match.clusterId = newId;

        // Update idToCluster mapping
        this.idToCluster.delete(oldId);
        this.idToCluster.set(newId, match);

        // Update clusterIds in the tree leaf -- replace old ID with new
        // Note: the cluster remains in the same leaf node since token count
        // and prefix path haven't changed; only the ID changed.
        this._updateClusterIdInTree(oldId, newId);
      }

      return {
        clusterId: match.clusterId,
        template: match.getTemplate(),
        changeType: templateChanged ? 'cluster_template_changed' : 'none',
        clusterSize: match.size,
      };
    }

    // No match -- create new cluster
    const templateStr = tokens.join(' ');
    const clusterId = this._generateClusterId(templateStr);

    // Check maxClusters cap
    if (this.maxClusters !== null && this.idToCluster.size >= this.maxClusters) {
      return null;
    }

    const cluster = new LogCluster([...tokens], clusterId);
    this.idToCluster.set(clusterId, cluster);
    this._addSeqToPrefixTree(cluster, tokens);

    return {
      clusterId: cluster.clusterId,
      template: cluster.getTemplate(),
      changeType: 'cluster_created',
      clusterSize: 1,
    };
  }

  /**
   * Update a cluster ID reference in tree leaf nodes after template change.
   *
   * @param {string} oldId
   * @param {string} newId
   * @private
   */
  _updateClusterIdInTree(oldId, newId) {
    this._walkLeaves(this.root, (node) => {
      const idx = node.clusterIds.indexOf(oldId);
      if (idx !== -1) {
        node.clusterIds[idx] = newId;
      }
    });
  }

  /**
   * Walk all leaf nodes in the tree and call fn on each.
   *
   * @param {Node} node
   * @param {function} fn
   * @private
   */
  _walkLeaves(node, fn) {
    if (node.clusterIds.length > 0) {
      fn(node);
    }
    for (const child of node.children.values()) {
      this._walkLeaves(child, fn);
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a new DrainParser instance.
 *
 * @param {object} [options] -- see DrainParser constructor
 * @returns {DrainParser}
 */
function createDrainParser(options = {}) {
  return new DrainParser(options);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  createDrainParser,
  DrainParser,
  DEFAULT_SECURITY_MASKS,
};
