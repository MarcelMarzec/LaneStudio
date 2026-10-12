// https://github.com/openstreetmap/iD/issues/772
import { get, set, del } from 'idb-keyval';

/** @type {Storage} */
let _storage;
try { _storage = localStorage; } catch {}  // eslint-disable-line no-empty
_storage = _storage || (() => {
  let s = {};
  return {
    getItem: (k) => k in s ? s[k] : null,
    setItem: (k, v) => s[k] = v,
    removeItem: (k) => delete s[k]
  };
})();

const _listeners = {};

// Prepended to every stored key, so that several apps built on iD
// (e.g. iD and Lane Studio) can run on the same origin without sharing state
let _prefix = '';

//
// corePreferences is an interface for persisting basic key-value strings
// within and between iD sessions on the same site.
//
/**
 * @overload getter
 * @param {string} k
 * @param {undefined} [v]
 * @returns {string | null} the value
 */
/**
 * @overload setter
 * @param {string} k
 * @param {string | number | boolean | null} v
 * @returns {boolean} true if the action succeeded
 */
function corePreferences(k, v) {
  try {
    if (v === undefined) return _storage.getItem(_prefix + k);
    else if (v === null) _storage.removeItem(_prefix + k);
    else _storage.setItem(_prefix + k, v);

    if (_listeners[k]) {
      _listeners[k].forEach(handler => handler(v));
    }

    return true;
  } catch {
    /* eslint-disable no-console */
    if (typeof console !== 'undefined') {
      console.error('localStorage quota exceeded');
    }
    /* eslint-enable no-console */
    return false;
  }
}

// adds an event listener which is triggered whenever a preference changes
corePreferences.onChange = function(k, handler) {
  _listeners[k] = _listeners[k] || [];
  _listeners[k].push(handler);
};

/**
 * gets or sets the prefix used for all stored keys; set it before iD is initialised
 * @overload getter
 * @returns {string}
 */
/**
 * @overload setter
 * @param {string} val
 * @returns {typeof corePreferences}
 */
corePreferences.prefix = function(val) {
  if (val === undefined) return _prefix;
  _prefix = val;
  return corePreferences;
};

export { corePreferences as prefs };

export const asyncPrefs = {
  /** @type {typeof get} */
  get: (k, ...args) => get(_prefix + k, ...args),
  /** @type {typeof set} */
  set: (k, ...args) => set(_prefix + k, ...args),
  /** @type {typeof del} */
  del: (k, ...args) => del(_prefix + k, ...args)
};
