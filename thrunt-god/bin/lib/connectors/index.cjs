'use strict';

// --- SIEM connectors (extracted from runtime.cjs, Plan 01) ---
module.exports = {
  ...require('./splunk.cjs'),
  ...require('./elastic.cjs'),
  ...require('./sentinel.cjs'),
  ...require('./opensearch.cjs'),
  ...require('./defender-xdr.cjs'),
};
