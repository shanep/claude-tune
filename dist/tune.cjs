#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/cli/main.ts
var import_node_child_process2 = require("node:child_process");
var import_node_os = __toESM(require("node:os"), 1);
var import_node_path12 = __toESM(require("node:path"), 1);
var import_node_process = __toESM(require("node:process"), 1);

// src/cli/paths.ts
var import_node_path = __toESM(require("node:path"), 1);
function nonEmpty(value) {
  return value === void 0 || value === "" ? null : value;
}
function pathsFor(env, home) {
  const claudeDir = nonEmpty(env["CLAUDE_CONFIG_DIR"]) ?? import_node_path.default.join(home, ".claude");
  const stateHome = nonEmpty(env["XDG_STATE_HOME"]) ?? import_node_path.default.join(home, ".local", "state");
  const stateDir = nonEmpty(env["CLAUDE_TUNE_STATE_DIR"]) ?? import_node_path.default.join(stateHome, "claude-tune");
  return {
    home,
    claudeDir,
    projectsDir: import_node_path.default.join(claudeDir, "projects"),
    userSettings: import_node_path.default.join(claudeDir, "settings.json"),
    skillsDir: import_node_path.default.join(claudeDir, "skills"),
    agentsDir: import_node_path.default.join(claudeDir, "agents"),
    stateDir,
    indexFile: import_node_path.default.join(stateDir, "tuning.json"),
    trackedFile: import_node_path.default.join(stateDir, "tuning-tracked.json"),
    backupDir: import_node_path.default.join(stateDir, "backups")
  };
}

// src/cli/projects.ts
var import_node_child_process = require("node:child_process");
var import_node_fs = require("node:fs");
var import_node_path2 = __toESM(require("node:path"), 1);
var CLAUDE_WORKTREES = `${import_node_path2.default.sep}.claude${import_node_path2.default.sep}worktrees${import_node_path2.default.sep}`;
var runGit = (cwd, args) => {
  try {
    return (0, import_node_child_process.execFileSync)("git", ["-C", cwd, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5e3
    }).trim();
  } catch {
    return null;
  }
};
function mainCheckout(cwd, git = runGit) {
  const common = git(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  if (common === null || common === "") {
    return null;
  }
  return import_node_path2.default.basename(common) === ".git" ? import_node_path2.default.dirname(common) : null;
}
function projectReader(git = runGit, exists = import_node_fs.existsSync) {
  const known = /* @__PURE__ */ new Map();
  return (cwd) => {
    let found = known.get(cwd);
    if (found === void 0) {
      const marker = cwd.indexOf(CLAUDE_WORKTREES);
      if (marker !== -1) {
        found = cwd.slice(0, marker);
      } else {
        found = exists(cwd) ? mainCheckout(cwd, git) ?? cwd : cwd;
      }
      known.set(cwd, found);
    }
    return found;
  };
}
function projectRoot(cwd, git = runGit) {
  const top = git(cwd, ["rev-parse", "--show-toplevel"]);
  return top === null || top === "" ? null : top;
}

// src/cli/app.ts
var import_promises8 = require("node:fs/promises");
var import_node_path11 = __toESM(require("node:path"), 1);

// src/core/authoring/render.ts
var AGENT_FIELDS = ["name", "description", "tools", "model", "color"];
var SKILL_FIELDS = [
  "name",
  "description",
  "argument-hint",
  "disable-model-invocation"
];
var YAML_WORDS = /^(?:true|false|yes|no|on|off|null|~)$/iu;
var PLAIN = /^[A-Za-z][\w ,.'()/-]*$/u;
function scalar(value) {
  if (typeof value === "boolean") {
    return String(value);
  }
  const plain = PLAIN.test(value) && !value.endsWith(" ") && !YAML_WORDS.test(value);
  return plain ? value : JSON.stringify(value);
}
function normalizeBody(body) {
  const trimmed = body.trimEnd();
  return trimmed === "" ? "" : `${trimmed}
`;
}
function render(frontmatter, fields, body) {
  const lines = fields.flatMap((field2) => {
    const value = frontmatter[field2];
    return typeof value === "string" || typeof value === "boolean" ? [`${field2}: ${scalar(value)}
`] : [];
  });
  const head = `---
${lines.join("")}---
`;
  const normalized = normalizeBody(body);
  return normalized === "" ? head : `${head}
${normalized}`;
}
function renderAgent(spec) {
  return render(spec.frontmatter, AGENT_FIELDS, spec.body);
}
function renderSkill(spec) {
  return render(spec.frontmatter, SKILL_FIELDS, spec.body);
}

// src/core/tuning/cleanup.ts
var CLEANUP_DEFAULT_DAYS = 30;
var KEEP_DAYS = 90;
function keptDays(setting) {
  return typeof setting === "number" && setting >= 0 ? setting : CLEANUP_DEFAULT_DAYS;
}

// src/core/knobs/json.ts
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isArray(value) {
  return Array.isArray(value);
}
function isNotFound(error) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

// src/core/tuning/fix-context.ts
function stringsOf(value) {
  return isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

// src/core/tuning/words.ts
function tokens(value) {
  if (value >= 999500) {
    return `${(value / 1e6).toFixed(1).replace(/\.0$/u, "")}M`;
  }
  if (value >= 1e3) {
    return `${Math.round(value / 1e3).toString()}K`;
  }
  return Math.round(value).toString();
}
function usd(value) {
  return value < 10 ? `$${value.toFixed(2)}` : `$${Math.round(value).toLocaleString("en-US")}`;
}
function percent(ratio2) {
  return `${Math.round(ratio2 * 100).toString()}%`;
}
function plural(count3, word, many = `${word}s`) {
  return `${count3.toLocaleString("en-US")} ${count3 === 1 ? word : many}`;
}

// src/core/tuning/fixes-cd.ts
var MIN_CDS = 20;
var MIN_SESSIONS = 2;
var MOST_FOLDERS = 5;
function lastPart(folder) {
  return folder.slice(folder.lastIndexOf("/") + 1);
}
function expand(context, folder) {
  return folder === "~" || folder.startsWith("~/") ? `${context.home}${folder.slice(1)}` : folder;
}
function repositoryOf(context, folder) {
  let dir = folder;
  while (dir.startsWith(`${context.home}/`)) {
    if (context.modifiedAt(`${dir}/.git`) !== null) {
      return dir;
    }
    dir = dir.slice(0, dir.lastIndexOf("/"));
  }
  return null;
}
function cdFolders(context) {
  const found = /* @__PURE__ */ new Map();
  for (const measure of context.live) {
    if (measure.cwd === null) {
      continue;
    }
    const own2 = context.projectOf(measure.cwd);
    const seen = /* @__PURE__ */ new Set();
    for (const [target, count3] of Object.entries(measure.cdTargets)) {
      const repository = repositoryOf(context, expand(context, target));
      if (repository === null || repository === own2 || context.projectOf(repository) !== repository) {
        continue;
      }
      const entry = found.get(repository) ?? { cds: 0, sessions: 0 };
      found.set(repository, {
        cds: entry.cds + count3,
        sessions: entry.sessions + (seen.has(repository) ? 0 : 1)
      });
      seen.add(repository);
    }
  }
  return [...found].map(([folder, entry]) => ({ folder, ...entry })).filter((entry) => entry.cds >= MIN_CDS && entry.sessions >= MIN_SESSIONS).toSorted((left, right) => right.cds - left.cds).slice(0, MOST_FOLDERS);
}
function cdFix(context) {
  const folders = cdFolders(context);
  if (folders.length === 0) {
    return null;
  }
  const existing = stringsOf(context.knob("permissions.additionalDirectories"));
  const allowed = existing.map((folder) => expand(context, folder));
  const covered = (folder) => allowed.some((dir) => folder === dir || folder.startsWith(`${dir}/`));
  const shown = (folder) => folder.replace(context.home, "~");
  const list = folders.map(
    (entry) => `${shown(entry.folder)} (${plural(entry.cds, "cd")} in ${plural(entry.sessions, "session")})`
  ).join(", ");
  return {
    kind: "knob",
    id: "knob:permissions.additionalDirectories",
    key: "permissions.additionalDirectories",
    value: [.../* @__PURE__ */ new Set([...existing, ...folders.map((entry) => entry.folder)])],
    title: `Let sessions stay in ${folders.map((entry) => lastPart(entry.folder)).join(", ")} after a cd`,
    detail: `Adds ${list} to permissions.additionalDirectories in your user settings. Claude Code then leaves the shell there after a cd instead of putting it back in the session folder, so one cd does for the rest of the session. Sessions can also read and edit files there as they do in their own folder.`,
    applied: folders.every((entry) => covered(entry.folder))
  };
}

// src/core/transcripts/prompts.ts
var import_node_crypto = require("node:crypto");

// node_modules/zod/v4/core/util.js
var util_exports = {};
__export(util_exports, {
  BIGINT_FORMAT_RANGES: () => BIGINT_FORMAT_RANGES,
  CONSTANT_CATCH: () => CONSTANT_CATCH,
  Class: () => Class,
  NUMBER_FORMAT_RANGES: () => NUMBER_FORMAT_RANGES,
  aborted: () => aborted,
  allowsEval: () => allowsEval,
  assert: () => assert,
  assertEqual: () => assertEqual,
  assertIs: () => assertIs,
  assertNever: () => assertNever,
  assertNotEqual: () => assertNotEqual,
  assignProp: () => assignProp,
  attachSchema: () => attachSchema,
  base64ToUint8Array: () => base64ToUint8Array,
  base64urlToUint8Array: () => base64urlToUint8Array,
  cached: () => cached,
  captureStackTrace: () => captureStackTrace,
  cleanEnum: () => cleanEnum,
  cleanRegex: () => cleanRegex,
  clone: () => clone,
  cloneDef: () => cloneDef,
  codePointLength: () => codePointLength,
  constantCatch: () => constantCatch,
  createTransparentProxy: () => createTransparentProxy,
  defineLazy: () => defineLazy,
  defineLazyInternal: () => defineLazyInternal,
  derived: () => derived,
  esc: () => esc,
  escapeRegex: () => escapeRegex,
  explicitlyAborted: () => explicitlyAborted,
  extend: () => extend,
  finalizeIssue: () => finalizeIssue,
  floatSafeRemainder: () => floatSafeRemainder,
  getElementAtPath: () => getElementAtPath,
  getEnumValues: () => getEnumValues,
  getLengthableOrigin: () => getLengthableOrigin,
  getParsedType: () => getParsedType,
  getSizableOrigin: () => getSizableOrigin,
  hexToUint8Array: () => hexToUint8Array,
  hide: () => hide,
  installLazyProp: () => installLazyProp,
  isObject: () => isObject,
  isPlainObject: () => isPlainObject2,
  issue: () => issue,
  joinValues: () => joinValues,
  jsonStringifyReplacer: () => jsonStringifyReplacer,
  members: () => members,
  merge: () => merge,
  mergeDefs: () => mergeDefs,
  normalizeParams: () => normalizeParams,
  nullish: () => nullish,
  numKeys: () => numKeys,
  objectClone: () => objectClone,
  omit: () => omit,
  optionalKeys: () => optionalKeys,
  own: () => own,
  parsedType: () => parsedType,
  partial: () => partial,
  pick: () => pick,
  prefixIssues: () => prefixIssues,
  primitiveTypes: () => primitiveTypes,
  promiseAllObject: () => promiseAllObject,
  propertyKeyTypes: () => propertyKeyTypes,
  randomString: () => randomString,
  rawShape: () => rawShape,
  required: () => required,
  safeExtend: () => safeExtend,
  shallowClone: () => shallowClone,
  sizeCaps: () => sizeCaps,
  slugify: () => slugify,
  stringifyPrimitive: () => stringifyPrimitive,
  toZod: () => toZod,
  uint8ArrayToBase64: () => uint8ArrayToBase64,
  uint8ArrayToBase64url: () => uint8ArrayToBase64url,
  uint8ArrayToHex: () => uint8ArrayToHex,
  unwrapMessage: () => unwrapMessage
});
function assertEqual(val) {
  return val;
}
function assertNotEqual(val) {
  return val;
}
function toZod() {
  return (schema) => schema;
}
function assertIs(_arg) {
}
function assertNever(_x) {
  throw new Error("Unexpected value in exhaustive check");
}
function assert(_) {
}
function getEnumValues(entries) {
  const numericValues = Object.values(entries).filter((v) => typeof v === "number");
  const values = Object.entries(entries).filter(([k, _]) => numericValues.indexOf(+k) === -1).map(([_, v]) => v);
  return values;
}
function joinValues(array2, separator = "|") {
  return array2.map((val) => stringifyPrimitive(val)).join(separator);
}
function jsonStringifyReplacer(_, value) {
  if (typeof value === "bigint")
    return value.toString();
  return value;
}
var Cached = class {
  constructor(getter) {
    this._getter = getter;
    this._value = void 0;
  }
  get value() {
    const getter = this._getter;
    if (getter !== void 0) {
      this._value = getter();
      this._getter = void 0;
    }
    return this._value;
  }
};
function cached(getter) {
  return new Cached(getter);
}
function nullish(input) {
  return input === null || input === void 0;
}
function cleanRegex(source) {
  const start = source.startsWith("^") ? 1 : 0;
  const end = source.endsWith("$") ? source.length - 1 : source.length;
  return source.slice(start, end);
}
function floatSafeRemainder(val, step) {
  const ratio2 = val / step;
  const roundedRatio = Math.round(ratio2);
  const tolerance = 4 * Number.EPSILON * Math.max(Math.abs(ratio2), 1);
  if (Math.abs(ratio2 - roundedRatio) < tolerance)
    return 0;
  return ratio2 - roundedRatio;
}
var EVALUATING = /* @__PURE__ */ Symbol("evaluating");
function defineLazy(object2, key, getter) {
  let value = void 0;
  Object.defineProperty(object2, key, {
    get() {
      if (value === EVALUATING) {
        return void 0;
      }
      if (value === void 0) {
        value = EVALUATING;
        value = getter();
      }
      return value;
    },
    set(v) {
      Object.defineProperty(object2, key, {
        value: v
        // configurable: true,
      });
    },
    configurable: true
  });
}
function objectClone(obj) {
  return Object.create(Object.getPrototypeOf(obj), Object.getOwnPropertyDescriptors(obj));
}
function assignProp(target, prop, value) {
  Object.defineProperty(target, prop, {
    value,
    writable: true,
    enumerable: true,
    configurable: true
  });
}
function rawShape(def) {
  const desc = Object.getOwnPropertyDescriptor(def, "shape");
  return desc?.get ? desc.get.raw : desc?.value;
}
function sourceShape(schema) {
  return rawShape(schema._zod.def) ?? schema._zod.def.shape;
}
function deferProp(target, key, getter) {
  Object.defineProperty(target, key, {
    get() {
      const value = getter();
      assignProp(this, key, value);
      return value;
    },
    enumerable: true,
    configurable: true
  });
}
function putProp(target, key, value) {
  if (key in target)
    assignProp(target, key, value);
  else
    target[key] = value;
}
function mirrorShape(target, source, keys, wrap) {
  const raw = sourceShape(source);
  for (const key of keys) {
    const desc = Object.getOwnPropertyDescriptor(raw, key);
    if (!desc.enumerable)
      continue;
    if (desc.get) {
      deferProp(target, key, () => {
        const value = source._zod.def.shape[key];
        return wrap ? wrap(value, key) : value;
      });
    } else
      putProp(target, key, wrap ? wrap(desc.value, key) : desc.value);
  }
}
function mirrorProps(target, source) {
  for (const key of Reflect.ownKeys(source)) {
    const desc = Object.getOwnPropertyDescriptor(source, key);
    if (!desc.enumerable)
      continue;
    if (desc.get)
      deferProp(target, key, () => source[key]);
    else
      putProp(target, key, desc.value);
  }
}
function mergeDefs(...defs) {
  const mergedDescriptors = {};
  for (const def of defs) {
    const descriptors = Object.getOwnPropertyDescriptors(def);
    Object.assign(mergedDescriptors, descriptors);
  }
  return Object.defineProperties({}, mergedDescriptors);
}
function cloneDef(schema) {
  return mergeDefs(schema._zod.def);
}
function getElementAtPath(obj, path13) {
  if (!path13)
    return obj;
  return path13.reduce((acc, key) => acc?.[key], obj);
}
function promiseAllObject(promisesObj) {
  const keys = Object.keys(promisesObj);
  const promises = keys.map((key) => promisesObj[key]);
  return Promise.all(promises).then((results) => {
    const resolvedObj = {};
    for (let i = 0; i < keys.length; i++) {
      resolvedObj[keys[i]] = results[i];
    }
    return resolvedObj;
  });
}
function randomString(length = 10) {
  const chars = "abcdefghijklmnopqrstuvwxyz";
  let str = "";
  for (let i = 0; i < length; i++) {
    str += chars[Math.floor(Math.random() * chars.length)];
  }
  return str;
}
function esc(str) {
  return JSON.stringify(str);
}
function slugify(input) {
  return input.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "");
}
var captureStackTrace = "captureStackTrace" in Error ? Error.captureStackTrace : (..._args) => {
};
function isObject(data) {
  return typeof data === "object" && data !== null && !Array.isArray(data);
}
var allowsEval = /* @__PURE__ */ cached(() => {
  if (globalConfig.jitless) {
    return false;
  }
  if (typeof navigator !== "undefined" && navigator?.userAgent?.includes("Cloudflare")) {
    return false;
  }
  try {
    const F = Function;
    new F("");
    return true;
  } catch (_) {
    return false;
  }
});
function isPlainObject2(o) {
  if (isObject(o) === false)
    return false;
  const ctor = o.constructor;
  if (ctor === void 0)
    return true;
  if (typeof ctor !== "function")
    return true;
  const prot = ctor.prototype;
  if (isObject(prot) === false)
    return false;
  if (Object.prototype.hasOwnProperty.call(prot, "isPrototypeOf") === false) {
    return false;
  }
  return true;
}
function shallowClone(o) {
  if (isPlainObject2(o))
    return { ...o };
  if (Array.isArray(o))
    return [...o];
  if (o instanceof Map)
    return new Map(o);
  if (o instanceof Set)
    return new Set(o);
  return o;
}
function numKeys(data) {
  let keyCount = 0;
  for (const key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      keyCount++;
    }
  }
  return keyCount;
}
var getParsedType = (data) => {
  const t = typeof data;
  switch (t) {
    case "undefined":
      return "undefined";
    case "string":
      return "string";
    case "number":
      return Number.isNaN(data) ? "nan" : "number";
    case "boolean":
      return "boolean";
    case "function":
      return "function";
    case "bigint":
      return "bigint";
    case "symbol":
      return "symbol";
    case "object":
      if (Array.isArray(data)) {
        return "array";
      }
      if (data === null) {
        return "null";
      }
      if (data.then && typeof data.then === "function" && data.catch && typeof data.catch === "function") {
        return "promise";
      }
      if (typeof Map !== "undefined" && data instanceof Map) {
        return "map";
      }
      if (typeof Set !== "undefined" && data instanceof Set) {
        return "set";
      }
      if (typeof Date !== "undefined" && data instanceof Date) {
        return "date";
      }
      if (typeof File !== "undefined" && data instanceof File) {
        return "file";
      }
      return "object";
    default:
      throw new Error(`Unknown data type: ${t}`);
  }
};
var propertyKeyTypes = /* @__PURE__ */ new Set(["string", "number", "symbol"]);
var primitiveTypes = /* @__PURE__ */ new Set([
  "string",
  "number",
  "bigint",
  "boolean",
  "symbol",
  "undefined"
]);
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function clone(inst, def, params) {
  const cl = new inst._zod.constr(def ?? inst._zod.def);
  if (!def || params?.parent)
    cl._zod.parent = inst;
  return cl;
}
function normalizeParams(_params) {
  const params = _params;
  if (!params)
    return {};
  if (typeof params === "string")
    return { error: () => params };
  if (params?.message !== void 0) {
    if (params?.error !== void 0)
      throw new Error("Cannot specify both `message` and `error` params");
    params.error = params.message;
  }
  delete params.message;
  if (typeof params.error === "string")
    return { ...params, error: () => params.error };
  return params;
}
function createTransparentProxy(getter) {
  let target;
  return new Proxy({}, {
    get(_, prop, receiver) {
      target ?? (target = getter());
      return Reflect.get(target, prop, receiver);
    },
    set(_, prop, value, receiver) {
      target ?? (target = getter());
      return Reflect.set(target, prop, value, receiver);
    },
    has(_, prop) {
      target ?? (target = getter());
      return Reflect.has(target, prop);
    },
    deleteProperty(_, prop) {
      target ?? (target = getter());
      return Reflect.deleteProperty(target, prop);
    },
    ownKeys(_) {
      target ?? (target = getter());
      return Reflect.ownKeys(target);
    },
    getOwnPropertyDescriptor(_, prop) {
      target ?? (target = getter());
      return Reflect.getOwnPropertyDescriptor(target, prop);
    },
    defineProperty(_, prop, descriptor) {
      target ?? (target = getter());
      return Reflect.defineProperty(target, prop, descriptor);
    }
  });
}
function stringifyPrimitive(value) {
  if (typeof value === "bigint")
    return value.toString() + "n";
  if (typeof value === "string")
    return `"${value}"`;
  return `${value}`;
}
function optionalKeys(shape) {
  return Object.keys(shape).filter((k) => {
    return shape[k]._zod.optin !== void 0 && shape[k]._zod.optout === "optional";
  });
}
var NUMBER_FORMAT_RANGES = /* @__PURE__ */ (() => ({
  safeint: [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
  int32: [-2147483648, 2147483647],
  uint32: [0, 4294967295],
  float32: [-34028234663852886e22, 34028234663852886e22],
  float64: [-Number.MAX_VALUE, Number.MAX_VALUE]
}))();
var BIGINT_FORMAT_RANGES = {
  int64: [/* @__PURE__ */ BigInt("-9223372036854775808"), /* @__PURE__ */ BigInt("9223372036854775807")],
  uint64: [/* @__PURE__ */ BigInt(0), /* @__PURE__ */ BigInt("18446744073709551615")]
};
function pick(schema, mask) {
  const currDef = schema._zod.def;
  const checks = currDef.checks;
  const hasChecks = checks && checks.length > 0;
  if (hasChecks) {
    throw new Error(".pick() cannot be used on object schemas containing refinements");
  }
  const newShape = {};
  mirrorShape(newShape, schema, maskedKeys(schema, mask));
  return clone(schema, mergeDefs(currDef, { shape: newShape, checks: [] }));
}
function maskedKeys(schema, mask) {
  const raw = sourceShape(schema);
  const keys = [];
  for (const key of Reflect.ownKeys(mask)) {
    if (!Object.getOwnPropertyDescriptor(raw, key)?.enumerable) {
      throw new Error(`Unrecognized key: "${String(key)}"`);
    }
    if (mask[key])
      keys.push(key);
  }
  return keys;
}
function omit(schema, mask) {
  const currDef = schema._zod.def;
  const checks = currDef.checks;
  const hasChecks = checks && checks.length > 0;
  if (hasChecks) {
    throw new Error(".omit() cannot be used on object schemas containing refinements");
  }
  const omitted = new Set(maskedKeys(schema, mask));
  const newShape = {};
  mirrorShape(newShape, schema, Reflect.ownKeys(sourceShape(schema)).filter((key) => !omitted.has(key)));
  return clone(schema, mergeDefs(currDef, { shape: newShape, checks: [] }));
}
function extend(schema, shape) {
  if (!isPlainObject2(shape)) {
    throw new Error("Invalid input to extend: expected a plain object");
  }
  const checks = schema._zod.def.checks;
  const hasChecks = checks && checks.length > 0;
  if (hasChecks) {
    const existingShape = sourceShape(schema);
    for (const key of Reflect.ownKeys(shape)) {
      if (Object.getOwnPropertyDescriptor(existingShape, key) !== void 0) {
        throw new Error("Cannot overwrite keys on object schemas containing refinements. Use `.safeExtend()` instead.");
      }
    }
  }
  return clone(schema, mergeDefs(schema._zod.def, { shape: extended(schema, shape) }));
}
function extended(schema, shape) {
  const newShape = {};
  mirrorShape(newShape, schema, Reflect.ownKeys(sourceShape(schema)));
  mirrorProps(newShape, shape);
  return newShape;
}
function safeExtend(schema, shape) {
  if (!isPlainObject2(shape)) {
    throw new Error("Invalid input to safeExtend: expected a plain object");
  }
  return clone(schema, mergeDefs(schema._zod.def, { shape: extended(schema, shape) }));
}
function merge(a, b) {
  if (!b?._zod?.def) {
    throw new Error("Invalid input to merge: expected an object schema. To merge a plain shape, use `.extend()`.");
  }
  if (a._zod.def.checks?.length) {
    throw new Error(".merge() cannot be used on object schemas containing refinements. Use .safeExtend() instead.");
  }
  const newShape = {};
  mirrorShape(newShape, a, Reflect.ownKeys(sourceShape(a)));
  mirrorShape(newShape, b, Reflect.ownKeys(sourceShape(b)));
  const def = mergeDefs(a._zod.def, {
    shape: newShape,
    get catchall() {
      return b._zod.def.catchall;
    },
    checks: b._zod.def.checks ?? []
  });
  return clone(a, def);
}
function partial(Class2, schema, mask, name = "partial") {
  const currDef = schema._zod.def;
  const checks = currDef.checks;
  const hasChecks = checks && checks.length > 0;
  if (hasChecks) {
    throw new Error(`.${name}() cannot be used on object schemas containing refinements`);
  }
  const selected = mask ? new Set(maskedKeys(schema, mask)) : void 0;
  const newShape = {};
  mirrorShape(newShape, schema, Reflect.ownKeys(sourceShape(schema)), Class2 && ((value, key) => selected && !selected.has(key) ? value : new Class2({ type: "optional", innerType: value })));
  return clone(schema, mergeDefs(schema._zod.def, { shape: newShape, checks: [] }));
}
function required(Class2, schema, mask) {
  const selected = mask ? new Set(maskedKeys(schema, mask)) : void 0;
  const newShape = {};
  mirrorShape(newShape, schema, Reflect.ownKeys(sourceShape(schema)), (value, key) => (
    // overwrite with non-optional
    selected && !selected.has(key) ? value : new Class2({ type: "nonoptional", innerType: value })
  ));
  return clone(schema, mergeDefs(schema._zod.def, { shape: newShape }));
}
function aborted(x, startIndex = 0) {
  if (x.aborted === true)
    return true;
  for (let i = startIndex; i < x.issues.length; i++) {
    if (x.issues[i]?.continue !== true) {
      return true;
    }
  }
  return false;
}
function explicitlyAborted(x, startIndex = 0) {
  if (x.aborted === true)
    return true;
  for (let i = startIndex; i < x.issues.length; i++) {
    if (x.issues[i]?.continue === false) {
      return true;
    }
  }
  return false;
}
function prefixIssues(path13, issues) {
  return issues.map((iss) => {
    var _a2;
    (_a2 = iss).path ?? (_a2.path = []);
    iss.path.unshift(path13);
    return iss;
  });
}
function unwrapMessage(message) {
  return typeof message === "string" ? message : message?.message;
}
function sizeCaps(defChecks) {
  const caps = [];
  for (const ch of defChecks ?? []) {
    const d = ch._zod.def;
    if (!/_(length|size)$|_equals$/.test(d.check))
      break;
    const max = d.maximum ?? d.length ?? d.size;
    if (max >= 0)
      caps.push([max, ch]);
  }
  return caps;
}
function attachSchema(issues, start, inst) {
  var _a2;
  for (let i = start; i < issues.length; i++) {
    (_a2 = issues[i]).schema ?? (_a2.schema = inst);
  }
}
function finalizeIssue(iss, ctx, config2) {
  var _a2;
  const traits = iss.inst?._zod?.traits;
  if (traits?.has("$ZodType")) {
    if (traits.has("$ZodCheck"))
      (_a2 = iss).schema ?? (_a2.schema = iss.inst);
    else
      iss.schema = iss.inst;
  }
  const schemaError = iss.schema !== iss.inst ? iss.schema?._zod.def?.error : void 0;
  const message = iss.message ? iss.message : unwrapMessage(iss.inst?._zod.def?.error?.(iss)) ?? unwrapMessage(schemaError?.(iss)) ?? unwrapMessage(ctx?.error?.(iss)) ?? unwrapMessage(config2.customError?.(iss)) ?? unwrapMessage(config2.localeError?.(iss)) ?? "Invalid input";
  const full = {};
  for (const k of Object.keys(iss)) {
    if (k === "inst" || k === "schema" || k === "continue" || k === "input" || k === "__proto__")
      continue;
    full[k] = iss[k];
  }
  full.path ?? (full.path = []);
  full.message = message;
  if (ctx?.reportInput) {
    full.input = iss.input;
  }
  return full;
}
function getSizableOrigin(input) {
  if (input instanceof Set)
    return "set";
  if (input instanceof Map)
    return "map";
  if (input instanceof File)
    return "file";
  return "unknown";
}
var highSurrogate = /[\uD800-\uDBFF]/;
function codePointLength(str) {
  const units = str.length;
  if (!highSurrogate.test(str))
    return units;
  let count3 = units;
  for (let i = 0; i < units - 1; i++) {
    if ((str.charCodeAt(i) & 64512) === 55296 && (str.charCodeAt(i + 1) & 64512) === 56320) {
      count3--;
      i++;
    }
  }
  return count3;
}
function getLengthableOrigin(input) {
  if (Array.isArray(input))
    return "array";
  if (typeof input === "string")
    return "string";
  return "unknown";
}
function parsedType(data) {
  const t = typeof data;
  switch (t) {
    case "number": {
      return Number.isNaN(data) ? "nan" : "number";
    }
    case "object": {
      if (data === null) {
        return "null";
      }
      if (Array.isArray(data)) {
        return "array";
      }
      const obj = data;
      if (obj && Object.getPrototypeOf(obj) !== Object.prototype && "constructor" in obj && obj.constructor) {
        return obj.constructor.name;
      }
    }
  }
  return t;
}
function issue(...args) {
  const [iss, input, inst] = args;
  if (typeof iss === "string") {
    return {
      message: iss,
      code: "custom",
      input,
      inst
    };
  }
  return { ...iss };
}
function cleanEnum(obj) {
  return Object.entries(obj).filter(([k, _]) => {
    return Number.isNaN(Number.parseInt(k, 10));
  }).map((el) => el[1]);
}
function base64ToUint8Array(base64) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}
function uint8ArrayToBase64(bytes) {
  let binaryString = "";
  for (let i = 0; i < bytes.length; i++) {
    binaryString += String.fromCharCode(bytes[i]);
  }
  return btoa(binaryString);
}
function base64urlToUint8Array(base64url) {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - base64.length % 4) % 4);
  return base64ToUint8Array(base64 + padding);
}
function uint8ArrayToBase64url(bytes) {
  return uint8ArrayToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
function hexToUint8Array(hex) {
  const cleanHex = hex.replace(/^0x/, "");
  if (cleanHex.length % 2 !== 0) {
    throw new Error("Invalid hex string length");
  }
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(cleanHex.slice(i, i + 2), 16);
  }
  return bytes;
}
function uint8ArrayToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
var Class = class {
  constructor(..._args) {
  }
};
function members(proto, table) {
  for (const key in table) {
    const desc = Object.getOwnPropertyDescriptor(table, key);
    if (desc.get)
      Object.defineProperty(proto, key, { ...desc, enumerable: false });
    else
      defineBound(proto, key, desc.value);
  }
}
function own(inst, key, value, enumerable = true) {
  Object.defineProperty(inst, key, { configurable: true, writable: true, enumerable, value });
  return value;
}
function hide(inst, key, value) {
  return own(inst, key, value, false);
}
// @__NO_SIDE_EFFECTS__
function derived(computes, table) {
  for (const key in computes) {
    const compute = computes[key];
    Object.defineProperty(table, key, {
      configurable: true,
      enumerable: true,
      get() {
        return own(this, key, compute(this));
      },
      set(value) {
        own(this, key, value);
      }
    });
  }
  return table;
}
function defineBound(proto, key, fn) {
  Object.defineProperty(proto, key, {
    configurable: true,
    get() {
      return this == null ? fn : own(this, key, fn.bind(this));
    },
    set(value) {
      own(this, key, value);
    }
  });
}
function claim(inst, sentinel) {
  const proto = Object.getPrototypeOf(inst);
  return sentinel in proto ? void 0 : proto;
}
var installing;
var broke = false;
var breaker = {
  configurable: true,
  get() {
    broke = true;
    return void 0;
  }
};
function defineLazyInternal(inst, key, compute) {
  const proto = Object.getPrototypeOf(inst._zod);
  if (key in proto && installing !== inst._zod) {
    installing = void 0;
    return;
  }
  installing = inst._zod;
  Object.defineProperty(proto, key, {
    configurable: true,
    get() {
      Object.defineProperty(this, key, breaker);
      const outer = broke;
      broke = false;
      try {
        const value = compute(this);
        if (broke)
          delete this[key];
        else
          Object.defineProperty(this, key, { configurable: true, writable: true, value });
        broke = broke || outer;
        return value;
      } catch (err) {
        delete this[key];
        broke = broke || outer;
        throw err;
      }
    },
    set(value) {
      Object.defineProperty(this, key, { configurable: true, writable: true, value });
    }
  });
}
function installLazyProp(inst, key, make, enumerable) {
  const proto = claim(inst, key);
  if (!proto)
    return;
  Object.defineProperty(proto, key, {
    configurable: true,
    get() {
      const desc = { configurable: true, writable: true, enumerable, value: void 0 };
      Object.defineProperty(this, key, desc);
      desc.value = make(this);
      Object.defineProperty(this, key, desc);
      return desc.value;
    },
    set(value) {
      Object.defineProperty(this, key, { configurable: true, writable: true, enumerable, value });
    }
  });
}
var CONSTANT_CATCH = "~constantCatch";
function constantCatch(value) {
  const fn = () => value;
  fn[CONSTANT_CATCH] = true;
  return fn;
}

// node_modules/zod/v4/core/core.js
var _a;
var _zodDesc = { value: void 0, enumerable: false };
var _E = "captureStackTrace" in Error ? Error : null;
function newError(Definition) {
  const E = _E;
  if (E) {
    const saved = E.stackTraceLimit;
    if (typeof saved === "number") {
      try {
        E.stackTraceLimit = 0;
      } catch {
        _E = null;
        return new Definition();
      }
      try {
        return new Definition();
      } finally {
        E.stackTraceLimit = saved;
      }
    }
  }
  return new Definition();
}
// @__NO_SIDE_EFFECTS__
function $constructor(name, initializer2, proto, params) {
  const zodProto = {};
  function Internals(def) {
    this.def = def;
    this.constr = _;
    this.traits = /* @__PURE__ */ new Set();
  }
  Internals.prototype = zodProto;
  const protoMembers = proto;
  const initialized = protoMembers && /* @__PURE__ */ new WeakSet();
  function init(inst, def) {
    if (!inst._zod) {
      _zodDesc.value = new Internals(def);
      try {
        Object.defineProperty(inst, "_zod", _zodDesc);
      } finally {
        _zodDesc.value = void 0;
      }
    } else if (inst._zod.traits.has(name)) {
      return;
    }
    inst._zod.traits.add(name);
    initializer2(inst, def);
    if (initialized) {
      const own2 = Object.getPrototypeOf(inst);
      const ctorProto = inst._zod.constr.prototype;
      let up = own2;
      while (up && up !== ctorProto)
        up = Object.getPrototypeOf(up);
      const target = up ?? own2;
      if (!initialized.has(target)) {
        initialized.add(target);
        members(target, protoMembers);
      }
    }
    const proto2 = _.prototype;
    for (const k in proto2) {
      if (!Object.prototype.hasOwnProperty.call(proto2, k))
        continue;
      if (!(k in inst)) {
        inst[k] = proto2[k].bind(inst);
      }
    }
  }
  const Parent = params?.Parent ?? Object;
  class Definition extends Parent {
  }
  Object.defineProperty(Definition, "name", { value: name });
  function _(def) {
    const inst = params?.Parent ? newError(Definition) : this;
    init(inst, def);
    const deferred = inst._zod.deferred;
    if (deferred) {
      for (const fn of deferred) {
        fn();
      }
      inst._zod.deferred = void 0;
    }
    const pp = globalThis.__zod_globalConfig?.postProcessor;
    if (pp)
      pp(inst);
    return inst;
  }
  Object.defineProperty(_, "init", { value: init });
  Object.defineProperty(_, Symbol.hasInstance, {
    value: (inst) => {
      if (params?.Parent && inst instanceof params.Parent)
        return true;
      return inst?._zod?.traits?.has(name);
    }
  });
  Object.defineProperty(_, "name", { value: name });
  return _;
}
var $ZodAsyncError = class extends Error {
  constructor() {
    super(`Encountered Promise during synchronous parse. Use .parseAsync() instead.`);
  }
};
(_a = globalThis).__zod_globalConfig ?? (_a.__zod_globalConfig = {});
var globalConfig = globalThis.__zod_globalConfig;
function config(newConfig) {
  if (newConfig)
    Object.assign(globalConfig, newConfig);
  return globalConfig;
}

// node_modules/zod/v4/core/errors.js
function _getMessage() {
  const internals = this._zod;
  internals.message ?? (internals.message = JSON.stringify(internals.def, jsonStringifyReplacer, 2));
  return internals.message;
}
function _setMessage(value) {
  this._zod.message = value;
}
var _messageDesc = {
  get: _getMessage,
  set: _setMessage,
  enumerable: true,
  configurable: true
};
var _issuesDesc = { value: void 0, enumerable: false };
var _installedToString = /* @__PURE__ */ new WeakSet([Object.prototype, Error.prototype]);
var initializer = (inst, def) => {
  inst.name = "$ZodError";
  _issuesDesc.value = def;
  Object.defineProperty(inst, "issues", _issuesDesc);
  _issuesDesc.value = void 0;
  Object.defineProperty(inst, "message", _messageDesc);
  const proto = Object.getPrototypeOf(inst);
  if (!_installedToString.has(proto)) {
    _installedToString.add(proto);
    Object.defineProperty(proto, "toString", {
      configurable: true,
      enumerable: false,
      get() {
        const value = () => this.message;
        Object.defineProperty(this, "toString", { value, configurable: true, writable: true });
        return value;
      },
      set(value) {
        Object.defineProperty(this, "toString", { value, configurable: true, writable: true });
      }
    });
  }
};
var $ZodError = $constructor("$ZodError", initializer);
var $ZodRealError = $constructor("$ZodError", initializer, void 0, {
  Parent: Error
});

// node_modules/zod/v4/core/parse.js
var _parse = (_Err) => {
  const fn = (schema, value, _ctx, _params) => {
    const ctx = _ctx ? { ..._ctx, async: false } : { async: false };
    const result = schema._zod.run({ value, issues: [] }, ctx);
    if (result instanceof Promise) {
      throw new $ZodAsyncError();
    }
    if (result.issues.length) {
      const e = new (_params?.Err ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
      captureStackTrace(e, _params?.callee ?? fn);
      throw e;
    }
    return result.value;
  };
  return fn;
};
var parse = /* @__PURE__ */ _parse($ZodRealError);
var _parseAsync = (_Err) => {
  const fn = async (schema, value, _ctx, params) => {
    const ctx = _ctx ? { ..._ctx, async: true } : { async: true };
    let result = schema._zod.run({ value, issues: [] }, ctx);
    if (result instanceof Promise)
      result = await result;
    if (result.issues.length) {
      const e = new (params?.Err ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
      captureStackTrace(e, params?.callee ?? fn);
      throw e;
    }
    return result.value;
  };
  return fn;
};
var parseAsync = /* @__PURE__ */ _parseAsync($ZodRealError);
var _safeParse = (_Err) => (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, async: false } : { async: false };
  const result = schema._zod.run({ value, issues: [] }, ctx);
  if (result instanceof Promise) {
    throw new $ZodAsyncError();
  }
  return result.issues.length ? failure(_Err, result.issues, ctx) : { success: true, data: result.value };
};
var safeParse = /* @__PURE__ */ _safeParse($ZodRealError);
function failure(Err, issues, ctx) {
  let error;
  return {
    success: false,
    get error() {
      if (!error) {
        error = new Err(issues.map((iss) => finalizeIssue(iss, ctx, config())));
        issues = void 0;
        ctx = void 0;
      }
      return error;
    },
    set error(e) {
      error = e;
      issues = void 0;
      ctx = void 0;
    }
  };
}
var _safeParseAsync = (_Err) => async (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, async: true } : { async: true };
  let result = schema._zod.run({ value, issues: [] }, ctx);
  if (result instanceof Promise)
    result = await result;
  return result.issues.length ? failure(_Err, result.issues, ctx) : { success: true, data: result.value };
};
var safeParseAsync = /* @__PURE__ */ _safeParseAsync($ZodRealError);

// node_modules/zod/v4/core/regexes.js
var anyString = /^[\s\S]{0,}$/;
var number = /^-?\d+(?:\.\d+)?$/;
var boolean = /^(?:true|false)$/i;

// node_modules/zod/v4/core/checks.js
var $ZodCheck = /* @__PURE__ */ $constructor("$ZodCheck", (inst, def) => {
  var _a2;
  inst._zod ?? (inst._zod = {});
  inst._zod.def = def;
  (_a2 = inst._zod).onattach ?? (_a2.onattach = []);
});
var numericOriginMap = {
  number: "number",
  bigint: "bigint",
  object: "date"
};
var $ZodCheckGreaterThan = /* @__PURE__ */ $constructor("$ZodCheckGreaterThan", (inst, def) => {
  $ZodCheck.init(inst, def);
  const origin2 = numericOriginMap[typeof def.value];
  inst._zod.check = (payload) => {
    if (def.inclusive ? payload.value >= def.value : payload.value > def.value) {
      return;
    }
    payload.issues.push({
      origin: numericOriginMap[typeof payload.value] ?? origin2,
      code: "too_small",
      minimum: typeof def.value === "object" ? def.value.getTime() : def.value,
      input: payload.value,
      inclusive: def.inclusive,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckNumberFormat = /* @__PURE__ */ $constructor("$ZodCheckNumberFormat", (inst, def) => {
  $ZodCheck.init(inst, def);
  def.format = def.format || "float64";
  const isInt = def.format?.includes("int");
  const origin2 = isInt ? "int" : "number";
  const [minimum, maximum] = NUMBER_FORMAT_RANGES[def.format];
  inst._zod.check = (payload) => {
    const input = payload.value;
    if (isInt) {
      if (!Number.isInteger(input)) {
        payload.issues.push({
          expected: origin2,
          format: def.format,
          code: "invalid_type",
          continue: false,
          input,
          inst
        });
        return;
      }
      if (!Number.isSafeInteger(input)) {
        if (input > 0) {
          payload.issues.push({
            input,
            code: "too_big",
            maximum: Number.MAX_SAFE_INTEGER,
            note: "Integers must be within the safe integer range.",
            inst,
            origin: origin2,
            inclusive: true,
            continue: !def.abort
          });
        } else {
          payload.issues.push({
            input,
            code: "too_small",
            minimum: Number.MIN_SAFE_INTEGER,
            note: "Integers must be within the safe integer range.",
            inst,
            origin: origin2,
            inclusive: true,
            continue: !def.abort
          });
        }
        return;
      }
    }
    if (input < minimum) {
      payload.issues.push({
        origin: "number",
        input,
        code: "too_small",
        minimum,
        inclusive: true,
        inst,
        continue: !def.abort
      });
    }
    if (input > maximum) {
      payload.issues.push({
        origin: "number",
        input,
        code: "too_big",
        maximum,
        inclusive: true,
        inst,
        continue: !def.abort
      });
    }
  };
});

// node_modules/zod/v4/core/versions.js
var version = {
  major: 4,
  minor: 6,
  patch: 7
};

// node_modules/zod/v4/core/schemas.js
var $ZodType = /* @__PURE__ */ $constructor("$ZodType", (inst, def) => {
  var _a2;
  inst ?? (inst = {});
  inst._zod.def = def;
  inst._zod.bag = inst._zod.bag || {};
  inst._zod.version = version;
  const defChecks = inst._zod.def.checks;
  const checks = inst._zod.traits.has("$ZodCheck") ? [inst, ...defChecks ?? []] : defChecks?.length ? [...defChecks] : [];
  for (const ch of checks) {
    for (const fn of ch._zod.onattach) {
      fn(inst);
    }
  }
  if (checks.length === 0) {
    (_a2 = inst._zod).deferred ?? (_a2.deferred = []);
    inst._zod.deferred?.push(() => {
      inst._zod.run = inst._zod.parse;
    });
  } else {
    const runChecks = (payload, checks2, ctx) => {
      if (payload.memo)
        return payload;
      let isAborted = aborted(payload);
      let asyncResult;
      for (const ch of checks2) {
        if (ch._zod.def.when) {
          if (explicitlyAborted(payload))
            continue;
          const shouldRun = ch._zod.def.when(payload);
          if (!shouldRun)
            continue;
        } else if (isAborted) {
          continue;
        }
        const currLen = payload.issues.length;
        const _ = ch._zod.check(payload);
        if (_ instanceof Promise && ctx?.async === false) {
          throw new $ZodAsyncError();
        }
        if (asyncResult || _ instanceof Promise) {
          asyncResult = (asyncResult ?? Promise.resolve()).then(async () => {
            await _;
            const nextLen = payload.issues.length;
            if (nextLen === currLen)
              return;
            attachSchema(payload.issues, currLen, inst);
            if (!isAborted)
              isAborted = aborted(payload, currLen);
          });
        } else {
          const nextLen = payload.issues.length;
          if (nextLen === currLen)
            continue;
          attachSchema(payload.issues, currLen, inst);
          if (!isAborted)
            isAborted = aborted(payload, currLen);
        }
      }
      if (asyncResult) {
        return asyncResult.then(() => {
          return payload;
        });
      }
      return payload;
    };
    const handleCanaryResult = (canary, payload, ctx) => {
      if (aborted(canary)) {
        canary.aborted = true;
        return canary;
      }
      const checkResult = runChecks(payload, checks, ctx);
      if (checkResult instanceof Promise) {
        if (ctx.async === false)
          throw new $ZodAsyncError();
        return checkResult.then((checkResult2) => inst._zod.parse(checkResult2, ctx));
      }
      return inst._zod.parse(checkResult, ctx);
    };
    inst._zod.run = (payload, ctx) => {
      if (ctx.skipChecks) {
        return inst._zod.parse(payload, ctx);
      }
      if (ctx.direction === "backward") {
        const canary = inst._zod.parse({ value: payload.value, issues: [] }, { ...ctx, skipChecks: true });
        if (canary instanceof Promise) {
          return canary.then((canary2) => {
            return handleCanaryResult(canary2, payload, ctx);
          });
        }
        return handleCanaryResult(canary, payload, ctx);
      }
      const result = inst._zod.parse(payload, ctx);
      if (result instanceof Promise) {
        if (ctx.async === false)
          throw new $ZodAsyncError();
        return result.then((result2) => runChecks(result2, checks, ctx));
      }
      return runChecks(result, checks, ctx);
    };
  }
}, {
  // Wrappers extend this by installing a richer factory over it; reading it eagerly would defeat the laziness.
  get "~standard"() {
    return hide(this, "~standard", standardProps(this));
  },
  set "~standard"(value) {
    own(this, "~standard", value);
  }
});
var toStandardResult = (r, ctx) => r.issues.length ? { issues: r.issues.map((iss) => finalizeIssue(iss, ctx, config())) } : { value: r.value };
async function validateAsync(inst, value) {
  const ctx = { async: true };
  return toStandardResult(await inst._zod.run({ value, issues: [] }, ctx), ctx);
}
function standardProps(inst) {
  return {
    validate: (value) => {
      const ctx = { async: false };
      try {
        const r = inst._zod.run({ value, issues: [] }, ctx);
        if (!(r instanceof Promise))
          return toStandardResult(r, ctx);
      } catch (_) {
      }
      return validateAsync(inst, value);
    },
    vendor: "zod",
    version: 1
  };
}
var $ZodString = /* @__PURE__ */ $constructor("$ZodString", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = def.pattern ?? anyString;
  inst._zod.parse = (payload, _) => {
    if (def.coerce)
      try {
        payload.value = String(payload.value);
      } catch (_2) {
      }
    if (typeof payload.value === "string")
      return payload;
    payload.issues.push({
      expected: "string",
      code: "invalid_type",
      input: payload.value,
      inst
    });
    return payload;
  };
});
var $ZodNumber = /* @__PURE__ */ $constructor("$ZodNumber", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = number;
  inst._zod.parse = (payload, _ctx) => {
    if (def.coerce)
      try {
        payload.value = Number(payload.value);
      } catch (_) {
      }
    const input = payload.value;
    if (typeof input === "number" && !Number.isNaN(input) && Number.isFinite(input)) {
      return payload;
    }
    const received = typeof input === "number" ? Number.isNaN(input) ? "NaN" : !Number.isFinite(input) ? String(input) : void 0 : void 0;
    payload.issues.push({
      expected: "number",
      code: "invalid_type",
      input,
      inst,
      ...received ? { received } : {}
    });
    return payload;
  };
});
var $ZodNumberFormat = /* @__PURE__ */ $constructor("$ZodNumberFormat", (inst, def) => {
  $ZodCheckNumberFormat.init(inst, def);
  $ZodNumber.init(inst, def);
});
var $ZodBoolean = /* @__PURE__ */ $constructor("$ZodBoolean", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = boolean;
  inst._zod.parse = (payload, _ctx) => {
    if (def.coerce)
      try {
        payload.value = Boolean(payload.value);
      } catch (_) {
      }
    const input = payload.value;
    if (typeof input === "boolean")
      return payload;
    payload.issues.push({
      expected: "boolean",
      code: "invalid_type",
      input,
      inst
    });
    return payload;
  };
});
var $ZodUnknown = /* @__PURE__ */ $constructor("$ZodUnknown", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload) => payload;
});
function capSize(inst, size) {
  const caps = sizeCaps(inst._zod.def.checks);
  if (!caps.length)
    return;
  const cap = Math.min(...caps.map((c) => c[0]));
  const parse2 = inst._zod.parse;
  inst._zod.parse = (payload, ctx) => {
    const n = size(payload.value);
    if (n > cap && !ctx?.skipChecks && ctx?.direction !== "backward") {
      for (const [max, ch] of sizeCaps(inst._zod.def.checks)) {
        if (n > max && ch._zod.def.when(payload)) {
          const start = payload.issues.length;
          ch._zod.check(payload);
          payload.issues[start].continue = false;
          attachSchema(payload.issues, start, inst);
          return payload;
        }
      }
    }
    return parse2(payload, ctx);
  };
}
var arraySize = (input) => Array.isArray(input) ? input.length : -1;
function handleArrayResult(result, final, index) {
  if (result.issues.length) {
    final.issues.push(...prefixIssues(index, result.issues));
  }
  final.value[index] = result.value;
}
var $ZodArray = /* @__PURE__ */ $constructor("$ZodArray", (inst, def) => {
  $ZodType.init(inst, def);
  const memo = globalConfig.memoizer;
  memo?.attach(inst);
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    if (!Array.isArray(input)) {
      payload.issues.push({
        expected: "array",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    }
    payload.value = memo ? memo.alloc(inst, payload, Array(input.length), ctx) : Array(input.length);
    const proms = [];
    const abortEarly = ctx?.abortEarly;
    for (let i = 0; i < input.length; i++) {
      const item = input[i];
      const result = def.element._zod.run({
        value: item,
        issues: []
      }, ctx);
      if (result instanceof Promise) {
        proms.push(result.then((result2) => handleArrayResult(result2, payload, i)));
      } else {
        handleArrayResult(result, payload, i);
        if (abortEarly && result.issues.length !== 0 && aborted(result))
          break;
      }
    }
    if (proms.length) {
      return Promise.all(proms).then(() => payload);
    }
    return payload;
  };
  capSize(inst, arraySize);
});
function handlePropertyResult(result, final, key, input, optin, optout) {
  const isPresent = key in input;
  const isOptionalOut = optout === "optional";
  if (!isPresent && isOptionalOut && optin === "optional") {
    return;
  }
  if (result.issues.length) {
    if (optin !== void 0 && isOptionalOut && !isPresent) {
      return;
    }
    final.issues.push(...prefixIssues(key, result.issues));
  }
  if (!isPresent && optin === void 0) {
    if (!result.issues.length) {
      final.issues.push({
        code: "invalid_type",
        expected: "nonoptional",
        input: void 0,
        path: [key]
      });
    }
    return;
  }
  if (result.value === void 0) {
    if (isPresent || optin === "defaulted" && !isOptionalOut) {
      final.value[key] = void 0;
    }
  } else {
    final.value[key] = result.value;
  }
}
var NO_SYMBOL_KEYS = [];
function normalizeDef(def) {
  const keys = Object.keys(def.shape);
  const ownSymbols = Object.getOwnPropertySymbols(def.shape);
  const symbolKeys = ownSymbols.length ? ownSymbols : NO_SYMBOL_KEYS;
  const allKeys = symbolKeys.length ? [...keys, ...symbolKeys] : keys;
  for (const k of allKeys) {
    if (!def.shape?.[k]?._zod?.traits?.has("$ZodType")) {
      throw new Error(`Invalid element at key "${String(k)}": expected a Zod schema`);
    }
  }
  const okeys = optionalKeys(def.shape);
  return {
    ...def,
    allKeys,
    symbolKeys,
    // string-only: handleCatchall matches it against `for...in`, which never yields a symbol
    keySet: new Set(keys),
    numKeys: keys.length,
    optionalKeys: new Set(okeys)
  };
}
function handleCatchall(proms, input, payload, ctx, def, inst, abortEarly) {
  const unrecognized = [];
  const keySet = def.keySet;
  const _catchall = def.catchall._zod;
  const t = _catchall.def.type;
  const optin = _catchall.optin;
  const optout = _catchall.optout;
  let seen = 0;
  for (const key in input) {
    if (abortEarly && payload.issues.length !== seen) {
      if (aborted(payload, seen))
        break;
      seen = payload.issues.length;
    }
    if (keySet.has(key))
      continue;
    if (key === "__proto__") {
      if (t === "never")
        unrecognized.push(key);
      continue;
    }
    if (t === "never") {
      unrecognized.push(key);
      continue;
    }
    const r = _catchall.run({ value: input[key], issues: [] }, ctx);
    if (r instanceof Promise) {
      proms.push(r.then((r2) => handlePropertyResult(r2, payload, key, input, optin, optout)));
    } else {
      handlePropertyResult(r, payload, key, input, optin, optout);
    }
  }
  if (unrecognized.length) {
    payload.issues.push({
      code: "unrecognized_keys",
      keys: unrecognized,
      input,
      inst,
      // Describes the shape of the input, not the validity of the parsed value, so it never aborts. The parse still fails; the schema's own checks just get to run first, and an enclosing intersection can reconcile the key against a sibling operand.
      continue: true
    });
  }
  if (!proms.length)
    return payload;
  return Promise.all(proms).then(() => {
    return payload;
  });
}
var $ZodObject = /* @__PURE__ */ $constructor("$ZodObject", (inst, def) => {
  $ZodType.init(inst, def);
  const desc = Object.getOwnPropertyDescriptor(def, "shape");
  const sh = desc?.get ? desc.get.raw : def.shape ?? {};
  if (sh) {
    const get = () => {
      const newSh = { ...sh };
      Object.defineProperty(def, "shape", { value: newSh });
      get.raw = newSh;
      return newSh;
    };
    get.raw = sh;
    Object.defineProperty(def, "shape", { get });
  }
  const _normalized = cached(() => normalizeDef(def));
  defineLazyInternal(inst, "propValues", (zod) => {
    const shape = zod.def.shape;
    const propValues = {};
    for (const key in shape) {
      const field2 = shape[key]._zod;
      if (field2.values) {
        if (!Object.prototype.hasOwnProperty.call(propValues, key)) {
          assignProp(propValues, key, /* @__PURE__ */ new Set());
        }
        for (const v of field2.values)
          propValues[key].add(v);
        if (field2.optin !== void 0)
          propValues[key].add(void 0);
      }
    }
    return propValues;
  });
  const isObject2 = isObject;
  const catchall = def.catchall;
  let value;
  const memo = globalConfig.memoizer;
  memo?.attach(inst);
  inst._zod.parse = (payload, ctx) => {
    value ?? (value = _normalized.value);
    const input = payload.value;
    if (!isObject2(input)) {
      payload.issues.push({
        expected: "object",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    }
    payload.value = memo ? memo.alloc(inst, payload, {}, ctx) : {};
    const proms = [];
    const shape = value.shape;
    const abortEarly = ctx?.abortEarly;
    let seen = payload.issues.length;
    for (const key of value.allKeys) {
      if (abortEarly && payload.issues.length !== seen) {
        if (aborted(payload, seen))
          break;
        seen = payload.issues.length;
      }
      if (key === "__proto__")
        continue;
      const el = shape[key];
      const optin = el._zod.optin;
      const optout = el._zod.optout;
      const r = el._zod.run({ value: input[key], issues: [] }, ctx);
      if (r instanceof Promise) {
        proms.push(r.then((r2) => handlePropertyResult(r2, payload, key, input, optin, optout)));
      } else {
        handlePropertyResult(r, payload, key, input, optin, optout);
      }
    }
    if (!catchall) {
      return proms.length ? Promise.all(proms).then(() => payload) : payload;
    }
    return handleCatchall(proms, input, payload, ctx, _normalized.value, inst, abortEarly === true);
  };
});
function handleUnionResults(results, final, inst, ctx) {
  for (const result of results) {
    if (result.issues.length === 0) {
      final.value = result.value;
      return final;
    }
  }
  const nonaborted = results.filter((r) => !aborted(r));
  if (nonaborted.length === 1) {
    final.value = nonaborted[0].value;
    return nonaborted[0];
  }
  final.issues.push({
    code: "invalid_union",
    input: final.value,
    inst,
    errors: results.map((result) => result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
  });
  return final;
}
var $ZodUnion = /* @__PURE__ */ $constructor("$ZodUnion", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazyInternal(inst, "optin", (zod) => zod.def.options.some((o) => o._zod.optin === "defaulted") ? "defaulted" : zod.def.options.some((o) => o._zod.optin !== void 0) ? "optional" : void 0);
  defineLazyInternal(inst, "optout", (zod) => zod.def.options.some((o) => o._zod.optout === "optional") ? "optional" : void 0);
  defineLazyInternal(inst, "values", (zod) => {
    if (zod.def.options.every((o) => o._zod.values)) {
      return new Set(zod.def.options.flatMap((option) => Array.from(option._zod.values)));
    }
    return void 0;
  });
  defineLazyInternal(inst, "pattern", (zod) => {
    if (zod.def.options.every((o) => o._zod.pattern)) {
      const patterns = zod.def.options.map((o) => o._zod.pattern);
      return new RegExp(`^(${patterns.map((p) => cleanRegex(p.source)).join("|")})$`);
    }
    return void 0;
  });
  const first = def.options.length === 1 ? def.options[0]._zod.run : null;
  inst._zod.parse = (payload, ctx) => {
    if (first) {
      return first(payload, ctx);
    }
    let async = false;
    const results = [];
    for (const option of def.options) {
      const result = option._zod.run({
        value: payload.value,
        issues: []
      }, ctx);
      if (result instanceof Promise) {
        results.push(result);
        async = true;
      } else {
        if (result.issues.length === 0)
          return result;
        results.push(result);
      }
    }
    if (!async)
      return handleUnionResults(results, payload, inst, ctx);
    return Promise.all(results).then((results2) => {
      return handleUnionResults(results2, payload, inst, ctx);
    });
  };
});
function discriminatorMap(def) {
  const map = /* @__PURE__ */ new Map();
  for (const option of def.options) {
    const values = option._zod.propValues?.[def.discriminator];
    if (!values || values.size === 0)
      throw new Error(`Invalid discriminated union option at index "${def.options.indexOf(option)}"`);
    for (const value of values) {
      if (map.has(value)) {
        if (value !== void 0)
          throw new Error(`Duplicate discriminator value "${String(value)}"`);
        map.set(value, null);
      } else {
        map.set(value, option);
      }
    }
  }
  return map;
}
var $ZodDiscriminatedUnion = /* @__PURE__ */ $constructor("$ZodDiscriminatedUnion", (inst, def) => {
  def.inclusive = false;
  $ZodUnion.init(inst, def);
  const _super = inst._zod.parse;
  defineLazyInternal(inst, "propValues", (zod) => {
    const propValues = {};
    let undefinedCount = 0;
    for (const option of zod.def.options) {
      const pv = option._zod.propValues;
      if (!pv || Object.keys(pv).length === 0)
        throw new Error(`Invalid discriminated union option at index "${zod.def.options.indexOf(option)}"`);
      if (pv[zod.def.discriminator]?.has(void 0))
        undefinedCount++;
      for (const [k, v] of Object.entries(pv)) {
        if (!Object.prototype.hasOwnProperty.call(propValues, k)) {
          assignProp(propValues, k, /* @__PURE__ */ new Set());
        }
        for (const val of v) {
          propValues[k].add(val);
        }
      }
    }
    if (!zod.def.unionFallback && undefinedCount > 1)
      propValues[zod.def.discriminator]?.delete(void 0);
    return propValues;
  });
  def.options.forEach((option, i) => {
    const propShape = rawShape(option._zod.def);
    if (propShape && !Object.prototype.hasOwnProperty.call(propShape, def.discriminator)) {
      throw new Error(`Invalid discriminated union option at index "${i}"`);
    }
  });
  const disc = cached(() => discriminatorMap(def));
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    if (!isObject(input)) {
      payload.issues.push({
        code: "invalid_type",
        expected: "object",
        input,
        inst
      });
      return payload;
    }
    const value = input?.[def.discriminator];
    const opt = disc.value.get(value);
    if (opt && (value !== void 0 || ctx.direction !== "backward")) {
      return opt._zod.run(payload, ctx);
    }
    if (def.unionFallback || ctx.direction === "backward") {
      return _super(payload, ctx);
    }
    payload.issues.push({
      code: "invalid_union",
      errors: [],
      note: "No matching discriminator",
      discriminator: def.discriminator,
      options: Array.from(disc.value.keys()).filter((value2) => disc.value.get(value2) !== null),
      input,
      path: [def.discriminator],
      inst
    });
    return payload;
  };
});
var $ZodRecord = /* @__PURE__ */ $constructor("$ZodRecord", (inst, def) => {
  $ZodType.init(inst, def);
  const memo = globalConfig.memoizer;
  memo?.attach(inst);
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    if (!isPlainObject2(input)) {
      payload.issues.push({
        expected: "record",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    }
    const proms = [];
    const values = def.keyType._zod.values;
    if (values && !def.partial) {
      payload.value = memo ? memo.alloc(inst, payload, {}, ctx) : {};
      const recordKeys = /* @__PURE__ */ new Set();
      for (const key of values) {
        if (typeof key === "string" || typeof key === "number" || typeof key === "symbol") {
          recordKeys.add(typeof key === "number" ? key.toString() : key);
          if (key === "__proto__")
            continue;
          const keyResult = def.keyType._zod.run({ value: key, issues: [] }, ctx);
          if (keyResult instanceof Promise) {
            throw new Error("Async schemas not supported in object keys currently");
          }
          if (keyResult.issues.length) {
            payload.issues.push({
              code: "invalid_key",
              origin: "record",
              issues: keyResult.issues.map((iss) => finalizeIssue(iss, ctx, config())),
              input: key,
              path: [key],
              inst
            });
            continue;
          }
          const outKey = keyResult.value;
          if (outKey === "__proto__")
            continue;
          const result = def.valueType._zod.run({ value: input[key], issues: [] }, ctx);
          if (result instanceof Promise) {
            proms.push(result.then((result2) => {
              if (result2.issues.length) {
                payload.issues.push(...prefixIssues(key, result2.issues));
              }
              payload.value[outKey] = result2.value;
            }));
          } else {
            if (result.issues.length) {
              payload.issues.push(...prefixIssues(key, result.issues));
            }
            payload.value[outKey] = result.value;
          }
        }
      }
      let unrecognized;
      for (const key in input) {
        if (!recordKeys.has(key)) {
          if (def.mode === "loose") {
            if (key === "__proto__")
              continue;
            payload.value[key] = input[key];
          } else {
            unrecognized = unrecognized ?? [];
            unrecognized.push(key);
          }
        }
      }
      if (unrecognized && unrecognized.length > 0) {
        payload.issues.push({
          code: "unrecognized_keys",
          input,
          inst,
          keys: unrecognized,
          continue: true
        });
      }
    } else {
      payload.value = memo ? memo.alloc(inst, payload, {}, ctx) : {};
      let unrecognized;
      for (const key of Reflect.ownKeys(input)) {
        if (key === "__proto__")
          continue;
        if (!Object.prototype.propertyIsEnumerable.call(input, key))
          continue;
        let keyResult = def.keyType._zod.run({ value: key, issues: [] }, ctx);
        if (keyResult instanceof Promise) {
          throw new Error("Async schemas not supported in object keys currently");
        }
        const checkNumericKey = typeof key === "string" && number.test(key) && keyResult.issues.length;
        if (checkNumericKey) {
          const retryResult = def.keyType._zod.run({ value: Number(key), issues: [] }, ctx);
          if (retryResult instanceof Promise) {
            throw new Error("Async schemas not supported in object keys currently");
          }
          if (retryResult.issues.length === 0) {
            keyResult = retryResult;
          }
        }
        if (keyResult.issues.length) {
          if (def.mode === "loose") {
            payload.value[key] = input[key];
          } else if (values) {
            unrecognized = unrecognized ?? [];
            unrecognized.push(key);
          } else {
            payload.issues.push({
              code: "invalid_key",
              origin: "record",
              issues: keyResult.issues.map((iss) => finalizeIssue(iss, ctx, config())),
              input: key,
              path: [key],
              inst
            });
          }
          continue;
        }
        const outKey = keyResult.value;
        if (outKey === "__proto__")
          continue;
        const result = def.valueType._zod.run({ value: input[key], issues: [] }, ctx);
        if (result instanceof Promise) {
          proms.push(result.then((result2) => {
            if (result2.issues.length) {
              payload.issues.push(...prefixIssues(key, result2.issues));
            }
            payload.value[outKey] = result2.value;
          }));
        } else {
          if (result.issues.length) {
            payload.issues.push(...prefixIssues(key, result.issues));
          }
          payload.value[outKey] = result.value;
        }
      }
      if (unrecognized && unrecognized.length > 0) {
        payload.issues.push({
          code: "unrecognized_keys",
          input,
          inst,
          keys: unrecognized,
          continue: true
        });
      }
    }
    if (proms.length) {
      return Promise.all(proms).then(() => payload);
    }
    return payload;
  };
});
var $ZodEnum = /* @__PURE__ */ $constructor("$ZodEnum", (inst, def) => {
  $ZodType.init(inst, def);
  const values = getEnumValues(def.entries);
  const valuesSet = new Set(values);
  inst._zod.values = valuesSet;
  defineLazyInternal(inst, "pattern", (zod) => {
    const patternValues = getEnumValues(zod.def.entries).filter((k) => propertyKeyTypes.has(typeof k));
    return new RegExp(patternValues.length ? `^(${patternValues.map((o) => escapeRegex(o.toString())).join("|")})$` : "^[^\\s\\S]$");
  });
  inst._zod.parse = (payload, _ctx) => {
    const input = payload.value;
    if (valuesSet.has(input)) {
      return payload;
    }
    payload.issues.push({
      code: "invalid_value",
      values,
      input,
      inst
    });
    return payload;
  };
});
var $ZodLiteral = /* @__PURE__ */ $constructor("$ZodLiteral", (inst, def) => {
  $ZodType.init(inst, def);
  const values = new Set(def.values);
  inst._zod.values = values;
  defineLazyInternal(inst, "pattern", (zod) => {
    const vals = zod.def.values;
    return new RegExp(vals.length ? `^(${vals.map((o) => typeof o === "string" ? escapeRegex(o) : o ? escapeRegex(o.toString()) : String(o)).join("|")})$` : "^[^\\s\\S]$");
  });
  inst._zod.parse = (payload, _ctx) => {
    const input = payload.value;
    if (values.has(input)) {
      return payload;
    }
    payload.issues.push({
      code: "invalid_value",
      values: def.values,
      input,
      inst
    });
    return payload;
  };
});
function handleOptionalResult(payload, result) {
  payload.value = result.issues.length ? void 0 : result.value;
  return payload;
}
var $ZodOptional = /* @__PURE__ */ $constructor("$ZodOptional", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazyInternal(inst, "optin", (zod) => zod.def.innerType._zod.optin === "defaulted" ? "defaulted" : "optional");
  inst._zod.optout = "optional";
  defineLazyInternal(inst, "values", (zod) => {
    const values = zod.def.innerType._zod.values;
    return values ? /* @__PURE__ */ new Set([...values, void 0]) : void 0;
  });
  defineLazyInternal(inst, "pattern", (zod) => {
    const pattern = zod.def.innerType._zod.pattern;
    return pattern ? new RegExp(`^(${cleanRegex(pattern.source)})?$`) : void 0;
  });
  inst._zod.parse = (payload, ctx) => {
    if (payload.value === void 0) {
      if (def.innerType._zod.optin !== "defaulted")
        return payload;
      const result = def.innerType._zod.run({ value: payload.value, issues: [] }, ctx);
      if (result instanceof Promise)
        return result.then((result2) => handleOptionalResult(payload, result2));
      return handleOptionalResult(payload, result);
    }
    return def.innerType._zod.run(payload, ctx);
  };
});
var $ZodNullable = /* @__PURE__ */ $constructor("$ZodNullable", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazyInternal(inst, "optin", (zod) => zod.def.innerType._zod.optin);
  defineLazyInternal(inst, "optout", (zod) => zod.def.innerType._zod.optout);
  defineLazyInternal(inst, "pattern", (zod) => {
    const pattern = zod.def.innerType._zod.pattern;
    return pattern ? new RegExp(`^(${cleanRegex(pattern.source)}|null)$`) : void 0;
  });
  defineLazyInternal(inst, "values", (zod) => {
    return zod.def.innerType._zod.values ? /* @__PURE__ */ new Set([...zod.def.innerType._zod.values, null]) : void 0;
  });
  inst._zod.parse = (payload, ctx) => {
    if (payload.value === null)
      return payload;
    return def.innerType._zod.run(payload, ctx);
  };
});
function handleCatchResult(payload, result, def, ctx) {
  if (!result.issues.length) {
    payload.value = result.value;
    if (result.memo)
      payload.memo = true;
    return payload;
  }
  payload.value = def.catchValue({
    ...result,
    value: payload.value,
    error: {
      issues: result.issues.map((iss) => finalizeIssue(iss, ctx, config()))
    },
    input: payload.value
  });
  return payload;
}
var $ZodCatch = /* @__PURE__ */ $constructor("$ZodCatch", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazyInternal(inst, "optin", (zod) => zod.def.innerType._zod.optin === "defaulted" ? "defaulted" : "optional");
  defineLazyInternal(inst, "optout", (zod) => zod.def.innerType._zod.optout);
  defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      return def.innerType._zod.run(payload, ctx);
    }
    const result = def.innerType._zod.run({ value: payload.value, issues: [] }, ctx);
    if (result instanceof Promise) {
      return result.then((result2) => handleCatchResult(payload, result2, def, ctx));
    }
    return handleCatchResult(payload, result, def, ctx);
  };
});
var $ZodReadonly = /* @__PURE__ */ $constructor("$ZodReadonly", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazyInternal(inst, "propValues", (zod) => zod.def.innerType._zod.propValues);
  defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
  defineLazyInternal(inst, "optin", (zod) => zod.def.innerType?._zod?.optin);
  defineLazyInternal(inst, "optout", (zod) => zod.def.innerType?._zod?.optout);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      return def.innerType._zod.run(payload, ctx);
    }
    const result = def.innerType._zod.run(payload, ctx);
    if (result instanceof Promise) {
      return result.then(handleReadonlyResult);
    }
    return handleReadonlyResult(result);
  };
});
function handleReadonlyResult(payload) {
  if (!payload.memo)
    payload.value = Object.freeze(payload.value);
  return payload;
}

// node_modules/zod/v4/core/api.js
function snapshotChecks(def) {
  if (def.checks)
    def.checks = [...def.checks];
  return def;
}
// @__NO_SIDE_EFFECTS__
function _string(Class2, params) {
  return new Class2(snapshotChecks({ type: "string", ...normalizeParams(params) }));
}
// @__NO_SIDE_EFFECTS__
function _number(Class2, params) {
  return new Class2(snapshotChecks({ type: "number", checks: [], ...normalizeParams(params) }));
}
// @__NO_SIDE_EFFECTS__
function _int(Class2, params) {
  return new Class2({
    type: "number",
    check: "number_format",
    abort: false,
    format: "safeint",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _boolean(Class2, params) {
  return new Class2({
    type: "boolean",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _unknown(Class2) {
  return new Class2({
    type: "unknown"
  });
}
// @__NO_SIDE_EFFECTS__
function _gte(value, params) {
  return new $ZodCheckGreaterThan({
    check: "greater_than",
    ...normalizeParams(params),
    value,
    inclusive: true
  });
}
// @__NO_SIDE_EFFECTS__
function _nonnegative(params) {
  return /* @__PURE__ */ _gte(0, params);
}

// node_modules/zod/v4/mini/schemas.js
var ZodMiniType = /* @__PURE__ */ $constructor("ZodMiniType", (inst, def) => {
  if (!inst._zod)
    throw new Error("Uninitialized schema in ZodMiniType.");
  $ZodType.init(inst, def);
  inst.def = def;
  inst.type = def.type;
}, {
  // `with` is an alias for `check`: the same function object, not a wrapper.
  get with() {
    return this.check;
  },
  set with(value) {
    own(this, "with", value);
  },
  parse(data, params) {
    return parse(this, data, params, { callee: this.parse });
  },
  parseAsync(data, params) {
    return parseAsync(this, data, params, { callee: this.parseAsync });
  },
  safeParse(data, params) {
    return safeParse(this, data, params);
  },
  safeParseAsync(data, params) {
    return safeParseAsync(this, data, params);
  },
  check(...checks) {
    const def = this.def;
    return this.clone({
      ...def,
      checks: [
        ...def.checks ?? [],
        ...checks.map((ch) => typeof ch === "function" ? { _zod: { check: ch, def: { check: "custom" }, onattach: [] } } : ch)
      ]
    }, { parent: true });
  },
  clone(_def, params) {
    return clone(this, _def, params);
  },
  brand() {
    return this;
  },
  register(reg, meta2) {
    reg.add(this, meta2);
    return this;
  },
  apply(fn, ...args) {
    return args.length === 0 ? fn(this) : fn(this, ...args);
  }
});
var ZodMiniString = /* @__PURE__ */ $constructor("ZodMiniString", (inst, def) => {
  $ZodString.init(inst, def);
  ZodMiniType.init(inst, def);
});
// @__NO_SIDE_EFFECTS__
function string2(params) {
  return _string(ZodMiniString, params);
}
var ZodMiniNumber = /* @__PURE__ */ $constructor("ZodMiniNumber", (inst, def) => {
  $ZodNumber.init(inst, def);
  ZodMiniType.init(inst, def);
});
// @__NO_SIDE_EFFECTS__
function number2(params) {
  return _number(ZodMiniNumber, params);
}
var ZodMiniNumberFormat = /* @__PURE__ */ $constructor("ZodMiniNumberFormat", (inst, def) => {
  $ZodNumberFormat.init(inst, def);
  ZodMiniNumber.init(inst, def);
});
function int(params) {
  return _int(ZodMiniNumberFormat, params);
}
var ZodMiniBoolean = /* @__PURE__ */ $constructor("ZodMiniBoolean", (inst, def) => {
  $ZodBoolean.init(inst, def);
  ZodMiniType.init(inst, def);
});
// @__NO_SIDE_EFFECTS__
function boolean2(params) {
  return _boolean(ZodMiniBoolean, params);
}
var ZodMiniUnknown = /* @__PURE__ */ $constructor("ZodMiniUnknown", (inst, def) => {
  $ZodUnknown.init(inst, def);
  ZodMiniType.init(inst, def);
});
// @__NO_SIDE_EFFECTS__
function unknown() {
  return _unknown(ZodMiniUnknown);
}
var ZodMiniArray = /* @__PURE__ */ $constructor("ZodMiniArray", (inst, def) => {
  $ZodArray.init(inst, def);
  ZodMiniType.init(inst, def);
});
// @__NO_SIDE_EFFECTS__
function array(element, params) {
  return new ZodMiniArray({
    type: "array",
    element,
    ...normalizeParams(params)
  });
}
var ZodMiniObject = /* @__PURE__ */ $constructor("ZodMiniObject", (inst, def) => {
  $ZodObject.init(inst, def);
  ZodMiniType.init(inst, def);
  installLazyProp(inst, "shape", (self) => self._zod.def.shape, false);
});
// @__NO_SIDE_EFFECTS__
function object(shape, params) {
  const def = {
    type: "object",
    shape: shape ?? {},
    ...normalizeParams(params)
  };
  return new ZodMiniObject(def);
}
var ZodMiniUnion = /* @__PURE__ */ $constructor("ZodMiniUnion", (inst, def) => {
  $ZodUnion.init(inst, def);
  ZodMiniType.init(inst, def);
});
// @__NO_SIDE_EFFECTS__
function union(options, params) {
  return new ZodMiniUnion({
    type: "union",
    options,
    ...normalizeParams(params)
  });
}
var ZodMiniDiscriminatedUnion = /* @__PURE__ */ $constructor("ZodMiniDiscriminatedUnion", (inst, def) => {
  $ZodDiscriminatedUnion.init(inst, def);
  ZodMiniType.init(inst, def);
});
// @__NO_SIDE_EFFECTS__
function discriminatedUnion(discriminator, options, params) {
  return new ZodMiniDiscriminatedUnion({
    type: "union",
    options,
    discriminator,
    ...normalizeParams(params)
  });
}
var ZodMiniRecord = /* @__PURE__ */ $constructor("ZodMiniRecord", (inst, def) => {
  $ZodRecord.init(inst, def);
  ZodMiniType.init(inst, def);
});
// @__NO_SIDE_EFFECTS__
function record(keyType, valueType, params) {
  if (!valueType || !valueType._zod) {
    return new ZodMiniRecord({
      type: "record",
      keyType: /* @__PURE__ */ string2(),
      valueType: keyType,
      ...normalizeParams(valueType)
    });
  }
  return new ZodMiniRecord({
    type: "record",
    keyType,
    valueType,
    ...normalizeParams(params)
  });
}
var ZodMiniEnum = /* @__PURE__ */ $constructor("ZodMiniEnum", (inst, def) => {
  $ZodEnum.init(inst, def);
  ZodMiniType.init(inst, def);
  inst.options = [...inst._zod.values];
});
// @__NO_SIDE_EFFECTS__
function _enum(values, params) {
  const entries = Array.isArray(values) ? Object.fromEntries(values.map((v) => [v, v])) : values;
  return new ZodMiniEnum({
    type: "enum",
    entries,
    ...normalizeParams(params)
  });
}
var ZodMiniLiteral = /* @__PURE__ */ $constructor("ZodMiniLiteral", (inst, def) => {
  $ZodLiteral.init(inst, def);
  ZodMiniType.init(inst, def);
});
// @__NO_SIDE_EFFECTS__
function literal(value, params) {
  return new ZodMiniLiteral({
    type: "literal",
    values: Array.isArray(value) ? value : [value],
    ...normalizeParams(params)
  });
}
var ZodMiniOptional = /* @__PURE__ */ $constructor("ZodMiniOptional", (inst, def) => {
  $ZodOptional.init(inst, def);
  ZodMiniType.init(inst, def);
});
// @__NO_SIDE_EFFECTS__
function optional(innerType) {
  return new ZodMiniOptional({
    type: "optional",
    innerType
  });
}
var ZodMiniNullable = /* @__PURE__ */ $constructor("ZodMiniNullable", (inst, def) => {
  $ZodNullable.init(inst, def);
  ZodMiniType.init(inst, def);
});
// @__NO_SIDE_EFFECTS__
function nullable(innerType) {
  return new ZodMiniNullable({
    type: "nullable",
    innerType
  });
}
// @__NO_SIDE_EFFECTS__
function nullish2(innerType) {
  return /* @__PURE__ */ optional(/* @__PURE__ */ nullable(innerType));
}
var ZodMiniCatch = /* @__PURE__ */ $constructor("ZodMiniCatch", (inst, def) => {
  $ZodCatch.init(inst, def);
  ZodMiniType.init(inst, def);
});
// @__NO_SIDE_EFFECTS__
function _catch(innerType, catchValue) {
  return new ZodMiniCatch({
    type: "catch",
    innerType,
    catchValue: typeof catchValue === "function" ? catchValue : util_exports.constantCatch(catchValue)
  });
}
var ZodMiniReadonly = /* @__PURE__ */ $constructor("ZodMiniReadonly", (inst, def) => {
  $ZodReadonly.init(inst, def);
  ZodMiniType.init(inst, def);
});
// @__NO_SIDE_EFFECTS__
function readonly(innerType) {
  return new ZodMiniReadonly({
    type: "readonly",
    innerType
  });
}

// src/core/transcripts/prompts.ts
var TRANSCRIPT_PREFIX = "t:";
var looseString = _catch(nullish2(string2()), null);
var looseBoolean = _catch(nullish2(boolean2()), null);
var origin = _catch(nullish2(object({ kind: string2() })), null);
var block = object({ type: string2(), text: _catch(nullish2(string2()), null) });
var userSchema = object({
  type: literal("user"),
  uuid: looseString,
  timestamp: looseString,
  isMeta: looseBoolean,
  isCompactSummary: looseBoolean,
  isSidechain: looseBoolean,
  entrypoint: looseString,
  origin,
  message: object({ content: union([string2(), array(block)]) })
});
var queuedSchema = object({
  type: literal("attachment"),
  uuid: looseString,
  timestamp: looseString,
  attachment: object({
    type: literal("queued_command"),
    prompt: string2(),
    commandMode: looseString,
    isMeta: looseBoolean,
    origin
  })
});
var recordSchema = discriminatedUnion("type", [userSchema, queuedSchema]);
var MACHINE_PREFIXES = [
  "<command-",
  "<local-command-",
  "<bash-",
  "<task-notification>",
  "<agent-message",
  "<user-prompt-submit-hook>",
  "[Request interrupted",
  "[Subagent hand-back]",
  "Caveat: The messages below",
  "This session is being continued from a previous conversation",
  "Another Claude session sent a message",
  "The app was quit while you were working"
];
var MACHINE_MARKERS = ["<task-notification>", "<agent-message"];
var REMINDER = /<system-reminder>.*?(?:<\/system-reminder>|$)/gsu;
function typedText(raw) {
  const text = raw.replaceAll(REMINDER, "").trim();
  if (text === "") {
    return null;
  }
  const machine = MACHINE_PREFIXES.some((prefix) => text.startsWith(prefix)) || MACHINE_MARKERS.some((marker) => text.includes(marker));
  return machine ? null : text;
}
function parseJson(line) {
  try {
    const value = JSON.parse(line);
    return value;
  } catch {
    return null;
  }
}
function fromPerson(kind, entrypoint) {
  if (kind !== void 0) {
    return kind === "human";
  }
  return !(entrypoint ?? "").startsWith("sdk");
}
function userText(record2) {
  const flagged = record2.isMeta === true || record2.isCompactSummary === true || record2.isSidechain === true;
  if (flagged || !fromPerson(record2.origin?.kind, record2.entrypoint)) {
    return null;
  }
  const { content } = record2.message;
  if (typeof content === "string") {
    return content;
  }
  if (content.some((part) => part.type !== "text")) {
    return null;
  }
  return content.map((part) => part.text ?? "").join("\n");
}
function queuedText(record2) {
  const { attachment } = record2;
  const typed = attachment.commandMode === "prompt" && attachment.isMeta !== true && (attachment.origin?.kind ?? "human") === "human";
  return typed ? attachment.prompt : null;
}
function shortHash(...parts) {
  return (0, import_node_crypto.createHash)("sha256").update(parts.join("\n")).digest("hex").slice(0, 24);
}
function worthParsing(line) {
  if (line.includes('"queued_command"')) {
    return true;
  }
  return line.includes('"type":"user"') && !line.includes('"tool_use_id"');
}
function promptFrom(line, source) {
  const parsed = recordSchema.safeParse(parseJson(line));
  if (!parsed.success) {
    return null;
  }
  const record2 = parsed.data;
  const raw = record2.type === "user" ? userText(record2) : queuedText(record2);
  const text = raw === null ? null : typedText(raw);
  if (text === null) {
    return null;
  }
  const at = Date.parse(record2.timestamp ?? "");
  const key = record2.uuid ?? shortHash(source.sessionId, record2.timestamp ?? "", text);
  return {
    id: `${TRANSCRIPT_PREFIX}${key}`,
    sessionId: source.sessionId,
    at: Number.isNaN(at) ? source.fallbackAt : at,
    text
  };
}
function transcriptPrompts(lines, source) {
  const prompts = [];
  for (const line of lines) {
    const prompt = worthParsing(line) ? promptFrom(line, source) : null;
    if (prompt !== null) {
      prompts.push(prompt);
    }
  }
  return prompts;
}

// src/core/transcripts/pricing.ts
var DEFAULT_PRICES = {
  "claude-fable-5-1": { input: 10, output: 50, cacheRead: 0.25, cacheWrite: 12.5 },
  "claude-fable-5": { input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 },
  "claude-mythos-5-1": { input: 10, output: 50, cacheRead: 0.25, cacheWrite: 12.5 },
  "claude-mythos-5": { input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-opus-4-7": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-opus-4-6": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-opus-4-5": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-sonnet-4-6": { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  "claude-sonnet-4-5": { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 }
};
var SUFFIX = /^(?:$|\[|@|-\d{8}(?:$|\[|@))/u;
function bareModelId(model) {
  const at = model.indexOf("claude-");
  return at > 0 ? model.slice(at) : model;
}
function findPrice(model, table) {
  const id = bareModelId(model);
  let best = null;
  for (const [key, price] of Object.entries(table)) {
    const fits = id.startsWith(key) && SUFFIX.test(id.slice(key.length));
    if (fits && (best === null || key.length > best.key.length)) {
      best = { key, price };
    }
  }
  return best?.price ?? null;
}

// src/core/transcripts/schemas.ts
var looseString2 = _catch(nullish2(string2()), null);
var looseBoolean2 = _catch(nullish2(boolean2()), null);
var count = _catch(number2().check(_nonnegative()), 0);
var stringList = _catch(array(string2()), []);
var baseFields = {
  uuid: looseString2,
  timestamp: looseString2,
  sessionId: looseString2,
  cwd: looseString2,
  gitBranch: looseString2,
  version: looseString2,
  entrypoint: looseString2,
  isSidechain: looseBoolean2,
  agentId: looseString2
};
var resultPart = object({
  type: _catch(string2(), "other"),
  text: looseString2
});
var OTHER_PART = { type: "other", text: null };
var OTHER_BLOCK = { type: "other" };
var lenientPart = _catch(resultPart, OTHER_PART);
var toolResultContentSchema = _catch(union([string2(), array(lenientPart)]), "");
var contentBlockSchema = _catch(
  discriminatedUnion("type", [
    object({ type: literal("text"), text: string2() }),
    object({ type: literal("thinking"), thinking: _catch(string2(), "") }),
    object({
      type: literal("tool_use"),
      id: string2(),
      name: string2(),
      input: unknown()
    }),
    object({
      type: literal("tool_result"),
      tool_use_id: string2(),
      is_error: looseBoolean2,
      content: toolResultContentSchema
    }),
    object({ type: literal("other") })
  ]),
  OTHER_BLOCK
);
var usageSchema = object({
  input_tokens: count,
  output_tokens: count,
  cache_read_input_tokens: count,
  cache_creation_input_tokens: count,
  output_tokens_details: _catch(nullish2(object({ thinking_tokens: count })), null)
});
var userRecordSchema = object({
  type: literal("user"),
  ...baseFields,
  isMeta: looseBoolean2,
  isCompactSummary: looseBoolean2,
  permissionMode: looseString2,
  message: object({
    content: _catch(union([string2(), array(contentBlockSchema)]), "")
  }),
  toolUseResult: _catch(nullish2(object({ status: looseString2 })), null)
});
var assistantRecordSchema = object({
  type: literal("assistant"),
  ...baseFields,
  requestId: looseString2,
  effort: looseString2,
  message: object({
    id: string2(),
    model: _catch(string2(), "unknown"),
    stop_reason: looseString2,
    usage: _catch(nullish2(usageSchema), null),
    content: _catch(array(contentBlockSchema), [])
  })
});
var systemRecordSchema = object({
  type: literal("system"),
  ...baseFields,
  subtype: looseString2,
  content: looseString2
});
var memoryFileSchema = object({
  path: string2(),
  type: string2(),
  content: _catch(string2(), "")
});
var attachmentSchema = discriminatedUnion("type", [
  object({
    type: literal("instructions"),
    files: array(memoryFileSchema),
    removed: stringList,
    reason: looseString2
  }),
  object({
    type: literal("nested_memory"),
    path: string2(),
    content: object({
      path: looseString2,
      type: string2(),
      content: _catch(string2(), ""),
      contentDiffersFromDisk: looseBoolean2
    })
  }),
  object({ type: literal("prompt_snapshot"), systemPrompt: array(string2()) }),
  object({
    type: literal("skill_listing"),
    names: stringList,
    content: _catch(string2(), "")
  }),
  object({
    type: literal("invoked_skills"),
    skills: array(object({ name: string2(), path: looseString2 }))
  }),
  object({
    type: literal("mcp_instructions_delta"),
    addedNames: stringList,
    addedBlocks: stringList,
    removedNames: stringList
  }),
  object({
    type: literal("deferred_tools_delta"),
    addedNames: stringList,
    removedNames: stringList
  }),
  object({
    type: literal("agent_listing_delta"),
    addedTypes: stringList,
    removedTypes: stringList
  }),
  object({ type: literal("environment"), snapshot: record(string2(), unknown()) }),
  object({ type: literal("model"), identity: object({ modelId: string2() }) }),
  object({ type: literal("queued_command"), prompt: _catch(string2(), "") })
]);
var attachmentRecordSchema = object({
  type: literal("attachment"),
  ...baseFields,
  attachment: attachmentSchema
});
var transcriptRecordSchema = discriminatedUnion("type", [
  userRecordSchema,
  assistantRecordSchema,
  systemRecordSchema,
  attachmentRecordSchema,
  object({ type: literal("permission-mode"), permissionMode: string2() }),
  object({ type: literal("ai-title"), aiTitle: string2() }),
  object({ type: literal("custom-title"), customTitle: string2() }),
  object({ type: literal("last-prompt"), lastPrompt: _catch(string2(), "") })
]);
function parseJson2(line) {
  try {
    const value = JSON.parse(line);
    return value;
  } catch {
    return null;
  }
}
function parseTranscriptLine(line) {
  const result = transcriptRecordSchema.safeParse(parseJson2(line));
  return result.success ? result.data : null;
}
function parseTimestamp(value) {
  const ms = Date.parse(value ?? "");
  return Number.isNaN(ms) ? null : ms;
}

// src/core/transcripts/text.ts
function resultText(content) {
  if (typeof content === "string") {
    return content;
  }
  const parts = [];
  for (const part of content) {
    if (part.type === "text" && typeof part.text === "string") {
      parts.push(part.text);
    }
  }
  return parts.join("\n");
}

// src/core/tuning/spend.ts
var CHARS_PER_TOKEN = 3.6;
var SPEND_SOURCES = [
  "setup",
  "instructions",
  "skills",
  "reminders",
  "fileReads",
  "toolOutput",
  "web",
  "toolInputs",
  "subagentReports",
  "conversation",
  "output"
];
var SPEND_LABELS = {
  setup: "System prompt and tool definitions",
  instructions: "CLAUDE.md and memory",
  skills: "Skills",
  reminders: "Hooks and reminders",
  fileReads: "Reading files",
  toolOutput: "Command and search output",
  web: "Web and connectors",
  toolInputs: "Code and commands Claude wrote",
  subagentReports: "Subagent reports",
  conversation: "Prompts, replies and thinking",
  output: "Writing replies (output tokens)"
};
function zeroSpend() {
  return {
    setup: 0,
    instructions: 0,
    skills: 0,
    reminders: 0,
    fileReads: 0,
    toolOutput: 0,
    web: 0,
    toolInputs: 0,
    subagentReports: 0,
    conversation: 0,
    output: 0
  };
}
function addSpend(left, right) {
  const sum2 = zeroSpend();
  for (const source of SPEND_SOURCES) {
    sum2[source] = left[source] + right[source];
  }
  return sum2;
}
function skillName(folder) {
  const parts = folder.split("/").filter((part) => part !== "");
  return parts.at(-1) ?? folder;
}

// src/core/tuning/pieces.ts
var LABEL_CHARS = 100;
var SKILL_BODY = "Base directory for this skill:";
var FILE_COMMANDS = /* @__PURE__ */ new Set(["cat", "head", "tail", "nl", "less", "bat"]);
var PATH_CHARS = /^[\w./~-]+$/u;
var EXTENSION = /^[A-Za-z]\w{0,5}$/u;
function talk(label, chars) {
  return { source: "conversation", label, chars, file: null, skill: null };
}
function oneLine(text) {
  const flat = text.replaceAll(/\s+/gu, " ").trim();
  return flat.length > LABEL_CHARS ? `${flat.slice(0, LABEL_CHARS - 3)}...` : flat;
}
function asString(value) {
  return typeof value === "string" ? value : null;
}
function field(value, key) {
  return isPlainObject(value) ? value[key] : void 0;
}
function textLength(content) {
  if (typeof content === "string") {
    return content.length;
  }
  if (!isArray(content)) {
    return 0;
  }
  let total = 0;
  for (const part of content) {
    total += typeof part === "string" ? part.length : asString(field(part, "text"))?.length ?? 0;
  }
  return total;
}
function afterCd(command) {
  const trimmed = command.trimStart();
  if (!trimmed.startsWith("cd ")) {
    return trimmed;
  }
  const and = trimmed.indexOf("&&");
  const semi = trimmed.indexOf(";");
  const cut = [and, semi].filter((at) => at >= 0).toSorted((left, right) => left - right)[0];
  if (cut === void 0) {
    return "";
  }
  return trimmed.slice(cut + (cut === and ? 2 : 1)).trimStart();
}
function dumpsFiles(command) {
  const [first, second] = afterCd(command).split(/\s+/u);
  return first !== void 0 && (FILE_COMMANDS.has(first) || first === "sed" && second === "-n");
}
function filesIn(command) {
  return command.split(/[\s"&'();<>`|]+/u).filter((word) => {
    const dot = word.lastIndexOf(".");
    return dot > 0 && dot > word.lastIndexOf("/") && PATH_CHARS.test(word) && EXTENSION.test(word.slice(dot + 1));
  });
}
var INSTRUCTION_ATTACHMENTS = /* @__PURE__ */ new Set([
  "instructions",
  "nested_memory",
  "memory",
  "claude_md",
  "relevant_memories"
]);
var SKILL_ATTACHMENTS = /* @__PURE__ */ new Set(["skill_listing", "invoked_skills"]);
var FILE_ATTACHMENTS = /* @__PURE__ */ new Set(["edited_text_file", "file"]);
function attachmentSource(type) {
  if (INSTRUCTION_ATTACHMENTS.has(type)) {
    return "instructions";
  }
  if (SKILL_ATTACHMENTS.has(type)) {
    return "skills";
  }
  return FILE_ATTACHMENTS.has(type) ? "fileReads" : "reminders";
}
function resultSource(tool, command) {
  if (tool === "Read" || tool === "Bash" && dumpsFiles(command)) {
    return "fileReads";
  }
  if (tool === "Agent" || tool === "Task") {
    return "subagentReports";
  }
  if (tool === "WebFetch" || tool === "WebSearch" || tool.startsWith("mcp__")) {
    return "web";
  }
  return "toolOutput";
}
function callDetail(input) {
  for (const key of ["file_path", "command", "pattern", "url", "query", "skill", "description"]) {
    const value = asString(field(input, key));
    if (value !== null) {
      return value;
    }
  }
  return "";
}
function textPiece(text, meta2) {
  if (text.startsWith(SKILL_BODY)) {
    const skill = text.slice(SKILL_BODY.length).trimStart().split(/\s/u, 1)[0] ?? "";
    const label = `skill ${skillName(skill)}`;
    return { source: "skills", label, chars: text.length, file: null, skill };
  }
  if (text.startsWith("<system-reminder>") && text.includes("Contents of ")) {
    return {
      source: "instructions",
      label: "CLAUDE.md",
      chars: text.length,
      file: null,
      skill: null
    };
  }
  return meta2 ? { source: "reminders", label: "reminder", chars: text.length, file: null, skill: null } : talk("prompt", text.length);
}
function attachmentPiece(record2) {
  const attachment = field(record2, "attachment");
  const type = asString(field(attachment, "type")) ?? "attachment";
  const rendered = field(record2, "rendered");
  let chars = 0;
  for (const part of isArray(rendered) ? rendered : []) {
    chars += asString(field(part, "content"))?.length ?? 0;
  }
  if (chars === 0 && type === "hook_additional_context") {
    chars = textLength(field(attachment, "content"));
  }
  const label = asString(field(attachment, "hookName")) ?? type.replaceAll("_", " ");
  const file = FILE_ATTACHMENTS.has(type) ? asString(field(attachment, "filename")) : null;
  return { source: attachmentSource(type), label: oneLine(label), chars, file, skill: null };
}

// src/core/tuning/attribute.ts
var HEAVY_ITEMS = 6;
var TOP_FILES = 12;
function bump(map, key, by) {
  map.set(key, (map.get(key) ?? 0) + by);
}
function readShape(shape) {
  const tools = /* @__PURE__ */ new Map();
  const list = field(shape, "tools");
  for (const tool of isArray(list) ? list : []) {
    const name = asString(field(tool, "name"));
    if (name !== null) {
      tools.set(name, JSON.stringify(tool).length);
    }
  }
  return { systemChars: JSON.stringify(field(shape, "system") ?? "").length, tools };
}
function tokenCount(usage, key) {
  const value = usage[key];
  return typeof value === "number" ? value : 0;
}
function filesOf(call) {
  return call.name === "Read" ? [call.detail] : filesIn(call.detail);
}
var Tally = class {
  constructor(prices) {
    this.prices = prices;
  }
  prices;
  spend = zeroSpend();
  files = /* @__PURE__ */ new Map();
  skills = /* @__PURE__ */ new Map();
  toolSchemas = /* @__PURE__ */ new Map();
  toolUses = /* @__PURE__ */ new Map();
  heavy = [];
  live = [];
  liveChars = 0;
  /** Sum over requests of the input cost each character of context took. */
  perChar = 0;
  setupTokens = null;
  shape = null;
  calls = /* @__PURE__ */ new Map();
  seen = /* @__PURE__ */ new Set();
  record(record2) {
    switch (asString(field(record2, "type")) ?? "") {
      case "assistant": {
        this.assistant(field(record2, "message"));
        break;
      }
      case "user": {
        this.user(record2);
        break;
      }
      case "attachment": {
        this.add(attachmentPiece(record2));
        break;
      }
      case "api-request-shape": {
        this.shape = readShape(field(record2, "shape"));
        break;
      }
      case "system": {
        if (field(record2, "subtype") === "compact_boundary") {
          this.dropAll();
        }
        break;
      }
      default:
    }
  }
  dropAll() {
    for (const item of this.live) {
      this.settle(item);
    }
    this.live = [];
    this.liveChars = 0;
  }
  add(piece) {
    if (piece.chars > 0) {
      this.live.push({ ...piece, born: this.perChar });
      this.liveChars += piece.chars;
    }
  }
  settle(item) {
    const usd2 = item.chars * (this.perChar - item.born);
    if (usd2 <= 0) {
      return;
    }
    this.spend[item.source] += usd2;
    if (item.file !== null) {
      bump(this.files, item.file, usd2);
    }
    if (item.skill !== null) {
      bump(this.skills, item.skill, usd2);
    }
    const smallest = this.heavy.at(-1);
    if (this.heavy.length < HEAVY_ITEMS || smallest !== void 0 && usd2 > smallest.usd) {
      const tokens2 = Math.round(item.chars / CHARS_PER_TOKEN);
      this.heavy = [...this.heavy, { source: item.source, label: item.label, tokens: tokens2, usd: usd2 }].toSorted((left, right) => right.usd - left.usd).slice(0, HEAVY_ITEMS);
    }
  }
  assistant(message) {
    const id = asString(field(message, "id"));
    const usage = field(message, "usage");
    if (id !== null && isPlainObject(usage) && !this.seen.has(id)) {
      this.seen.add(id);
      this.request(asString(field(message, "model")) ?? "", usage);
    }
    const content = field(message, "content");
    for (const block2 of isArray(content) ? content : []) {
      this.assistantBlock(block2);
    }
  }
  assistantBlock(block2) {
    switch (field(block2, "type")) {
      case "text": {
        this.add(talk("reply", textLength([block2])));
        break;
      }
      case "thinking": {
        this.add(talk("thinking", asString(field(block2, "thinking"))?.length ?? 0));
        break;
      }
      case "tool_use": {
        this.toolUse(block2);
        break;
      }
      default:
    }
  }
  toolUse(block2) {
    const id = asString(field(block2, "id"));
    if (id === null || this.calls.has(id)) {
      return;
    }
    const name = asString(field(block2, "name")) ?? "tool";
    const input = field(block2, "input");
    const detail = callDetail(input);
    this.calls.set(id, { name, detail });
    bump(this.toolUses, name, 1);
    this.add({
      source: "toolInputs",
      label: oneLine(`${name} ${detail}`),
      chars: JSON.stringify(input ?? {}).length,
      file: null,
      skill: null
    });
  }
  request(model, usage) {
    const price = findPrice(model, this.prices);
    if (price === null) {
      return;
    }
    const input = tokenCount(usage, "input_tokens");
    const cacheRead = tokenCount(usage, "cache_read_input_tokens");
    const cacheWrite = tokenCount(usage, "cache_creation_input_tokens");
    const context = input + cacheRead + cacheWrite;
    const inputUsd2 = (input * price.input + cacheRead * price.cacheRead + cacheWrite * price.cacheWrite) / 1e6;
    this.spend.output += tokenCount(usage, "output_tokens") * price.output / 1e6;
    if (context === 0) {
      return;
    }
    this.setupTokens ??= Math.max(0, context - this.liveChars / CHARS_PER_TOKEN);
    const setup = Math.min(context, this.setupTokens);
    const carried = this.liveChars > 0 ? inputUsd2 * ((context - setup) / context) : 0;
    this.setupCost(inputUsd2 - carried);
    if (carried > 0) {
      this.perChar += carried / this.liveChars;
    }
  }
  setupCost(usd2) {
    this.spend.setup += usd2;
    const { shape } = this;
    if (shape === null) {
      return;
    }
    let whole = shape.systemChars;
    for (const chars of shape.tools.values()) {
      whole += chars;
    }
    for (const [name, chars] of shape.tools) {
      bump(this.toolSchemas, name, usd2 * chars / whole);
    }
  }
  user(record2) {
    const content = field(field(record2, "message"), "content");
    const meta2 = field(record2, "isMeta") === true;
    if (field(record2, "isCompactSummary") === true) {
      this.dropAll();
      this.add(talk("compact summary", textLength(content)));
      return;
    }
    if (typeof content === "string") {
      this.add(textPiece(content, meta2));
      return;
    }
    for (const block2 of isArray(content) ? content : []) {
      const type = field(block2, "type");
      if (type === "tool_result") {
        this.result(block2);
      } else if (type === "text") {
        this.add(textPiece(asString(field(block2, "text")) ?? "", meta2));
      }
    }
  }
  result(block2) {
    const id = asString(field(block2, "tool_use_id")) ?? "";
    const call = this.calls.get(id) ?? { name: "?", detail: "" };
    const source = resultSource(call.name, call.detail);
    const chars = textLength(field(block2, "content"));
    const label = oneLine(`${call.name} ${call.detail}`);
    const files = source === "fileReads" ? filesOf(call) : [];
    if (files.length === 0) {
      this.add({ source, label, chars, file: null, skill: null });
      return;
    }
    for (const file of files) {
      const each = files.length === 1 ? label : oneLine(`${call.name} ${file}`);
      this.add({ source, label: each, chars: chars / files.length, file, skill: null });
    }
  }
};
function topOf(map, count3) {
  return Object.fromEntries([...map].toSorted((left, right) => right[1] - left[1]).slice(0, count3));
}
function attribute(lines, prices) {
  const tally = new Tally(prices);
  for (const line of lines) {
    let record2;
    try {
      record2 = JSON.parse(line);
    } catch {
      continue;
    }
    tally.record(record2);
  }
  tally.dropAll();
  return {
    spend: tally.spend,
    heavy: tally.heavy,
    files: topOf(tally.files, TOP_FILES),
    skills: topOf(tally.skills, TOP_FILES),
    toolSchemas: Object.fromEntries(tally.toolSchemas),
    toolUses: Object.fromEntries(tally.toolUses)
  };
}

// src/core/tuning/cd-target.ts
var import_node_path3 = __toESM(require("node:path"), 1);
var CD = /^\s*cd\s+(?:"([^"]+)"|'([^']+)'|([^\s;&|]+))/u;
function named(command) {
  const match = CD.exec(command);
  const raw = match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
  return raw === null || raw.startsWith("$") || raw.startsWith("-") ? null : raw;
}
function cdTarget(command, cwd) {
  const raw = named(command);
  if (raw === null || cwd === null) {
    return null;
  }
  const target = raw.startsWith("~") ? raw : import_node_path3.default.resolve(cwd, raw);
  const folder = target.length > 1 && target.endsWith("/") ? target.slice(0, -1) : target;
  return folder === cwd || folder.startsWith(`${cwd}/`) ? null : folder;
}

// src/core/tuning/cost.ts
var COMPACT_AT = 2e5;
var ZERO_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
function costTotal(cost) {
  return cost.input + cost.output + cost.cacheRead + cost.cacheWrite;
}
function addCost(left, right) {
  return {
    input: left.input + right.input,
    output: left.output + right.output,
    cacheRead: left.cacheRead + right.cacheRead,
    cacheWrite: left.cacheWrite + right.cacheWrite
  };
}
function overCap(cost, context) {
  if (context <= COMPACT_AT) {
    return 0;
  }
  return (cost.input + cost.cacheRead + cost.cacheWrite) * (context - COMPACT_AT) / context;
}
function costOfUsage(model, usage, prices) {
  const price = findPrice(model, prices);
  if (price === null) {
    return null;
  }
  return {
    input: usage.input * price.input / 1e6,
    output: usage.output * price.output / 1e6,
    cacheRead: usage.cacheRead * price.cacheRead / 1e6,
    cacheWrite: usage.cacheWrite * price.cacheWrite / 1e6
  };
}
function firstUsage(record2, seen) {
  const { message } = record2;
  if (seen.has(message.id) || message.usage === null || message.usage === void 0) {
    return null;
  }
  seen.add(message.id);
  return {
    input: message.usage.input_tokens,
    output: message.usage.output_tokens,
    cacheRead: message.usage.cache_read_input_tokens,
    cacheWrite: message.usage.cache_creation_input_tokens
  };
}

// src/core/tuning/families.ts
var FAMILY_PATTERNS = [
  ["land", [/\bgit\b[^|;&]*\s(?:fetch|rebase|push)\b/u]],
  ["ci", [/\bgh\s+run\b/u, /\bgh\s+pr\s+checks\b/u]],
  [
    "server",
    [
      /\blsof\s+-ti\b/u,
      /\bdotnet\s+(?:run|watch)\b/u,
      /\bnpm\s+(?:dev|start)\b/u,
      /\bnpm\s+run\s+(?:dev|start)\b/u,
      /\b(?:uvicorn|pkill)\b/u,
      /\bflask\s+run\b/u
    ]
  ],
  [
    "buildTest",
    [
      /\bnpm\s+test\b/u,
      /\bnpm\s+run\s+(?:test|build|check)\b/u,
      /\bnpx\s+(?:vitest|jest|tsc)\b/u,
      /\b(?:dotnet|cargo|go)\s+(?:build|test)\b/u,
      /\b(?:pytest|make|mvn|gradle)\b/u
    ]
  ],
  ["search", [/^\s*(?:grep|rg|find|cat|head|tail|ls)\b/u, /^\s*sed\s+-n\b/u]]
];
function familyCounts(families) {
  return {
    land: families.get("land") ?? 0,
    ci: families.get("ci") ?? 0,
    server: families.get("server") ?? 0,
    buildTest: families.get("buildTest") ?? 0,
    search: families.get("search") ?? 0
  };
}

// src/core/tuning/spend-hours.ts
var HOUR_MS = 60 * 6e4;
var CONTEXT_BUDGET = 1e5;
var ROUTINE_MODEL = "claude-sonnet-5-5";
var PREMIUM = /claude-(?:opus|fable|mythos)/u;
function isPremium(model) {
  return PREMIUM.test(model);
}
function emptyBucket(at) {
  return {
    at,
    usd: 0,
    subagentUsd: 0,
    premiumUsd: 0,
    premiumSavingUsd: 0,
    subagentSavingUsd: 0,
    bigContextUsd: 0,
    idleRewriteUsd: 0
  };
}
function routineCost(tokens2, prices) {
  const price = findPrice(ROUTINE_MODEL, prices);
  if (price === null) {
    return null;
  }
  return (tokens2.input * price.input + tokens2.output * price.output + tokens2.cacheRead * price.cacheRead + tokens2.cacheWrite * price.cacheWrite) / 1e6;
}
var HourTally = class {
  constructor(prices) {
    this.prices = prices;
  }
  prices;
  buckets = /* @__PURE__ */ new Map();
  bucket(at) {
    const start = Math.floor(at / HOUR_MS) * HOUR_MS;
    let found = this.buckets.get(start);
    if (found === void 0) {
      found = emptyBucket(start);
      this.buckets.set(start, found);
    }
    return found;
  }
  priced(request, at) {
    const { cost } = request;
    const usd2 = cost.input + cost.output + cost.cacheRead + cost.cacheWrite;
    const routine = routineCost(request.tokens, this.prices) ?? usd2;
    return {
      bucket: this.bucket(at),
      usd: usd2,
      saving: isPremium(request.model) ? Math.max(0, usd2 - routine) : 0
    };
  }
  main(request) {
    if (request.at === null) {
      return;
    }
    const { bucket, usd: usd2, saving } = this.priced(request, request.at);
    const { tokens: tokens2, cost } = request;
    const context = tokens2.input + tokens2.cacheRead + tokens2.cacheWrite;
    bucket.usd += usd2;
    bucket.idleRewriteUsd += request.idleRewriteUsd;
    if (context > CONTEXT_BUDGET) {
      const inputUsd2 = cost.input + cost.cacheRead + cost.cacheWrite;
      bucket.bigContextUsd += inputUsd2 * (context - CONTEXT_BUDGET) / context;
    }
    if (isPremium(request.model)) {
      bucket.premiumUsd += usd2;
      bucket.premiumSavingUsd += saving;
    }
  }
  subagent(request) {
    if (request.at === null) {
      return;
    }
    const { bucket, usd: usd2, saving } = this.priced(request, request.at);
    bucket.usd += usd2;
    bucket.subagentUsd += usd2;
    bucket.subagentSavingUsd += saving;
  }
  /** Oldest first. */
  hours() {
    return [...this.buckets.values()].toSorted((left, right) => left.at - right.at);
  }
};

// src/core/tuning/stack.ts
var import_node_path4 = __toESM(require("node:path"), 1);
var MAX_LABELS = 40;
var WRAPPERS = /* @__PURE__ */ new Set([
  "sudo",
  "time",
  "env",
  "nohup",
  "exec",
  "command",
  "npx",
  "uvx",
  "bunx",
  "pnpx"
]);
var SEGMENT = /&&|\|\||[;|\n]/u;
var ASSIGNMENT = /^[A-Za-z_]\w*=/u;
var LABEL = /^[\w.+-]{1,32}$/u;
var NAMED_FILES = /* @__PURE__ */ new Set(["Dockerfile", "Makefile", "Gemfile", "Rakefile"]);
function program(segment) {
  const words = segment.trim().split(/\s+/u);
  let index = 0;
  while (index < words.length) {
    const word2 = words[index] ?? "";
    const skip = ASSIGNMENT.test(word2) || WRAPPERS.has(word2) || word2.startsWith("-");
    if (!skip) {
      break;
    }
    index += 1;
  }
  const word = words[index];
  if (word === void 0 || word === "") {
    return null;
  }
  const base = import_node_path4.default.posix.basename(word);
  return LABEL.test(base) ? base : null;
}
function commandPrograms(command) {
  return command.split(SEGMENT).flatMap((segment) => program(segment) ?? []);
}
function fileLabel(filePath) {
  const base = import_node_path4.default.basename(filePath);
  if (NAMED_FILES.has(base)) {
    return base;
  }
  const extension = import_node_path4.default.extname(base).toLowerCase();
  return extension.length > 1 && LABEL.test(extension) ? extension : null;
}
var StackTally = class {
  counts = /* @__PURE__ */ new Map();
  add(label) {
    if (label !== null) {
      this.counts.set(label, (this.counts.get(label) ?? 0) + 1);
    }
  }
  command(command) {
    for (const name of commandPrograms(command)) {
      this.add(name);
    }
  }
  file(filePath) {
    this.add(fileLabel(filePath));
  }
  /** The most used labels, at most MAX_LABELS. */
  labels() {
    const top = [...this.counts].toSorted((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).slice(0, MAX_LABELS);
    return Object.fromEntries(top);
  }
};

// src/core/tuning/subagent-tally.ts
var TOP_SUBAGENTS = 5;
var DESCRIPTION_CHARS = 80;
function tallySubagent(lines, prices, into, hours) {
  const seen = /* @__PURE__ */ new Set();
  const own2 = { usd: 0, requests: 0, peakContext: 0 };
  for (const line of lines) {
    const record2 = parseTranscriptLine(line);
    const usage = record2?.type === "assistant" ? firstUsage(record2, seen) : null;
    if (record2?.type !== "assistant" || usage === null) {
      continue;
    }
    into.requests += 1;
    into.premium += isPremium(record2.message.model) ? 1 : 0;
    const cost = costOfUsage(record2.message.model, usage, prices) ?? ZERO_COST;
    into.usd += costTotal(cost);
    own2.usd += costTotal(cost);
    own2.requests += 1;
    const context = usage.input + usage.cacheRead + usage.cacheWrite;
    own2.peakContext = Math.max(own2.peakContext, context);
    into.compactSavingUsd += overCap(cost, context);
    const { model } = record2.message;
    hours.subagent({
      at: parseTimestamp(record2.timestamp),
      model,
      tokens: usage,
      cost,
      idleRewriteUsd: 0
    });
  }
  return own2;
}
function mergeCounts(into, counts2) {
  for (const [key, value] of Object.entries(counts2)) {
    into.set(key, (into.get(key) ?? 0) + value);
  }
}
function measureSubagents(input, prices, hours) {
  const tally = { requests: 0, premium: 0, usd: 0, compactSavingUsd: 0 };
  let spend = zeroSpend();
  const files = new Map(Object.entries(input.main.files));
  const toolUses = new Map(Object.entries(input.main.toolUses));
  const subagents = [];
  for (const [index, lines] of input.lines.entries()) {
    const own2 = tallySubagent(lines, prices, tally, hours);
    const parts = attribute(lines, prices);
    spend = addSpend(spend, parts.spend);
    mergeCounts(files, parts.files);
    mergeCounts(toolUses, parts.toolUses);
    const info = input.info?.[index] ?? null;
    subagents.push({
      type: info?.type ?? "unknown",
      description: (info?.description ?? "").slice(0, DESCRIPTION_CHARS),
      ...own2
    });
  }
  return {
    tally,
    spend,
    files,
    toolUses,
    subagents: subagents.toSorted((left, right) => right.usd - left.usd).slice(0, TOP_SUBAGENTS)
  };
}

// src/core/tuning/measure.ts
var BIG_RESULT_CHARS = 4e4;
var IDLE_GAP_MS = 5 * 6e4;
var IDLE_REWRITE_MIN_TOKENS = 5e4;
var TITLE_CHARS = 80;
var TOP_FILES2 = 12;
var COMMAND_CHARS = 120;
var TOP_CD_TARGETS = 8;
var DENIAL = /doesn't want to proceed|denied by (?:the )?(?:Claude Code )?auto[- ]mode|permission to use \S+ (?:has been|was) denied/iu;
var CD_FIRST = /^\s*cd\s/u;
var SEARCH_TOOLS = /* @__PURE__ */ new Set(["Read", "Grep", "Glob"]);
var SPAWN_TOOLS = /* @__PURE__ */ new Set(["Agent", "Task"]);
function oneLine2(text, max) {
  const flat = text.replaceAll(/\s+/gu, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 3)}...` : flat;
}
function stringField(input, key) {
  const value = isPlainObject(input) ? input[key] : null;
  return typeof value === "string" ? value : null;
}
function resultChars(block2) {
  const { content } = block2;
  if (typeof content === "string") {
    return content.length;
  }
  return content.reduce((sum2, part) => sum2 + (part.text?.length ?? 0), 0);
}
function bump2(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}
function beyond(map, free) {
  let extra = 0;
  for (const count3 of map.values()) {
    extra += Math.max(0, count3 - free);
  }
  return extra;
}
var BASE_TYPES = /* @__PURE__ */ new Set(["user", "assistant", "system", "attachment"]);
function hasBaseFields(record2) {
  return BASE_TYPES.has(record2.type);
}
var MainTally = class {
  constructor(prices, hours) {
    this.prices = prices;
    this.hours = hours;
  }
  prices;
  hours;
  title = null;
  cwd = null;
  entrypoint = null;
  firstAt = null;
  lastAt = null;
  requests = 0;
  peakContext = 0;
  contextTokens = 0;
  compactions = 0;
  cost = ZERO_COST;
  idleRewrites = 0;
  idleRewriteUsd = 0;
  compactSavingUsd = 0;
  bigResults = 0;
  toolCalls = 0;
  toolErrors = 0;
  denials = 0;
  bashCommands = 0;
  cdCommands = 0;
  cdTargets = /* @__PURE__ */ new Map();
  reads = /* @__PURE__ */ new Map();
  commands = /* @__PURE__ */ new Map();
  spawns = /* @__PURE__ */ new Map();
  families = /* @__PURE__ */ new Map();
  stack = new StackTally();
  seen = /* @__PURE__ */ new Set();
  toolIds = /* @__PURE__ */ new Set();
  lastRequestAt = null;
  ingest(record2) {
    if (record2.type === "custom-title") {
      this.title = record2.customTitle;
    } else if (record2.type === "ai-title") {
      this.title ??= record2.aiTitle;
    } else if (hasBaseFields(record2)) {
      this.base(record2);
    }
  }
  base(record2) {
    this.cwd ??= record2.cwd ?? null;
    this.entrypoint ??= record2.entrypoint ?? null;
    const at = parseTimestamp(record2.timestamp);
    this.firstAt ??= at;
    this.lastAt = at ?? this.lastAt;
    if (record2.type === "system") {
      this.compactions += record2.subtype === "compact_boundary" ? 1 : 0;
    } else if (record2.type === "assistant") {
      this.assistant(record2, at);
    } else if (record2.type === "user" && Array.isArray(record2.message.content)) {
      this.results(record2.message.content);
    }
  }
  assistant(record2, at) {
    const usage = firstUsage(record2, this.seen);
    if (usage !== null) {
      this.request(record2.message.model, usage, at);
    }
    for (const block2 of record2.message.content) {
      if (block2.type === "tool_use" && !this.toolIds.has(block2.id)) {
        this.toolIds.add(block2.id);
        this.tool(block2.name, block2.input);
      }
    }
  }
  request(model, usage, at) {
    const context = usage.input + usage.cacheRead + usage.cacheWrite;
    this.requests += 1;
    this.contextTokens += context;
    this.peakContext = Math.max(this.peakContext, context);
    const cost = costOfUsage(model, usage, this.prices) ?? ZERO_COST;
    this.cost = addCost(this.cost, cost);
    this.compactSavingUsd += overCap(cost, context);
    const paused = at !== null && this.lastRequestAt !== null && at - this.lastRequestAt >= IDLE_GAP_MS;
    const rewrite = paused && usage.cacheWrite >= IDLE_REWRITE_MIN_TOKENS && usage.cacheWrite * 2 >= context;
    if (rewrite) {
      this.idleRewrites += 1;
      this.idleRewriteUsd += cost.cacheWrite;
    }
    this.lastRequestAt = at ?? this.lastRequestAt;
    this.hours.main({
      at,
      model,
      tokens: usage,
      cost,
      idleRewriteUsd: rewrite ? cost.cacheWrite : 0
    });
  }
  tool(name, input) {
    this.toolCalls += 1;
    if (SEARCH_TOOLS.has(name)) {
      bump2(this.families, "search");
    }
    const file = stringField(input, "file_path");
    if (file !== null) {
      this.stack.file(file);
    }
    if (name === "Read" && file !== null) {
      bump2(this.reads, file);
    } else if (name === "Bash") {
      this.bash(stringField(input, "command") ?? "");
    } else if (SPAWN_TOOLS.has(name)) {
      bump2(this.spawns, stringField(input, "subagent_type") ?? "general-purpose");
    }
  }
  bash(command) {
    this.bashCommands += 1;
    this.stack.command(command);
    this.cdCommands += CD_FIRST.test(command) ? 1 : 0;
    const target = cdTarget(command, this.cwd);
    if (target !== null) {
      bump2(this.cdTargets, target);
    }
    const trimmed = command.trim();
    if (trimmed !== "") {
      bump2(this.commands, trimmed);
    }
    for (const [family, patterns] of FAMILY_PATTERNS) {
      if (patterns.some((pattern) => pattern.test(command))) {
        bump2(this.families, family);
      }
    }
  }
  results(content) {
    for (const block2 of content) {
      if (block2.type !== "tool_result") {
        continue;
      }
      this.bigResults += resultChars(block2) > BIG_RESULT_CHARS ? 1 : 0;
      if (block2.is_error === true) {
        this.toolErrors += 1;
        this.denials += DENIAL.test(resultText(block2.content)) ? 1 : 0;
      }
    }
  }
};
function topRepeat(commands) {
  let best = null;
  for (const [command, runs] of commands) {
    if (runs > 2 && (best === null || runs > best.runs)) {
      best = { command: oneLine2(command, COMMAND_CHARS), runs };
    }
  }
  return best;
}
function measureSession(input) {
  const prices = input.prices ?? DEFAULT_PRICES;
  const hours = new HourTally(prices);
  const main = new MainTally(prices, hours);
  for (const line of input.main) {
    const record2 = parseTranscriptLine(line);
    if (record2 !== null) {
      main.ingest(record2);
    }
  }
  const mainParts = attribute(input.main, prices);
  const subs = measureSubagents(
    { lines: input.subagents, info: input.subagentInfo, main: mainParts },
    prices,
    hours
  );
  const sub = subs.tally;
  const prompts = transcriptPrompts(input.main, {
    sessionId: input.sessionId,
    fallbackAt: input.fallbackAt
  });
  const fallbackTitle = prompts[0]?.text ?? `Session ${input.sessionId.slice(0, 8)}`;
  return {
    sessionId: input.sessionId,
    title: oneLine2(main.title ?? fallbackTitle, TITLE_CHARS),
    cwd: main.cwd,
    entrypoint: main.entrypoint,
    startedAt: main.firstAt ?? input.fallbackAt,
    updatedAt: main.lastAt ?? input.fallbackAt,
    prompts: prompts.length,
    requests: main.requests,
    peakContext: main.peakContext,
    contextTokens: main.contextTokens,
    compactions: main.compactions,
    cost: main.cost,
    idleRewrites: main.idleRewrites,
    idleRewriteUsd: main.idleRewriteUsd,
    compactSavingUsd: main.compactSavingUsd + sub.compactSavingUsd,
    bigResults: main.bigResults,
    extraReads: beyond(main.reads, 2),
    repeatedRuns: beyond(main.commands, 2),
    topRepeat: topRepeat(main.commands),
    toolCalls: main.toolCalls,
    toolErrors: main.toolErrors,
    denials: main.denials,
    bashCommands: main.bashCommands,
    cdCommands: main.cdCommands,
    cdTargets: Object.fromEntries(
      [...main.cdTargets].toSorted((left, right) => right[1] - left[1]).slice(0, TOP_CD_TARGETS)
    ),
    spawns: Object.fromEntries(main.spawns),
    subagentRequests: sub.requests,
    premiumSubagentRequests: sub.premium,
    subagentUsd: sub.usd,
    families: familyCounts(main.families),
    hours: hours.hours(),
    stack: main.stack.labels(),
    spend: mainParts.spend,
    subagentSpend: subs.spend,
    heavy: mainParts.heavy,
    files: Object.fromEntries(
      [...subs.files].toSorted((left, right) => right[1] - left[1]).slice(0, TOP_FILES2)
    ),
    skills: mainParts.skills,
    toolSchemas: mainParts.toolSchemas,
    toolUses: Object.fromEntries(subs.toolUses),
    subagents: subs.subagents
  };
}

// src/core/tuning/totals.ts
var LARGE_CONTEXT = 2e5;
var LONG_SESSION_PROMPTS = 30;
function sumRecords(measures, pick2, each = (value) => value) {
  const sums = {};
  for (const measure of measures) {
    for (const [key, value] of Object.entries(pick2(measure))) {
      sums[key] = (sums[key] ?? 0) + each(value);
    }
  }
  return sums;
}
function sessionUsd(measure) {
  return costTotal(measure.cost) + measure.subagentUsd;
}
function sum(measures, pick2) {
  return measures.reduce((total, measure) => total + pick2(measure), 0);
}
function topRepeat2(measures) {
  let best = null;
  for (const { topRepeat: repeat } of measures) {
    if (repeat !== null && (best === null || repeat.runs > best.runs)) {
      best = repeat;
    }
  }
  return best;
}
function spendOf(measures) {
  let total = zeroSpend();
  for (const measure of measures) {
    total = addSpend(total, addSpend(measure.spend, measure.subagentSpend));
  }
  return total;
}
function spawnsOf(measure) {
  return Object.values(measure.spawns).reduce((total, count3) => total + count3, 0);
}
function totalsOf(measures, home) {
  return {
    sessions: measures.length,
    totalUsd: sum(measures, sessionUsd),
    cacheReadUsd: sum(measures, (m) => m.cost.cacheRead),
    requests: sum(measures, (m) => m.requests),
    contextTokens: sum(measures, (m) => m.contextTokens),
    largestContext: Math.max(0, ...measures.map((m) => m.peakContext)),
    largeSessions: measures.filter((m) => m.peakContext > LARGE_CONTEXT).length,
    longSessions: measures.filter((m) => m.prompts > LONG_SESSION_PROMPTS).length,
    longestPrompts: Math.max(0, ...measures.map((m) => m.prompts)),
    homeSessions: measures.filter((m) => m.cwd === home).length,
    oldestUpdatedAt: measures.length === 0 ? null : Math.min(...measures.map((m) => m.updatedAt)),
    compactions: sum(measures, (m) => m.compactions),
    idleRewrites: sum(measures, (m) => m.idleRewrites),
    idleRewriteUsd: sum(measures, (m) => m.idleRewriteUsd),
    bigResults: sum(measures, (m) => m.bigResults),
    extraReads: sum(measures, (m) => m.extraReads),
    repeatedRuns: sum(measures, (m) => m.repeatedRuns),
    topRepeat: topRepeat2(measures),
    toolCalls: sum(measures, (m) => m.toolCalls),
    toolErrors: sum(measures, (m) => m.toolErrors),
    denials: sum(measures, (m) => m.denials),
    bashCommands: sum(measures, (m) => m.bashCommands),
    cdCommands: sum(measures, (m) => m.cdCommands),
    spawns: sum(measures, spawnsOf),
    exploreSpawns: sum(measures, (m) => m.spawns["Explore"] ?? 0),
    subagentRequests: sum(measures, (m) => m.subagentRequests),
    premiumSubagentRequests: sum(measures, (m) => m.premiumSubagentRequests),
    subagentUsd: sum(measures, (m) => m.subagentUsd),
    families: {
      land: sum(measures, (m) => m.families.land),
      ci: sum(measures, (m) => m.families.ci),
      server: sum(measures, (m) => m.families.server),
      buildTest: sum(measures, (m) => m.families.buildTest),
      search: sum(measures, (m) => m.families.search)
    },
    spend: spendOf(measures),
    compactSavingUsd: sum(measures, (m) => m.compactSavingUsd),
    subagentSavingUsd: sum(
      measures,
      (m) => m.hours.reduce((total, hour) => total + hour.subagentSavingUsd, 0)
    ),
    toolSchemaUsd: sumRecords(measures, (m) => m.toolSchemas),
    toolSchemaSessions: sumRecords(
      measures,
      (m) => m.toolSchemas,
      () => 1
    ),
    toolUses: sumRecords(measures, (m) => m.toolUses),
    toolUseSessions: sumRecords(
      measures,
      (m) => m.toolUses,
      () => 1
    ),
    skillUsd: sumRecords(measures, (m) => m.skills)
  };
}

// src/core/tuning/suggestions.ts
var HANDOFF = {
  frontmatter: {
    name: "handoff",
    description: "Write a handoff note for the current task so a fresh session can pick it up. Use before /clear, before stepping away from a long session, or when the context is getting large.",
    "argument-hint": "[anything the next session should know]",
    "disable-model-invocation": true
  },
  body: `Write a handoff note so a new session can continue this work without the old conversation.

1. Write it to \`.claude/handoffs/<YYYY-MM-DD>-<short-slug>.md\` in the project root, creating the folder if needed. Do not commit it unless asked.
2. Use these sections, short and concrete:
   - Goal: what we are trying to get done, in one or two sentences.
   - Done so far: what changed, with file paths and commit hashes.
   - Decisions: choices made and why, including approaches that failed, so they are not tried again.
   - Current state: what works, what is broken, the last command run and its result.
   - Next steps: an ordered list.
   - Read first: the few files the next session should open.
3. Keep it under 60 lines. Point to files instead of pasting them.
4. Add anything from $ARGUMENTS.

Reply with the path and one line to paste into the new session, for example: \`Read .claude/handoffs/2026-10-16-fix-login.md and continue from Next steps.\`
`
};
var SCOUT = {
  frontmatter: {
    name: "scout",
    description: "Finds code, config and facts in the repository and reports only what matters. Use for any search that would read many files or long command output, so the main session keeps a small context.",
    tools: "Read, Grep, Glob, Bash",
    model: "haiku",
    color: "cyan"
  },
  body: `You search so the main session does not have to. The caller only sees your final reply, so everything you read stays out of its context.

- Start broad (file names, symbols, strings), then read only the parts that matter. Prefer Grep and Glob over reading whole files, and read large files in line ranges.
- Do not edit files, install anything or run commands that change state. Use Bash only for read-only commands such as git log, git grep and ls.
- Stop once you can answer with confidence.

Reply in at most 25 lines: the answer first, then the evidence as file paths with line numbers and short quotes. Say plainly what you could not find or confirm.
`
};
var QUIET_RUN = {
  frontmatter: {
    name: "quiet-run",
    description: "Run a build, test suite or other noisy command with its full output saved to a log file, and bring back only the exit code, the errors and the last lines. Use instead of running long builds or tests directly.",
    "argument-hint": "<command>"
  },
  body: `Run the command in $ARGUMENTS without flooding the conversation with its output.

1. Send all output to a log file and keep the exit code. Use the session's scratchpad folder if there is one, otherwise the system temp folder:

   \`\`\`sh
   log="\${TMPDIR:-/tmp}/quiet-run-$(date +%s).log"
   ( <command> ) >"$log" 2>&1; status=$?
   echo "exit $status, $(wc -l <"$log" | tr -d ' ') lines in $log"
   \`\`\`

2. If it passed, say so in one line with the log path.
3. If it failed, show only what explains the failure: \`grep -nEi 'error|fail|exception|panic' "$log" | head -n 40\`, then \`tail -n 30 "$log"\`. Read more of the log in line ranges only when that is not enough.
4. Never print the whole log.
`
};
var CI_WATCH = {
  frontmatter: {
    name: "ci-watch",
    description: "Waits for a GitHub Actions run to finish and reports the result, with only the failing part of the log when it fails. Use after pushing, instead of polling gh run from the main session.",
    tools: "Bash",
    model: "haiku",
    color: "yellow"
  },
  body: `You watch a CI run so the main session does not poll it.

1. Find the run: use the run id or branch you were given, otherwise the newest run on the current branch: \`gh run list --branch "$(git branch --show-current)" --limit 1 --json databaseId,status,conclusion,workflowName\`.
2. Wait for it with \`gh run watch <id> --exit-status --interval 30 >/dev/null 2>&1\`. If the command times out while the run is still going, run it again.
3. On success, reply in one line: workflow, conclusion and how long it took.
4. On failure, run \`gh run view <id> --log-failed | tail -n 80\` and reply with the failing job and step, the error lines, and your best guess at the cause in two sentences. Do not try to fix anything.
`
};
var LAND = {
  frontmatter: {
    name: "land",
    description: "Land finished work: commit, rebase onto the latest default branch, rerun the checks, push, and clean up the worktree. Use when the work is done and its checks pass.",
    "argument-hint": "[commit message]",
    "disable-model-invocation": true
  },
  body: `Land the current branch on the default branch. Stop and report at the first step that fails, and never force push.

1. Find the default branch: \`git symbolic-ref --short refs/remotes/origin/HEAD\` gives something like origin/main. Call the part after origin/ DEFAULT.
2. Check \`git status\` and stage only the files that belong to this work. Commit with $ARGUMENTS as the message, or write a short one that says what changed and why.
3. \`git fetch origin\`, then \`git rebase origin/DEFAULT\`. On conflicts, resolve them, \`git add\` the files and run \`GIT_EDITOR=true git rebase --continue\`.
4. If the rebase pulled in new commits, rerun the project's checks (see CLAUDE.md, package.json, a Makefile or similar) and fix any failure before going on.
5. Push as its own step: \`git push origin HEAD:DEFAULT\`. If it is rejected because someone else landed first, go back to step 3.
6. Confirm it landed: after \`git fetch origin\`, \`git log --oneline -1 origin/DEFAULT\` shows your commit.
7. If this session works in a linked worktree, move to the main checkout, then \`git worktree remove <path>\` and \`git branch -d <branch>\`. Use -d, never -D, so git refuses to delete work that did not land.

Reply with the commit hash and its one-line summary.
`
};
var DEV_SERVER = {
  frontmatter: {
    name: "dev-server",
    description: "Start, restart or stop a local development server in the background with its output in a log file, and wait until it answers. Use instead of running servers in the foreground or killing ports by hand.",
    "argument-hint": "start|restart|stop <port> [command]"
  },
  body: `Manage a dev server without blocking the session or flooding it with logs. $ARGUMENTS gives the action, the port and, to start, the command.

- Log file: \`\${TMPDIR:-/tmp}/dev-server-<port>.log\`.
- Free the port: \`pids=$(lsof -ti tcp:<port> 2>/dev/null); [ -n "$pids" ] && kill $pids\`. Where lsof is missing (some Linux machines), use \`fuser -k <port>/tcp\`.
- Start: free the port, then run the command with the Bash tool's run_in_background option and all output going to the log: \`<command> >"$log" 2>&1\`.
- Wait until it answers: \`curl -s -o /dev/null --retry 60 --retry-delay 1 --retry-connrefused "http://127.0.0.1:<port>/"\`. If it never answers, show \`tail -n 40 "$log"\` and stop.
- Restart: stop, then start. Stop: free the port and check that nothing listens on it.

Reply in one line with the URL or the error from the log. When asked about server errors, read the log with tail or grep, never the whole file.
`
};
var SUGGESTIONS = [
  {
    id: "handoff",
    kind: "skill",
    summary: "Writes a short handoff note so you can /clear or start fresh without losing the thread.",
    pros: [
      "You choose what carries over, so a fresh session starts with the decisions and dead ends instead of hundreds of thousands of tokens of history."
    ],
    cons: [
      "The note only holds what Claude writes in it, and detail it leaves out is gone from the new session."
    ],
    spec: HANDOFF,
    reason: (t) => t.largeSessions === 0 && t.longSessions === 0 ? null : `${plural(t.largeSessions, "session")} went past ${tokens(LARGE_CONTEXT)} tokens and ${plural(t.longSessions, "session")} ran past ${LONG_SESSION_PROMPTS.toString()} prompts.`
  },
  {
    id: "scout",
    kind: "agent",
    summary: "A read-only search agent on Haiku that returns only the answer, so searches stay out of the main context.",
    pros: [
      "Searches run on Haiku at a fraction of Opus prices, and only the answer lands in your context."
    ],
    cons: [
      "Haiku can miss or misread subtle code, and you see its summary instead of the files, so a wrong answer is harder to spot."
    ],
    spec: SCOUT,
    reason: (t) => t.families.search < 200 ? null : `Main sessions ran ${plural(t.families.search, "search", "searches")} and file reads themselves, so all that output stayed in their context.`
  },
  {
    id: "quiet-run",
    kind: "skill",
    summary: "Runs builds and tests with output in a log file and brings back only the errors.",
    pros: [
      "Only the errors and the last lines reach the context, and the full log stays on disk if you need it."
    ],
    cons: [
      "The search for errors can miss a failure that never says error or fail, such as a hang or a wrong result."
    ],
    spec: QUIET_RUN,
    reason: (t) => t.bigResults < 3 && t.families.buildTest < 100 ? null : `${plural(t.families.buildTest, "build or test command")} ran in main sessions and ${plural(t.bigResults, "tool result")} were over 40K characters.`
  },
  {
    id: "land",
    kind: "skill",
    summary: "Commits, rebases onto the default branch, reruns checks, pushes and removes the worktree.",
    pros: [
      "The same safe sequence runs every time, without Claude working out the steps again in each session."
    ],
    cons: [
      "It pushes straight to the default branch, so a mistake lands for everyone. It only runs when you type /land for that reason."
    ],
    spec: LAND,
    reason: (t) => t.families.land < 30 ? null : `${plural(t.families.land, "git fetch, rebase or push command")} ran by hand, the same landing routine in session after session.`
  },
  {
    id: "ci-watch",
    kind: "agent",
    summary: "Waits on a GitHub Actions run on Haiku and reports only the result or the failing log lines.",
    pros: ["Waiting on CI costs nothing in the main session, and you get only the failing lines."],
    cons: [
      "Its guess at the cause comes from Haiku, so treat it as a starting point. It needs the gh CLI signed in."
    ],
    spec: CI_WATCH,
    reason: (t) => t.families.ci < 20 ? null : `${plural(t.families.ci, "gh run or gh pr checks command")} polled CI from main sessions.`
  },
  {
    id: "dev-server",
    kind: "skill",
    summary: "Starts, restarts and stops local servers in the background and waits until they answer.",
    pros: [
      "Servers run in the background with logs in a file, so they neither block the session nor flood it."
    ],
    cons: [
      "A background server keeps running until it is stopped, and freeing the port kills whatever holds it, even something that is not yours."
    ],
    spec: DEV_SERVER,
    reason: (t) => t.families.server < 15 ? null : `${plural(t.families.server, "command")} started, stopped or killed local servers by hand.`
  }
];
function findSuggestion(id) {
  return SUGGESTIONS.find((suggestion) => suggestion.id === id) ?? null;
}
function nameOf(definition) {
  return definition.spec.frontmatter.name ?? definition.id;
}
function buildSuggestions(totals, installed) {
  const all = SUGGESTIONS.map((definition) => ({
    id: definition.id,
    kind: definition.kind,
    name: nameOf(definition),
    summary: definition.summary,
    pros: definition.pros,
    cons: definition.cons,
    reason: definition.reason(totals),
    installed: installed.has(definition.id)
  }));
  return all.toSorted(
    (left, right) => Number(left.reason === null) - Number(right.reason === null)
  );
}

// src/core/tuning/fixes.ts
var UNUSED_SHARE = 0.05;
var UNUSED_MIN_SESSIONS = 5;
var UNUSED_MIN_USD = 0.5;
var SMALL_OUTPUT = 15e3;
var PROMPT_FILES = 8;
var HOT_FIX_MIN_USD = 5;
var HEAVY_SKILLS = 3;
var CODE_EXTENSIONS = /* @__PURE__ */ new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "css",
  "py",
  "cs",
  "go",
  "rs",
  "java",
  "kt",
  "swift",
  "rb",
  "php",
  "c",
  "h",
  "cpp",
  "hpp"
]);
function unusedTools(totals) {
  return Object.entries(totals.toolSchemaUsd).map(([name, value]) => ({
    name,
    usd: value,
    carried: totals.toolSchemaSessions[name] ?? 0,
    used: totals.toolUseSessions[name] ?? 0
  })).filter(
    (tool) => tool.carried >= UNUSED_MIN_SESSIONS && tool.usd >= UNUSED_MIN_USD && tool.used <= tool.carried * UNUSED_SHARE
  ).toSorted((left, right) => right.usd - left.usd);
}
function knobFix(context, fix2, applied) {
  return { kind: "knob", id: `knob:${fix2.key}`, ...fix2, applied: applied(context.knob(fix2.key)) };
}
function compactFix(context) {
  const saving = context.totals.compactSavingUsd;
  const saved = saving > 0 ? ` On the sessions measured that would have saved about ${usd(saving)}.` : "";
  return knobFix(
    context,
    {
      key: "autoCompactWindow",
      value: COMPACT_AT,
      title: "Compact every session at 200K tokens",
      detail: `Sets autoCompactWindow to 200000 in your user settings, so sessions and subagents compact long before the 1M limit.${saved}`
    },
    (current) => typeof current === "number" && current <= COMPACT_AT
  );
}
function subagentModelFix(context) {
  const saving = context.totals.subagentSavingUsd;
  const saved = saving > 0 ? ` About ${usd(saving)} saved on the sessions measured.` : "";
  return knobFix(
    context,
    {
      key: "CLAUDE_CODE_SUBAGENT_MODEL",
      value: "sonnet",
      title: "Run subagents on Sonnet",
      detail: `Sets CLAUDE_CODE_SUBAGENT_MODEL to sonnet, so subagents without a model of their own stop running on Opus.${saved} Agents that set model: opus keep it.`
    },
    (current) => typeof current === "string" && current !== ""
  );
}
function outputFix(context) {
  return knobFix(
    context,
    {
      key: "BASH_MAX_OUTPUT_LENGTH",
      value: String(SMALL_OUTPUT),
      title: "Cap shell output at 15,000 characters",
      detail: "Sets BASH_MAX_OUTPUT_LENGTH so one noisy command cannot put 30,000 characters into the context for the rest of the session."
    },
    (current) => Number(current) > 0 && Number(current) <= SMALL_OUTPUT
  );
}
function cleanupFix(context) {
  return knobFix(
    context,
    {
      key: "cleanupPeriodDays",
      value: KEEP_DAYS,
      title: `Keep transcripts for ${KEEP_DAYS.toString()} days`,
      detail: `Sets cleanupPeriodDays to ${KEEP_DAYS.toString()} in your user settings, so Claude Code keeps every session on disk for ${KEEP_DAYS.toString()} days instead of ${keptDays(context.knob("cleanupPeriodDays")).toString()}.`
    },
    (current) => keptDays(current) >= KEEP_DAYS
  );
}
function denyFix(context) {
  const tools = unusedTools(context.totals);
  if (tools.length === 0) {
    return null;
  }
  const existing = stringsOf(context.knob("permissions.deny"));
  const names = tools.map((tool) => tool.name);
  const saving = tools.reduce((total, tool) => total + tool.usd, 0);
  const list = tools.map(
    (tool) => `${tool.name} (used in ${tool.used.toString()} of ${plural(tool.carried, "session")})`
  ).join(", ");
  return {
    kind: "knob",
    id: "knob:permissions.deny",
    key: "permissions.deny",
    value: [.../* @__PURE__ */ new Set([...existing, ...names])],
    title: `Stop sending ${plural(names.length, "unused tool")} with every request`,
    detail: `Adds ${list} to permissions.deny in your user settings, which takes their definitions out of every request: about ${usd(saving)} on the sessions measured. Remove one from permissions.deny when you want it back.`,
    applied: names.every((name) => existing.includes(name))
  };
}
function createFix(context, id, title) {
  const definition = findSuggestion(id);
  if (definition === null) {
    return null;
  }
  return {
    kind: "create",
    id: `create:${id}`,
    suggestionId: id,
    title,
    detail: `Writes the ${nameOf(definition)} ${definition.kind}: ${definition.spec.frontmatter.description ?? ""}`,
    applied: context.installed.has(id)
  };
}
function launchFix(fix2) {
  return { kind: "launch", ...fix2, applied: false };
}
function worstProject(context, metric) {
  const worst = context.live.filter((measure) => measure.cwd !== null && metric(measure) > 0).toSorted((left, right) => metric(right) - metric(left))[0];
  if (worst?.cwd === null || worst?.cwd === void 0) {
    return null;
  }
  const project = context.projectOf(worst.cwd);
  return context.modifiedAt(project) === null ? null : project;
}
function lastPart2(folder) {
  return folder.split("/").findLast((part) => part !== "") ?? folder;
}
function isCode(file) {
  const dot = file.lastIndexOf(".");
  return dot !== -1 && CODE_EXTENSIONS.has(file.slice(dot + 1).toLowerCase());
}
function hotFilesFix(context) {
  const code = context.hotFiles.filter((file) => file.project !== "" && isCode(file.path));
  const project = code.find((file) => context.modifiedAt(file.project) !== null)?.project;
  if (project === void 0) {
    return null;
  }
  const files = code.filter((file) => file.project === project).slice(0, PROMPT_FILES);
  const cost = files.reduce((total, file) => total + file.usd, 0);
  if (cost < HOT_FIX_MIN_USD) {
    return null;
  }
  const list = files.map((file) => `- ${file.path}: ${usd(file.usd)} over ${plural(file.sessions, "session")}`).join("\n");
  return launchFix({
    id: `launch:hot-files:${project}`,
    title: `Make the most read files in ${lastPart2(project)} cheaper to read`,
    detail: `Has Claude, in a new worktree of ${project}, split the files sessions keep reading (${usd(cost)} to carry so far) into smaller modules and cut comments that only restate the code, then land the change.`,
    label: "Make hot files cheaper to read",
    cwd: project,
    worktree: true,
    prompt: `Make these files cheaper for Claude Code sessions to read. Across recent sessions in this project, carrying them in context after reading them cost ${usd(cost)}:
${list}

Every session that reads one of these files pays for all of it on every later request, so size is what costs.
1. For each file over about 300 lines, split it into smaller modules along the seams it already has, so a session that needs one part reads only that part. Keep the public names working, through re-exports if the project already does that.
2. Delete comments that only restate what the code says. Keep comments that explain why, and keep tool directives such as eslint-disable, @public, @ts-expect-error, cspell and secretlint lines.
3. Do not change behavior. Run the checks the project's CLAUDE.md names, commit, and land the change the way it says.
Reply with what you split and how many lines each file lost.`
  });
}
function costSinceChange(context, folder) {
  const changed = context.modifiedAt(`${folder}/SKILL.md`);
  if (changed === null) {
    return 0;
  }
  let total = 0;
  for (const measure of context.live) {
    total += measure.startedAt >= changed ? measure.skills[folder] ?? 0 : 0;
  }
  return total;
}
function skillFixes(context) {
  return Object.keys(context.totals.skillUsd).map((folder) => [folder, costSinceChange(context, folder)]).toSorted((left, right) => right[1] - left[1]).slice(0, HEAVY_SKILLS).filter(([, cost]) => cost >= 1).map(
    ([folder, cost]) => launchFix({
      id: `launch:skill:${folder}`,
      title: `Slim the ${skillName(folder)} skill`,
      detail: `Has Claude move reference material out of ${skillName(folder)}'s SKILL.md into files it loads only when needed. Carrying its body cost ${usd(cost)} on the sessions measured.`,
      label: `Slim the ${skillName(folder)} skill`,
      cwd: folder,
      worktree: false,
      prompt: `The ${skillName(folder)} skill in ${folder} cost ${usd(cost)} across recent Claude Code sessions, because its SKILL.md loads into context in full whenever it is used and then stays there for every later request.
Make it cheaper to load without changing what it does:
1. Keep SKILL.md to the steps and rules Claude needs every time it runs, in as few words as they take.
2. Move reference material, long examples, tables and lists into files beside it, and have SKILL.md say which file to read for what.
3. Cut anything said twice. Keep the name and description in the frontmatter as they are.
If the folder is a git repository, commit the change. Reply with how many lines SKILL.md lost and where the material went.`
    })
  );
}
function instructionsSinceChange(context) {
  const changed = context.modifiedAt(`${context.home}/.claude/CLAUDE.md`) ?? 0;
  let total = 0;
  for (const measure of context.live) {
    total += measure.startedAt >= changed ? measure.spend.instructions + measure.subagentSpend.instructions : 0;
  }
  return total;
}
function instructionsFix(context) {
  const cost = instructionsSinceChange(context);
  if (cost < 1) {
    return null;
  }
  return launchFix({
    id: "launch:instructions",
    title: "Tighten CLAUDE.md and memory",
    detail: `Has Claude rewrite ~/.claude/CLAUDE.md and the memory index to say the same in fewer words. They load with every request, which cost ${usd(cost)} on the sessions measured.`,
    label: "Tighten CLAUDE.md",
    cwd: context.home,
    worktree: false,
    prompt: `~/.claude/CLAUDE.md and the memory files Claude Code loads with it cost ${usd(cost)} across recent sessions, since they are sent with every request of every session and subagent.
Rewrite ~/.claude/CLAUDE.md, and the MEMORY.md index files under ~/.claude/projects, so every rule still says the same thing in fewer words:
1. Drop repetition, examples that only restate a rule, and explanations Claude does not need to follow it.
2. Do not drop or weaken a rule. If two rules overlap, merge them.
3. Save a copy of each file as <name>.bak before changing it.
Reply with each file's size before and after, and anything you were unsure about.`
  });
}
function permissionsFix(context) {
  const project = worstProject(context, (measure) => measure.denials);
  if (project === null) {
    return null;
  }
  return launchFix({
    id: `launch:permissions:${project}`,
    title: `Allow the read-only commands ${lastPart2(project)} keeps asking for`,
    detail: `Has Claude run /fewer-permission-prompts in ${project}, which reads the transcripts and adds allow rules for read-only commands to the project settings.`,
    label: "Fewer permission prompts",
    cwd: project,
    worktree: false,
    prompt: "/fewer-permission-prompts"
  });
}
function commandsFix(context) {
  const project = worstProject(context, (measure) => measure.toolErrors - measure.denials);
  if (project === null) {
    return null;
  }
  return launchFix({
    id: `launch:commands:${project}`,
    title: `Teach ${lastPart2(project)}'s CLAUDE.md the commands that keep failing`,
    detail: `Has Claude, in a new worktree of ${project}, find the tool calls that failed on a wrong command or missing setup and add the right ones to its CLAUDE.md.`,
    label: "Fix failing commands",
    cwd: project,
    worktree: true,
    prompt: `Many tool calls in this project's Claude Code sessions fail. Look through the recent transcripts for this project under ~/.claude/projects (the folder named after this path), find the tool calls that failed because of a wrong command, a wrong path, a missing tool or missing setup, and leave out failing tests and type errors, which are how work finds problems.
Add the right commands and the setup they need to this project's CLAUDE.md in as few lines as it takes. Commit and land it the way CLAUDE.md says. Reply with the failures you found and the lines you added.`
  });
}
var BUILDERS = {
  "context-reread": (c) => [compactFix(c), createFix(c, "scout", "Add a scout agent for searches")],
  "huge-context": (c) => [compactFix(c), createFix(c, "handoff", "Add a handoff skill")],
  "idle-rewrite": (c) => [compactFix(c), createFix(c, "handoff", "Add a handoff skill")],
  "subagent-model": (c) => [
    subagentModelFix(c),
    createFix(c, "scout", "Add a scout agent on Haiku")
  ],
  "big-results": (c) => [outputFix(c), createFix(c, "quiet-run", "Add the quiet-run skill")],
  "repeated-commands": (c) => [
    createFix(c, "ci-watch", "Add a ci-watch agent"),
    createFix(c, "dev-server", "Add the dev-server skill"),
    createFix(c, "quiet-run", "Add the quiet-run skill")
  ],
  "long-sessions": (c) => [compactFix(c), createFix(c, "handoff", "Add a handoff skill")],
  denials: (c) => [permissionsFix(c)],
  rereads: (c) => [createFix(c, "scout", "Add a scout agent for searches")],
  "tool-errors": (c) => [commandsFix(c)],
  "file-reads": (c) => [hotFilesFix(c), createFix(c, "scout", "Add a scout agent for searches")],
  "unused-tools": (c) => [denyFix(c)],
  "heavy-skills": (c) => skillFixes(c),
  instructions: (c) => [instructionsFix(c)],
  "cd-commands": (c) => [cdFix(c)],
  "transcript-cleanup": (c) => [cleanupFix(c)]
};
function autoFixesFor(tipId, context) {
  const fixes = (BUILDERS[tipId]?.(context) ?? []).filter((fix2) => fix2 !== null);
  return fixes.toSorted((left, right) => Number(left.applied) - Number(right.applied));
}

// src/core/tuning/impact.ts
var BASELINE_MS = 30 * 24 * 60 * 6e4;
var WEEK_MS = 7 * 24 * 60 * 6e4;
var MIN_SESSIONS_AFTER = 5;
var CHANGE_BAND = 0.1;
var MAX_WEEKS = 8;
function share(part, whole) {
  return whole === 0 ? null : part / whole;
}
function per100(part, whole) {
  return whole === 0 ? null : part * 100 / whole;
}
var METRICS = {
  costPerPrompt: {
    label: "Cost per prompt",
    format: "usd",
    value: (s) => share(s.usd, s.prompts)
  },
  averageContext: {
    label: "Context per request",
    format: "tokens",
    value: (s) => share(s.contextTokens, s.requests)
  },
  rereadShare: {
    label: "Spend re-reading context",
    format: "percent",
    value: (s) => share(s.cacheReadUsd, s.usd)
  },
  largeShare: {
    label: `Sessions past ${(LARGE_CONTEXT / 1e3).toString()}K context`,
    format: "percent",
    value: (s) => share(s.largeSessions, s.sessions)
  },
  idleUsd: {
    label: "Cache rewrites per session",
    format: "usd",
    value: (s) => share(s.idleRewriteUsd, s.sessions)
  },
  premiumShare: {
    label: "Subagent requests on Opus or Fable",
    format: "percent",
    value: (s) => share(s.premiumSubagentRequests, s.subagentRequests)
  },
  bigResults: {
    label: "Huge results per 100 tool calls",
    format: "per100",
    value: (s) => per100(s.bigResults, s.toolCalls)
  },
  repeats: {
    label: "Repeated commands per 100",
    format: "per100",
    value: (s) => per100(s.repeatedRuns, s.bashCommands)
  },
  longShare: {
    label: `Sessions past ${LONG_SESSION_PROMPTS.toString()} prompts`,
    format: "percent",
    value: (s) => share(s.longSessions, s.sessions)
  },
  denials: {
    label: "Denials per 100 tool calls",
    format: "per100",
    value: (s) => per100(s.denials, s.toolCalls)
  },
  extraReads: {
    label: "Rereads per 100 tool calls",
    format: "per100",
    value: (s) => per100(s.extraReads, s.toolCalls)
  },
  failures: {
    label: "Failures per 100 tool calls",
    format: "per100",
    value: (s) => per100(s.failures, s.toolCalls)
  },
  cdShare: {
    label: "Commands that start with cd",
    format: "percent",
    value: (s) => share(s.cdCommands, s.bashCommands)
  },
  fileReadShare: {
    label: "Spend carrying files read",
    format: "percent",
    value: (s) => share(s.fileReadUsd, s.usd)
  },
  setupShare: {
    label: "Spend on the system prompt and tools",
    format: "percent",
    value: (s) => share(s.setupUsd, s.usd)
  },
  skillShare: {
    label: "Spend carrying skills",
    format: "percent",
    value: (s) => share(s.skillUsd, s.usd)
  },
  instructionShare: {
    label: "Spend carrying CLAUDE.md and memory",
    format: "percent",
    value: (s) => share(s.instructionUsd, s.usd)
  }
};
function emptySums() {
  return {
    sessions: 0,
    prompts: 0,
    requests: 0,
    usd: 0,
    cacheReadUsd: 0,
    contextTokens: 0,
    largeSessions: 0,
    longSessions: 0,
    idleRewriteUsd: 0,
    subagentRequests: 0,
    premiumSubagentRequests: 0,
    toolCalls: 0,
    bigResults: 0,
    extraReads: 0,
    failures: 0,
    denials: 0,
    bashCommands: 0,
    repeatedRuns: 0,
    cdCommands: 0,
    fileReadUsd: 0,
    setupUsd: 0,
    skillUsd: 0,
    instructionUsd: 0
  };
}
function add(sums, m) {
  sums.sessions += 1;
  sums.prompts += m.prompts;
  sums.requests += m.requests;
  sums.usd += costTotal(m.cost) + m.subagentUsd;
  sums.cacheReadUsd += m.cost.cacheRead;
  sums.contextTokens += m.contextTokens;
  sums.largeSessions += m.peakContext > LARGE_CONTEXT ? 1 : 0;
  sums.longSessions += m.prompts > LONG_SESSION_PROMPTS ? 1 : 0;
  sums.idleRewriteUsd += m.idleRewriteUsd;
  sums.subagentRequests += m.subagentRequests;
  sums.premiumSubagentRequests += m.premiumSubagentRequests;
  sums.toolCalls += m.toolCalls;
  sums.bigResults += m.bigResults;
  sums.extraReads += m.extraReads;
  sums.failures += m.toolErrors - m.denials;
  sums.denials += m.denials;
  sums.bashCommands += m.bashCommands;
  sums.repeatedRuns += m.repeatedRuns;
  sums.cdCommands += m.cdCommands;
  sums.fileReadUsd += m.spend.fileReads + m.subagentSpend.fileReads;
  sums.setupUsd += m.spend.setup + m.subagentSpend.setup;
  sums.skillUsd += m.spend.skills + m.subagentSpend.skills;
  sums.instructionUsd += m.spend.instructions + m.subagentSpend.instructions;
}
function sumsOf(measures) {
  const sums = emptySums();
  for (const measure of measures) {
    add(sums, measure);
  }
  return sums;
}
function othersOf(tracking) {
  const candidates = [
    { id: "costPerPrompt", role: "cost", why: "" },
    ...tracking.watch.map(({ metric, why }) => ({
      id: metric,
      role: "side-effect",
      why
    }))
  ];
  const others = [];
  for (const slot of candidates) {
    if (slot.id !== tracking.target && !others.some((other) => other.id === slot.id)) {
      others.push(slot);
    }
  }
  return others;
}
function relativeChange(before, after) {
  if (before === null || after === null) {
    return null;
  }
  if (before === 0) {
    return after === 0 ? 0 : null;
  }
  return (after - before) / before;
}
function directionOf(before, after) {
  if (before === null || after === null) {
    return null;
  }
  const change = relativeChange(before, after);
  if (change === null) {
    return "worse";
  }
  if (change <= -CHANGE_BAND) {
    return "better";
  }
  return change >= CHANGE_BAND ? "worse" : "same";
}
function metricOf(slot, before, after) {
  const definition = METRICS[slot.id];
  const beforeValue = before.sessions === 0 ? null : definition.value(before);
  const afterValue = after.sessions === 0 ? null : definition.value(after);
  return {
    id: slot.id,
    label: definition.label,
    role: slot.role,
    why: slot.why,
    format: definition.format,
    before: beforeValue,
    after: afterValue,
    change: relativeChange(beforeValue, afterValue),
    direction: directionOf(beforeValue, afterValue)
  };
}
function verdictOf(metrics) {
  const target = metrics.find((metric) => metric.role === "target");
  const othersWorse = metrics.some(
    (metric) => metric.role !== "target" && metric.direction === "worse"
  );
  if (target?.direction === "worse") {
    return "worse";
  }
  if (target?.direction === "better") {
    return othersWorse ? "mixed" : "better";
  }
  return othersWorse ? "worse" : "same";
}
function moved(metric) {
  const label = `${metric.label.charAt(0).toLowerCase()}${metric.label.slice(1)}`;
  if (metric.direction === null) {
    return `${label} had nothing to compare on one side`;
  }
  if (metric.change === null) {
    return `${label} went up from none`;
  }
  if (metric.direction === "same") {
    return `${label} held steady`;
  }
  const verb = metric.change < 0 ? "fell" : "rose";
  return `${label} ${verb} ${percent(Math.abs(metric.change))}`;
}
function summaryOf(input) {
  const { verdict, target, before, after } = input;
  if (verdict === "no-baseline") {
    return "No sessions ran in the 30 days before you started, so there is nothing to compare with yet.";
  }
  if (verdict === "early") {
    return `Too early to tell: ${after.toLocaleString("en-US")} of the ${MIN_SESSIONS_AFTER.toString()} sessions needed have run since you started.`;
  }
  const compared = `over ${plural(after, "session")} since you started, against ${before.toLocaleString("en-US")} in the 30 days before`;
  const costs = input.others.filter(
    (metric) => metric.direction !== null && metric.direction !== "same"
  );
  const others = costs.length === 0 ? "" : ` Meanwhile ${costs.map((metric) => moved(metric)).join(", ")}.`;
  const lead = moved(target);
  return `${lead.charAt(0).toUpperCase()}${lead.slice(1)} ${compared}.${others}`;
}
function weeksOf(slots, after, since, now) {
  const count3 = Math.max(0, Math.floor((now - since) / WEEK_MS)) + 1;
  const buckets = Array.from({ length: count3 }, emptySums);
  for (const measure of after) {
    const bucket = buckets[Math.floor((measure.startedAt - since) / WEEK_MS)];
    if (bucket !== void 0) {
      add(bucket, measure);
    }
  }
  return buckets.map((sums, index) => ({
    start: since + index * WEEK_MS,
    sessions: sums.sessions,
    values: slots.map((slot) => sums.sessions === 0 ? null : METRICS[slot.id].value(sums))
  })).slice(-MAX_WEEKS);
}
function impactOf(input) {
  const { since } = input;
  const used = input.measures.filter((measure) => measure.requests > 0);
  const before = used.filter(
    (m) => m.startedAt >= since - BASELINE_MS && m.startedAt < since && m.updatedAt < since
  );
  const after = used.filter((m) => m.startedAt >= since);
  const targetSlot = { id: input.tracking.target, role: "target", why: "" };
  const otherSlots = othersOf(input.tracking);
  const slots = [targetSlot, ...otherSlots];
  const beforeSums = sumsOf(before);
  const afterSums = sumsOf(after);
  const target = metricOf(targetSlot, beforeSums, afterSums);
  const others = otherSlots.map((slot) => metricOf(slot, beforeSums, afterSums));
  const metrics = [target, ...others];
  let verdict;
  if (before.length === 0) {
    verdict = "no-baseline";
  } else if (after.length < MIN_SESSIONS_AFTER) {
    verdict = "early";
  } else {
    verdict = verdictOf(metrics);
  }
  return {
    trackedSince: since,
    verdict,
    summary: summaryOf({ verdict, target, others, before: before.length, after: after.length }),
    sessionsBefore: before.length,
    sessionsAfter: after.length,
    metrics,
    weeks: weeksOf(slots, after, since, input.now)
  };
}

// src/core/tuning/rule-type.ts
function ratio(part, whole) {
  return whole === 0 ? 0 : part / whole;
}

// src/core/tuning/rules-spend.ts
function fileReadUsd(measure) {
  return measure.spend.fileReads + measure.subagentSpend.fileReads;
}
function setupUsd(measure) {
  return measure.spend.setup + measure.subagentSpend.setup;
}
function skillUsd(measure) {
  return measure.spend.skills + measure.subagentSpend.skills;
}
function instructionUsd(measure) {
  return measure.spend.instructions + measure.subagentSpend.instructions;
}
function topSkill(totals) {
  const top = Object.entries(totals.skillUsd).toSorted((left, right) => right[1] - left[1])[0];
  return top === void 0 ? "" : ` ${skillName(top[0])} cost the most, ${usd(top[1])}.`;
}
var SPEND_RULES = [
  {
    id: "file-reads",
    severity: "high",
    title: "Files read once are paid for on every later request",
    advice: [
      "Hand searches and reading around to a subagent such as scout, so only its short answer lands in the main context.",
      "Read the lines you need with Read and an offset, or grep for them, instead of cat or sed over a whole file.",
      "Keep the files sessions read most short, so reading one part does not mean reading all of it."
    ],
    fixes: ["scout"],
    pros: [
      "A file read on request 20 of a 400 request session is sent 380 more times. Reading a tenth as much saves on all of them.",
      "Smaller files also make edits more precise, since Claude sees only the part it is changing."
    ],
    cons: [
      "Splitting files is a refactor: it touches imports and can conflict with other work in progress.",
      "A subagent does not share what it read, so the main session may ask it again or read the file itself."
    ],
    track: {
      target: "fileReadShare",
      watch: [{ metric: "extraReads", why: "Reading less at once can mean reading more often." }]
    },
    skipWhen: "A short session, or one that reads a file and is done soon after, pays little to carry it.",
    finding: (t) => t.totalUsd < 1 || ratio(t.spend.fileReads, t.totalUsd) < 0.12 ? null : `${percent(ratio(t.spend.fileReads, t.totalUsd))} of the spend (${usd(t.spend.fileReads)}) went to carrying files after reading them with Read, cat, sed, head or tail: each stayed in context and was sent again with every later request.`,
    flags: (m) => fileReadUsd(m) >= 1 && ratio(fileReadUsd(m), sessionUsd(m)) >= 0.15,
    metric: fileReadUsd,
    detail: (m) => `${usd(fileReadUsd(m))} carrying files`
  },
  {
    id: "unused-tools",
    severity: "medium",
    title: "Every request carries tools that never get used",
    advice: [
      "Add tools you never use to permissions.deny. A denied tool is left out of the request, so its definition stops costing tokens."
    ],
    fixes: [],
    pros: [
      "The saving applies to every request of every session and subagent, with nothing to remember."
    ],
    cons: [
      "A denied tool is gone until you take it off the list, so Claude cannot use it on the rare day it would help."
    ],
    knobs: ["permissions.deny"],
    track: { target: "setupShare", watch: [] },
    skipWhen: "Keep a tool you use now and then, even if only in a few sessions.",
    finding: (t) => {
      const tools = unusedTools(t);
      const cost = tools.reduce((total, tool) => total + tool.usd, 0);
      return tools.length === 0 || cost < 2 ? null : `The definitions of ${tools.map((tool) => tool.name).join(", ")} went out with every request, about ${usd(cost)} in total, yet sessions almost never call them.`;
    },
    flags: (m) => setupUsd(m) >= 1 && ratio(setupUsd(m), sessionUsd(m)) >= 0.15,
    metric: setupUsd,
    detail: (m) => `${usd(setupUsd(m))} on the system prompt and tools`
  },
  {
    id: "heavy-skills",
    severity: "medium",
    title: "Skills cost more to carry than they need to",
    advice: [
      "Keep a SKILL.md to the steps Claude needs every time, and move reference material into files it reads only when needed.",
      "Remove skills and plugins you do not use, since the skill list goes out with every request."
    ],
    fixes: [],
    pros: [
      "A loaded skill stays in context for the rest of the session, so every line cut is saved on each later request."
    ],
    cons: ["Material moved out of SKILL.md is only read when Claude thinks to read it."],
    track: { target: "skillShare", watch: [] },
    skipWhen: "A short skill, or one used only in short sessions, costs little to carry.",
    finding: (t) => t.totalUsd < 1 || ratio(t.spend.skills, t.totalUsd) < 0.04 ? null : `The skill list and loaded skills cost ${usd(t.spend.skills)}, ${percent(ratio(t.spend.skills, t.totalUsd))} of the spend.${topSkill(t)}`,
    flags: (m) => skillUsd(m) >= 0.5 && ratio(skillUsd(m), sessionUsd(m)) >= 0.05,
    metric: skillUsd,
    detail: (m) => `${usd(skillUsd(m))} carrying skills`
  },
  {
    id: "instructions",
    severity: "low",
    title: "CLAUDE.md and memory are sent with every request",
    advice: [
      "Keep CLAUDE.md files and the memory index short: one line per rule, no examples that restate it."
    ],
    fixes: [],
    pros: ["Every request of every session and subagent gets cheaper."],
    cons: ["A rule cut too short can be misread, and a dropped one is not followed."],
    track: {
      target: "instructionShare",
      watch: [{ metric: "failures", why: "A rule that got lost can mean more mistakes." }]
    },
    skipWhen: "Leave a rule long when its detail keeps Claude from a costly mistake.",
    finding: (t) => t.totalUsd < 1 || ratio(t.spend.instructions, t.totalUsd) < 0.03 ? null : `CLAUDE.md files and memory cost ${usd(t.spend.instructions)}, ${percent(ratio(t.spend.instructions, t.totalUsd))} of the spend, because they go out with every request.`,
    flags: (m) => instructionUsd(m) >= 0.5 && ratio(instructionUsd(m), sessionUsd(m)) >= 0.04,
    metric: instructionUsd,
    detail: (m) => `${usd(instructionUsd(m))} carrying CLAUDE.md`
  }
];

// src/core/tuning/rules.ts
var DAY_MS = 24 * 60 * 6e4;
function failures(measure) {
  return measure.toolErrors - measure.denials;
}
function exploreNote(totals) {
  return totals.spawns < 10 ? "" : ` Only ${totals.exploreSpawns.toLocaleString("en-US")} of ${plural(totals.spawns, "spawn")} used the read-only Explore agent.`;
}
function homeNote(totals) {
  return totals.homeSessions === 0 ? "" : ` ${plural(totals.homeSessions, "session")} started in your home folder, where no project CLAUDE.md loads.`;
}
var RULES = [
  ...SPEND_RULES,
  {
    id: "context-reread",
    severity: "high",
    title: "Most of the spend is re-reading old context",
    advice: [
      "Every request sends the whole conversation again, so the 300th turn of a session costs far more than the 3rd. When you move on to a new task, start a new session instead of continuing the old one.",
      'Use /clear when you switch to something unrelated, and /compact with a focus (for example "/compact keep the plan and the failing test") at natural breakpoints.',
      "Run /context to see what fills the window before deciding what to drop."
    ],
    fixes: ["handoff", "scout"],
    pros: [
      "Requests get cheaper in proportion to the context you drop: going from 400K tokens to 40K makes each turn about 10 times cheaper.",
      "A short context keeps Claude focused, since old dead ends and stale copies of files are not there to confuse it."
    ],
    cons: [
      "/clear and a new session drop everything Claude learned along the way: the decisions, the dead ends and the files it read. Getting back costs a rebuild, and Claude can repeat a mistake it had already ruled out.",
      "/compact keeps a summary, but a summary loses detail such as exact error text or why an approach failed."
    ],
    track: {
      target: "averageContext",
      watch: [
        { metric: "extraReads", why: "A fresh session reads the files again." },
        { metric: "failures", why: "Claude can repeat a mistake it had already ruled out." }
      ]
    },
    skipWhen: "Keep going in the long session while you are in the middle of hard debugging or a design that took many turns to reach. Write a handoff note first as a safety net, and start fresh once that task is done.",
    finding: (t) => t.totalUsd < 1 || ratio(t.cacheReadUsd, t.totalUsd) < 0.4 ? null : `${percent(ratio(t.cacheReadUsd, t.totalUsd))} of the ${usd(t.totalUsd)} estimated spend (${usd(t.cacheReadUsd)}) went to re-reading cached context. The average request carried ${tokens(ratio(t.contextTokens, t.requests))} tokens of conversation.`,
    flags: (m) => m.cost.cacheRead >= 1 && ratio(m.cost.cacheRead, sessionUsd(m)) >= 0.5,
    metric: (m) => m.cost.cacheRead,
    detail: (m) => `${usd(m.cost.cacheRead)} re-reading context`
  },
  {
    id: "huge-context",
    severity: "high",
    title: "Sessions grow huge without compacting",
    advice: [
      "Lower autoCompactWindow in ~/.claude/settings.json (for example to 300000) so Claude Code compacts long before the 1M limit. Compaction keeps a summary and drops the bulk.",
      "Before a session gets that large, write a handoff note and carry on in a fresh session."
    ],
    fixes: ["handoff"],
    pros: [
      "Compaction happens on its own, so no session drags 900K tokens through every turn.",
      "It works on every session without you remembering to do anything."
    ],
    cons: [
      "Auto compaction picks the moment, sometimes in the middle of a task, and the summary can drop details you still needed.",
      "After a compaction Claude may reread files to get them back, which eats into the savings."
    ],
    knobs: ["autoCompactWindow"],
    track: {
      target: "largeShare",
      watch: [{ metric: "extraReads", why: "After a compaction Claude may reread files." }]
    },
    skipWhen: "Leave the window large for work that needs a lot in view at once, such as a refactor across many files. You can set autoCompactWindow per project instead of for every session.",
    finding: (t) => t.largeSessions === 0 ? null : `${plural(t.largeSessions, "session")} went past ${tokens(LARGE_CONTEXT)} tokens of context, the largest to ${tokens(t.largestContext)}. Only ${plural(t.compactions, "compaction")} happened across all sessions.`,
    flags: (m) => m.peakContext > LARGE_CONTEXT,
    metric: (m) => m.peakContext,
    detail: (m) => `${tokens(m.peakContext)} peak context`
  },
  {
    id: "idle-rewrite",
    severity: "medium",
    title: "Resuming big sessions after a break rewrites the cache",
    advice: [
      "After a long break, start a new session from a short summary instead of resuming a huge one.",
      "If you plan to come back, run /compact before stepping away so the rewrite is small."
    ],
    fixes: ["handoff"],
    pros: [
      "Writing a 500K context back into the cache costs about $2.50 at Opus 5.5 prices. A compacted or fresh session costs cents."
    ],
    cons: [
      "Compacting before a break gives up detail you may want when you come back.",
      "If you come back before the cache expires, the rewrite never happens, so the compaction was for nothing."
    ],
    track: {
      target: "idleUsd",
      watch: [{ metric: "extraReads", why: "Coming back to a summary means reading files again." }]
    },
    skipWhen: "Skip it for short breaks. The cache lasts at least 5 minutes after the last request, so picking up again soon costs nothing extra.",
    finding: (t) => t.idleRewrites < 3 ? null : `${plural(t.idleRewrites, "time")} a large session was picked up after its prompt cache expired, so its whole context was written to the cache again, about ${usd(t.idleRewriteUsd)} in total.`,
    flags: (m) => m.idleRewrites > 0,
    metric: (m) => m.idleRewriteUsd,
    detail: (m) => `${plural(m.idleRewrites, "rewrite")}, ${usd(m.idleRewriteUsd)}`
  },
  {
    id: "subagent-model",
    severity: "medium",
    title: "Subagents run on the most expensive models",
    advice: [
      "Set CLAUDE_CODE_SUBAGENT_MODEL to sonnet in the env block of ~/.claude/settings.json, or haiku for pure searching, so subagents default to a cheaper model.",
      "Give your own agents a model field in their frontmatter.",
      "Ask for the Explore agent for read-only searches instead of general-purpose."
    ],
    fixes: ["scout"],
    pros: [
      "Sonnet costs about half of Opus per token and Haiku a small fraction, and most subagent work is searching and summarizing."
    ],
    cons: [
      "A smaller model can miss subtle problems in a review or a tricky investigation, and a wrong summary costs more than the tokens it saved.",
      "The setting applies to every subagent without its own model, including ones you count on for careful work."
    ],
    knobs: ["CLAUDE_CODE_SUBAGENT_MODEL"],
    track: {
      target: "premiumShare",
      watch: [{ metric: "failures", why: "A smaller model can get things wrong more often." }]
    },
    skipWhen: "Keep Opus for subagents that review code, plan designs or debug. Set model: opus in those agents and let the cheaper default cover the rest.",
    finding: (t) => t.subagentRequests < 50 || ratio(t.premiumSubagentRequests, t.subagentRequests) < 0.8 ? null : `${percent(ratio(t.premiumSubagentRequests, t.subagentRequests))} of ${plural(t.subagentRequests, "subagent request")} ran on Opus or Fable, about ${usd(t.subagentUsd)} in total.${exploreNote(t)}`,
    flags: (m) => m.premiumSubagentRequests >= 10,
    metric: (m) => m.subagentUsd,
    detail: (m) => `${usd(m.subagentUsd)} in subagents`
  },
  {
    id: "big-results",
    severity: "medium",
    title: "Huge tool output stays in context",
    advice: [
      "Filter output before Claude sees it: grep, head and tail, quiet or summary flags, or write it to a file and read only the part that matters.",
      "Ask for line ranges of large files instead of whole files.",
      "BASH_MAX_OUTPUT_LENGTH in the env block of ~/.claude/settings.json caps how many characters of Bash output come back."
    ],
    fixes: ["quiet-run", "scout"],
    pros: [
      "A huge result stays in context for every later turn, so trimming it once saves on all of them."
    ],
    cons: [
      "A filter can hide the line that mattered, such as a warning above the error you grepped for, and then Claude guesses or runs the command again.",
      "BASH_MAX_OUTPUT_LENGTH cuts output off at a fixed size without knowing what is important."
    ],
    knobs: ["BASH_MAX_OUTPUT_LENGTH"],
    track: {
      target: "bigResults",
      watch: [
        {
          metric: "repeats",
          why: "A filter that hides the line that mattered means running again."
        }
      ]
    },
    skipWhen: "Let the full output through when you do not know yet what you are looking for, such as the first run of an unfamiliar failure. Saving it to a file keeps it available either way.",
    finding: (t) => t.bigResults < 3 ? null : `${plural(t.bigResults, "tool result")} were over 40K characters (about 10K tokens each), and each stayed in context for the rest of its session.`,
    flags: (m) => m.bigResults > 0,
    metric: (m) => m.bigResults,
    detail: (m) => plural(m.bigResults, "huge result")
  },
  {
    id: "repeated-commands",
    severity: "medium",
    title: "The same commands run over and over",
    advice: [
      "Polling a build, server or CI run from the main session sends the whole context again each time. Ask Claude to run it in the background and wait for it, or hand it to an agent.",
      "When a fix and retry loop repeats the same command, stop and ask for a diagnosis before the next attempt."
    ],
    fixes: ["ci-watch", "dev-server", "quiet-run"],
    pros: [
      "Each poll from the main session sends the whole context again. Waiting in the background costs nothing until the result arrives."
    ],
    cons: [
      "In the background you do not watch progress as it happens, and an agent adds a little startup time.",
      "Stopping a retry loop to diagnose takes a turn that feels slower in the moment."
    ],
    track: { target: "repeats", watch: [] },
    skipWhen: "A quick command you rerun after each small edit, such as one test or a build that takes seconds, is fine to run directly.",
    finding: (t) => t.repeatedRuns < 10 || t.topRepeat === null ? null : `Identical commands ran again ${plural(t.repeatedRuns, "time")} after their second run. The most repeated ran ${plural(t.topRepeat.runs, "time")}: ${t.topRepeat.command}`,
    flags: (m) => m.repeatedRuns >= 3,
    metric: (m) => m.repeatedRuns,
    detail: (m) => plural(m.repeatedRuns, "repeat")
  },
  {
    id: "long-sessions",
    severity: "medium",
    title: "Long sessions mix several tasks",
    advice: [
      "Keep one task per session, and start the next one with /clear or a new Claude tab.",
      "Put facts every session needs in CLAUDE.md or a skill instead of building them up in a long conversation."
    ],
    fixes: ["handoff"],
    pros: [
      "Each task starts with only what it needs, so it costs less and Claude does not mix up details between tasks."
    ],
    cons: [
      "Related tasks share a lot: the files, the conventions and the gotchas found along the way. A new session has to learn them again unless they are in CLAUDE.md or a handoff note."
    ],
    track: {
      target: "longShare",
      watch: [{ metric: "extraReads", why: "Each new session learns the same files again." }]
    },
    skipWhen: "Stay in one session when the tasks build on each other, such as fixing a bug and then the tests it broke. Split when the next task is unrelated.",
    finding: (t) => t.longSessions < 2 ? null : `${plural(t.longSessions, "session")} ran past ${LONG_SESSION_PROMPTS.toString()} prompts, the longest to ${t.longestPrompts.toLocaleString("en-US")}. Each task in a long session pays for the context of the ones before it.`,
    flags: (m) => m.prompts > LONG_SESSION_PROMPTS,
    metric: (m) => m.prompts,
    detail: (m) => plural(m.prompts, "prompt")
  },
  {
    id: "denials",
    severity: "medium",
    title: "Tool calls keep getting denied",
    advice: [
      "Run /fewer-permission-prompts to add allow rules for the read-only commands Claude keeps asking for.",
      "Add permissions.allow rules to your settings for tools you always allow.",
      "Say in CLAUDE.md which commands are off limits, so Claude does not try them."
    ],
    fixes: [],
    pros: ["Fewer interruptions, and no wasted turns on commands that were going to be refused."],
    cons: [
      "Every allow rule is a command Claude can run without asking. A broad rule, such as all of Bash, removes a check you may want.",
      "The auto mode classifier denies things for a reason. Allowing around it defeats the point of auto mode."
    ],
    track: {
      target: "denials",
      watch: [{ metric: "failures", why: "Commands that run without asking can still fail." }]
    },
    skipWhen: "Keep denying commands that change shared state: pushes, deletes, deploys, and anything touching production or the network.",
    finding: (t) => t.denials < 10 ? null : `${plural(t.denials, "tool call")} were denied by you or by the auto mode classifier. Each denial costs a round trip and usually a retry with another command.`,
    flags: (m) => m.denials >= 2,
    metric: (m) => m.denials,
    detail: (m) => plural(m.denials, "denial")
  },
  {
    id: "rereads",
    severity: "low",
    title: "Files are read again and again",
    advice: [
      "Each read of a whole file adds it to context again. Ask for the lines you need, or grep for them.",
      "For files Claude needs in every session, a short summary in CLAUDE.md is cheaper than rereading them."
    ],
    fixes: ["scout"],
    pros: ["Reading a range or grepping costs a fraction of reading a whole file again."],
    cons: [
      "After an edit, a reread is how Claude sees the current file. Cutting it risks edits made against a stale copy."
    ],
    track: {
      target: "extraReads",
      watch: [{ metric: "failures", why: "Edits made against a stale copy fail." }]
    },
    skipWhen: "A reread after the file changed (an edit, a formatter or a git operation) is worth it.",
    finding: (t) => t.extraReads < 10 ? null : `Files were read again ${plural(t.extraReads, "time")} after their second read in the same session.`,
    flags: (m) => m.extraReads >= 3,
    metric: (m) => m.extraReads,
    detail: (m) => plural(m.extraReads, "extra read")
  },
  {
    id: "tool-errors",
    severity: "low",
    title: "Many tool calls fail",
    advice: [
      "Put the exact build, test and lint commands in CLAUDE.md so Claude uses the right ones first.",
      "Note required setup (tools, environment variables, services) in CLAUDE.md so commands do not fail on a missing piece."
    ],
    fixes: [],
    pros: ["Claude gets the command right the first time instead of trying variations."],
    cons: [
      "CLAUDE.md loads into every session, so each line costs tokens on every request. Instructions also go stale when the project changes."
    ],
    track: {
      target: "failures",
      watch: [
        { metric: "averageContext", why: "Every line in CLAUDE.md is sent with each request." }
      ]
    },
    skipWhen: "Some failures are the point: a failing test or a type error is how Claude finds the problem. Only setup mistakes and wrong commands are waste.",
    finding: (t) => t.toolCalls < 100 || ratio(t.toolErrors - t.denials, t.toolCalls) < 0.05 ? null : `${percent(ratio(t.toolErrors - t.denials, t.toolCalls))} of ${plural(t.toolCalls, "tool call")} failed, not counting denials.`,
    flags: (m) => failures(m) >= 10 && ratio(failures(m), m.toolCalls) >= 0.1,
    metric: failures,
    detail: (m) => plural(failures(m), "failure")
  },
  {
    id: "cd-commands",
    severity: "low",
    title: "Commands keep changing folders",
    advice: [
      "Start sessions in the project folder (run claude from the repo) so project CLAUDE.md files and skills load and commands run in the right place.",
      "Claude Code can put the shell back in the session folder between commands, so a cd often has to be repeated. Absolute paths or git -C avoid that."
    ],
    fixes: [],
    pros: [
      "Project CLAUDE.md files, skills and settings load, and commands run where they belong without a cd each time."
    ],
    cons: [
      "Work that spans several repos has no single right folder, so some cd commands or absolute paths cannot be avoided."
    ],
    track: { target: "cdShare", watch: [] },
    skipWhen: "Starting in your home folder is fine for quick questions that are not about one project.",
    finding: (t) => t.bashCommands < 100 || ratio(t.cdCommands, t.bashCommands) < 0.1 ? null : `${percent(ratio(t.cdCommands, t.bashCommands))} of ${plural(t.bashCommands, "shell command")} started with cd.${homeNote(t)}`,
    flags: (m) => m.cdCommands >= 10 && ratio(m.cdCommands, m.bashCommands) >= 0.2,
    metric: (m) => m.cdCommands,
    detail: (m) => `${m.cdCommands.toLocaleString("en-US")} of ${plural(m.bashCommands, "command")} start with cd`
  },
  {
    id: "transcript-cleanup",
    severity: "low",
    title: "Claude Code deletes old transcripts",
    advice: [
      `Raise cleanupPeriodDays in ~/.claude/settings.json to ${KEEP_DAYS.toString()} or more, so sessions stay on disk long enough for /tune to compare months and for /resume to reach them.`,
      "This covers every place Claude Code runs, the VS Code extension and the desktop app included, since they all save to ~/.claude/projects."
    ],
    fixes: [],
    pros: [
      "/tune measures sessions it never scanned in time, like a VS Code session from five weeks ago, and /resume can still open them."
    ],
    cons: [
      "Transcripts take disk space under ~/.claude/projects, roughly in proportion to the days kept."
    ],
    track: null,
    skipWhen: "Disk space is tight, or you never look back at sessions older than a month.",
    finding: (t, env) => {
      const set = env.knob("cleanupPeriodDays");
      const days = keptDays(set);
      if (days >= KEEP_DAYS || t.oldestUpdatedAt === null) {
        return null;
      }
      const age = (env.now - t.oldestUpdatedAt) / DAY_MS;
      if (age < days - 2) {
        return null;
      }
      const why = typeof set === "number" ? `cleanupPeriodDays is ${days.toString()}` : "the default";
      return `Claude Code deletes a transcript once it goes unused for ${plural(days, "day")} (${why}), so the oldest session left is from ${new Date(t.oldestUpdatedAt).toISOString().slice(0, 10)}. /tune keeps what it measured for a year, but a session it never scanned before then is gone for good.`;
    },
    flags: () => false,
    metric: () => 0,
    detail: () => ""
  }
];
function cacheReadShare(measure) {
  return ratio(measure.cost.cacheRead, costTotal(measure.cost) + measure.subagentUsd);
}

// src/core/tuning/build.ts
var SESSIONS_PER_TIP = 5;
var SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };
function worstSessions(rule, measures) {
  return measures.filter((measure) => rule.flags(measure)).toSorted((left, right) => rule.metric(right) - rule.metric(left)).slice(0, SESSIONS_PER_TIP).map((measure) => ({
    sessionId: measure.sessionId,
    title: measure.title,
    detail: rule.detail(measure)
  }));
}
var NO_ENV = {
  hotFiles: [],
  knob: () => null,
  installed: /* @__PURE__ */ new Set(),
  home: "",
  projectOf: (cwd) => cwd,
  modifiedAt: () => null
};
var NO_LONGER = "This no longer stands out across your sessions. It stays here while you track it.";
function buildTips(inputs) {
  const tips = [];
  const fixContext = {
    ...inputs.fixEnv ?? NO_ENV,
    totals: inputs.totals,
    live: inputs.live
  };
  for (const rule of RULES) {
    const finding = rule.finding(inputs.totals, { knob: fixContext.knob, now: inputs.now });
    const since = inputs.tracked.get(rule.id);
    if (finding === null && since === void 0) {
      continue;
    }
    tips.push({
      id: rule.id,
      severity: rule.severity,
      title: rule.title,
      finding: finding ?? NO_LONGER,
      advice: rule.advice,
      sessions: worstSessions(rule, inputs.live),
      fixes: rule.fixes,
      autoFixes: autoFixesFor(rule.id, fixContext),
      pros: rule.pros,
      cons: rule.cons,
      skipWhen: rule.skipWhen,
      impact: since === void 0 || rule.track === null ? null : impactOf({ tracking: rule.track, since, measures: inputs.all, now: inputs.now })
    });
  }
  return tips.toSorted(
    (left, right) => SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity]
  );
}
function tipsTakenBy(step) {
  return RULES.filter(
    (rule) => step.kind === "knob" ? (rule.knobs ?? []).includes(step.key) : rule.fixes.includes(step.id)
  ).map((rule) => rule.id);
}
function isTipId(id) {
  return RULES.some((rule) => rule.id === id);
}
function tipsFor(measure, tips) {
  const applied = new Set(tips.map((tip) => tip.id));
  return RULES.filter((rule) => applied.has(rule.id) && rule.flags(measure)).map((rule) => rule.id);
}

// src/core/tuning/readers.ts
var import_node_fs2 = require("node:fs");
function knobReader(effective) {
  return (key) => {
    const found = effective.find((value) => value.key === key) ?? effective.find((value) => value.key === `env.${key}`);
    return found?.chain.find((link) => link.layer === "user")?.value ?? found?.value;
  };
}
function modifiedCheck() {
  const known = /* @__PURE__ */ new Map();
  return (path13) => {
    let found = known.get(path13);
    if (found === void 0) {
      found = (0, import_node_fs2.statSync)(path13, { throwIfNoEntry: false })?.mtimeMs ?? null;
      known.set(path13, found);
    }
    return found;
  };
}

// src/core/tuning/sessions.ts
var import_promises4 = require("node:fs/promises");

// src/core/transcripts/reader.ts
var import_node_buffer = require("node:buffer");
var import_promises = require("node:fs/promises");
var NEWLINE = 10;
var CARRIAGE_RETURN = 13;
var CHUNK_BYTES = 1024 * 1024;
function decodeLine(bytes) {
  const trimmed = bytes.at(-1) === CARRIAGE_RETURN ? bytes.subarray(0, -1) : bytes;
  return trimmed.toString("utf8");
}
var LineSplitter = class {
  pending = import_node_buffer.Buffer.alloc(0);
  push(chunk) {
    const data = this.pending.length === 0 ? chunk : import_node_buffer.Buffer.concat([this.pending, chunk]);
    const lines = [];
    let start = 0;
    let end = data.indexOf(NEWLINE, start);
    while (end !== -1) {
      lines.push(decodeLine(data.subarray(start, end)));
      start = end + 1;
      end = data.indexOf(NEWLINE, start);
    }
    this.pending = import_node_buffer.Buffer.from(data.subarray(start));
    return lines;
  }
  /** Bytes held back because their line has no newline yet. */
  get pendingBytes() {
    return this.pending.length;
  }
  reset() {
    this.pending = import_node_buffer.Buffer.alloc(0);
  }
};
function isMissing(error) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
var IncrementalReader = class {
  constructor(filePath) {
    this.filePath = filePath;
  }
  filePath;
  offset = 0;
  inode = null;
  splitter = new LineSplitter();
  /** Byte offset of the next read. */
  get position() {
    return this.offset;
  }
  /** New complete lines since the last call. A missing file gives no lines. */
  async read() {
    let size;
    let inode;
    try {
      const info = await (0, import_promises.stat)(this.filePath);
      size = info.size;
      inode = info.ino;
    } catch (error) {
      if (isMissing(error)) {
        return { lines: [], reset: false };
      }
      throw error;
    }
    const replaced = this.inode !== null && inode !== this.inode;
    const reset = replaced || size < this.offset;
    if (reset) {
      this.offset = 0;
      this.splitter.reset();
    }
    this.inode = inode;
    const lines = size > this.offset ? await this.readRange(size) : [];
    return { lines, reset };
  }
  async readRange(size) {
    const handle = await (0, import_promises.open)(this.filePath, "r");
    try {
      const lines = [];
      const buffer = import_node_buffer.Buffer.alloc(Math.min(CHUNK_BYTES, size - this.offset));
      let bytesRead = 1;
      while (this.offset < size && bytesRead > 0) {
        const length = Math.min(buffer.length, size - this.offset);
        ({ bytesRead } = await handle.read(buffer, 0, length, this.offset));
        this.offset += bytesRead;
        for (const line of this.splitter.push(buffer.subarray(0, bytesRead))) {
          lines.push(line);
        }
      }
      return lines;
    } finally {
      await handle.close();
    }
  }
};
async function readAllLines(filePath) {
  const result = await new IncrementalReader(filePath).read();
  return result.lines;
}

// src/core/transcripts/scanner.ts
var import_promises2 = require("node:fs/promises");
var import_node_path5 = __toESM(require("node:path"), 1);
async function listDir(dir) {
  try {
    return await (0, import_promises2.readdir)(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}
async function statOrNull(target) {
  try {
    return await (0, import_promises2.stat)(target);
  } catch {
    return null;
  }
}
async function describeSession(projectPath, fileName) {
  const transcriptPath = import_node_path5.default.join(projectPath, fileName);
  const info = await statOrNull(transcriptPath);
  if (info === null) {
    return null;
  }
  const sessionId = fileName.slice(0, -".jsonl".length);
  const sessionDir = import_node_path5.default.join(projectPath, sessionId);
  const subagents = await statOrNull(import_node_path5.default.join(sessionDir, "subagents"));
  return {
    sessionId,
    projectDir: import_node_path5.default.basename(projectPath),
    transcriptPath,
    sessionDir,
    mtimeMs: Math.max(info.mtimeMs, subagents?.mtimeMs ?? 0),
    size: info.size
  };
}
async function scanSessions(projectsDir) {
  const sessions = [];
  for (const project of await listDir(projectsDir)) {
    if (!project.isDirectory()) {
      continue;
    }
    const projectPath = import_node_path5.default.join(projectsDir, project.name);
    for (const entry of await listDir(projectPath)) {
      if ((entry.isFile() || entry.isSymbolicLink()) && entry.name.endsWith(".jsonl")) {
        const described = await describeSession(projectPath, entry.name);
        if (described !== null) {
          sessions.push(described);
        }
      }
    }
  }
  return sessions.toSorted((left, right) => right.mtimeMs - left.mtimeMs);
}

// src/core/transcripts/subagents.ts
var import_promises3 = require("node:fs/promises");
var import_node_path6 = __toESM(require("node:path"), 1);
var looseString3 = _catch(nullish2(string2()), null);
var subagentMetaSchema = object({
  agentType: _catch(string2(), "unknown"),
  description: _catch(string2(), ""),
  toolUseId: looseString3,
  parentAgentId: looseString3,
  spawnDepth: _catch(int().check(_nonnegative()), 1),
  requestShape: looseString3,
  model: looseString3
});
var AGENT_FILE = /^agent-(.+)\.jsonl$/u;
function agentIdFromFileName(name) {
  return AGENT_FILE.exec(name)?.[1] ?? null;
}
function parseSubagentMeta(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  const result = subagentMetaSchema.safeParse(value);
  return result.success ? result.data : null;
}
async function listSubagentFiles(sessionDir) {
  const root = import_node_path6.default.join(sessionDir, "subagents");
  let entries;
  try {
    entries = await (0, import_promises3.readdir)(root, { recursive: true });
  } catch {
    return [];
  }
  const files = [];
  for (const entry of entries.toSorted((left, right) => left.localeCompare(right))) {
    const agentId = agentIdFromFileName(import_node_path6.default.basename(entry));
    if (agentId !== null) {
      const transcriptPath = import_node_path6.default.join(root, entry);
      files.push({
        agentId,
        transcriptPath,
        metaPath: transcriptPath.replace(/\.jsonl$/u, ".meta.json")
      });
    }
  }
  return files;
}

// src/core/tuning/sessions.ts
var JSONL = ".jsonl";
async function claudeTuningSessions(projectsDir) {
  const found = await scanSessions(projectsDir);
  return found.map((info) => ({
    sessionId: info.sessionId,
    path: info.transcriptPath,
    mtimeMs: info.mtimeMs,
    size: info.size
  }));
}
async function readInfo(metaPath) {
  try {
    const meta2 = parseSubagentMeta(await (0, import_promises4.readFile)(metaPath, "utf8"));
    return meta2 === null ? null : { type: meta2.agentType, description: meta2.description };
  } catch {
    return null;
  }
}
async function measureClaudeSession(session) {
  const sessionDir = session.path.slice(0, -JSONL.length);
  const subagents = [];
  const subagentInfo = [];
  for (const file of await listSubagentFiles(sessionDir)) {
    subagents.push(await readAllLines(file.transcriptPath));
    subagentInfo.push(await readInfo(file.metaPath));
  }
  return measureSession({
    sessionId: session.sessionId,
    main: await readAllLines(session.path),
    subagents,
    subagentInfo,
    fallbackAt: session.mtimeMs
  });
}

// src/core/tuning/scan.ts
var HISTORY_MS = 365 * 24 * 60 * 6e4;
function sameStamp(left, right) {
  return left?.mtimeMs === right.mtimeMs && left.size === right.size;
}
function markGone(index, seen, now) {
  let changed = 0;
  for (const [file, entry] of index.entries) {
    if (seen.has(file)) {
      continue;
    }
    if (now - entry.measure.updatedAt > HISTORY_MS) {
      index.entries.delete(file);
      changed += 1;
    } else if (entry.live) {
      index.entries.set(file, { ...entry, live: false });
      changed += 1;
    }
  }
  return changed;
}
async function scanFound(index, sessions, now) {
  const seen = /* @__PURE__ */ new Set();
  let filesRead = 0;
  for (const session of sessions) {
    seen.add(session.path);
    const stamp = { mtimeMs: session.mtimeMs, size: session.size };
    const known = index.entries.get(session.path);
    if (!sameStamp(known?.stamp, stamp)) {
      index.entries.set(session.path, { stamp, measure: await measureClaudeSession(session), live: true });
      filesRead += 1;
    } else if (known !== void 0 && !known.live) {
      index.entries.set(session.path, { ...known, live: true });
      filesRead += 1;
    }
  }
  const filesGone = markGone(index, seen, now);
  index.scannedAt = now;
  return { filesRead, filesGone };
}
async function scanInto(index, projectsDir, now) {
  return scanFound(index, await claudeTuningSessions(projectsDir), now);
}

// src/core/knobs/atomic-file.ts
var import_node_crypto2 = require("node:crypto");
var import_promises5 = require("node:fs/promises");
var import_node_path7 = __toESM(require("node:path"), 1);
var MAX_LINK_HOPS = 40;
async function resolveLinkTarget(file) {
  let current = import_node_path7.default.resolve(file);
  for (let hop = 0; hop < MAX_LINK_HOPS; hop += 1) {
    let isLink;
    try {
      const info = await (0, import_promises5.lstat)(current);
      isLink = info.isSymbolicLink();
    } catch (error) {
      if (isNotFound(error)) {
        return current;
      }
      throw error;
    }
    if (!isLink) {
      return current;
    }
    current = import_node_path7.default.resolve(import_node_path7.default.dirname(current), await (0, import_promises5.readlink)(current));
  }
  throw new Error(`Too many symbolic links at ${file}`);
}
async function readOptional(file) {
  try {
    return await (0, import_promises5.readFile)(file, "utf8");
  } catch (error) {
    if (isNotFound(error)) {
      return null;
    }
    throw error;
  }
}
async function existingMode(file) {
  try {
    const info = await (0, import_promises5.stat)(file);
    return info.mode % 512;
  } catch {
    return void 0;
  }
}
async function writeFileAtomic(write) {
  const dir = import_node_path7.default.dirname(write.target);
  await (0, import_promises5.mkdir)(dir, { recursive: true });
  const mode = await existingMode(write.target);
  if (write.backup !== null) {
    const previous = await readOptional(write.target);
    if (previous !== null) {
      await (0, import_promises5.writeFile)(write.backup, previous, { mode });
    }
  }
  const scratch = import_node_path7.default.join(dir, `.${import_node_path7.default.basename(write.target)}.${(0, import_node_crypto2.randomUUID)()}.tmp`);
  try {
    await (0, import_promises5.writeFile)(scratch, write.content, { mode });
    await (0, import_promises5.rename)(scratch, write.target);
  } catch (error) {
    await (0, import_promises5.rm)(scratch, { force: true });
    throw error;
  }
}

// src/core/tuning/store.ts
var count2 = number2().check(_nonnegative());
var counts = record(string2(), count2);
var costSchema = object({
  input: count2,
  output: count2,
  cacheRead: count2,
  cacheWrite: count2
});
var hourSchema = object({
  at: number2(),
  usd: count2,
  subagentUsd: count2,
  premiumUsd: count2,
  premiumSavingUsd: count2,
  subagentSavingUsd: count2,
  bigContextUsd: count2,
  idleRewriteUsd: count2
});
var spendSchema = object({
  setup: count2,
  instructions: count2,
  skills: count2,
  reminders: count2,
  fileReads: count2,
  toolOutput: count2,
  web: count2,
  toolInputs: count2,
  subagentReports: count2,
  conversation: count2,
  output: count2
});
var measureSchema = object({
  sessionId: string2(),
  title: string2(),
  cwd: nullable(string2()),
  entrypoint: nullable(string2()),
  startedAt: number2(),
  updatedAt: number2(),
  prompts: count2,
  requests: count2,
  peakContext: count2,
  contextTokens: count2,
  compactions: count2,
  cost: costSchema,
  idleRewrites: count2,
  idleRewriteUsd: count2,
  compactSavingUsd: count2,
  bigResults: count2,
  extraReads: count2,
  repeatedRuns: count2,
  topRepeat: nullable(object({ command: string2(), runs: count2 })),
  toolCalls: count2,
  toolErrors: count2,
  denials: count2,
  bashCommands: count2,
  cdCommands: count2,
  cdTargets: counts,
  spawns: counts,
  subagentRequests: count2,
  premiumSubagentRequests: count2,
  subagentUsd: count2,
  families: object({
    land: count2,
    ci: count2,
    server: count2,
    buildTest: count2,
    search: count2
  }),
  hours: readonly(array(hourSchema)),
  stack: counts,
  spend: spendSchema,
  subagentSpend: spendSchema,
  heavy: readonly(
    array(object({ source: _enum(SPEND_SOURCES), label: string2(), tokens: count2, usd: count2 }))
  ),
  files: counts,
  skills: counts,
  toolSchemas: counts,
  toolUses: counts,
  subagents: readonly(
    array(
      object({
        type: string2(),
        description: string2(),
        usd: count2,
        requests: count2,
        peakContext: count2
      })
    )
  )
});
var VERSION = 2;
var fileSchema = object({
  version: literal(VERSION),
  scannedAt: nullable(number2()),
  entries: record(
    string2(),
    object({
      stamp: object({ mtimeMs: number2(), size: number2() }),
      measure: measureSchema,
      live: boolean2()
    })
  )
});
function emptyIndex() {
  return { entries: /* @__PURE__ */ new Map(), scannedAt: null };
}
function parseIndex(text) {
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = fileSchema.safeParse(json);
  if (!parsed.success) {
    return null;
  }
  return { entries: new Map(Object.entries(parsed.data.entries)), scannedAt: parsed.data.scannedAt };
}
async function loadIndex(file) {
  const text = await readOptional(file);
  return (text === null ? null : parseIndex(text)) ?? emptyIndex();
}
async function saveIndex(file, index) {
  const data = {
    version: VERSION,
    scannedAt: index.scannedAt,
    entries: Object.fromEntries(index.entries)
  };
  await writeFileAtomic({ target: file, content: `${JSON.stringify(data)}
`, backup: null });
}

// src/core/tuning/source.ts
var LABELS = {
  cli: "CLI",
  "claude-vscode": "VS Code",
  "claude-desktop": "Desktop",
  "sdk-cli": "claude -p"
};
function sourceOf(entrypoint) {
  if (entrypoint === null || entrypoint === "") {
    return "unknown";
  }
  return LABELS[entrypoint] ?? (entrypoint.startsWith("sdk-") ? "Agent SDK" : entrypoint);
}
function sourceSlices(measures) {
  const slices = /* @__PURE__ */ new Map();
  for (const measure of measures) {
    const label = sourceOf(measure.entrypoint);
    const slice = slices.get(label) ?? { sessions: 0, usd: 0 };
    slices.set(label, { sessions: slice.sessions + 1, usd: slice.usd + sessionUsd(measure) });
  }
  return [...slices].map(([label, slice]) => ({ label, ...slice })).toSorted((left, right) => right.usd - left.usd);
}

// src/core/tuning/costly.ts
var COSTLY_SESSIONS = 8;
var COSTLY_MIN_USD = 3;
var HOT_FILES = 15;
var HOT_MIN_SESSIONS = 2;
var CAUSE_SHARE = 0.08;
var BIG_AVERAGE = 15e4;
function spendSlices(split) {
  const whole = SPEND_SOURCES.reduce((total, source) => total + split[source], 0);
  return SPEND_SOURCES.map((source) => ({
    source,
    label: SPEND_LABELS[source],
    usd: split[source],
    share: whole === 0 ? 0 : split[source] / whole
  })).filter((slice) => slice.usd > 0).toSorted((left, right) => right.usd - left.usd);
}
function shortPath(file, cwd) {
  return cwd !== null && file.startsWith(`${cwd}/`) ? file.slice(cwd.length + 1) : file;
}
function inputUsd(measure) {
  return measure.cost.input + measure.cost.cacheRead + measure.cost.cacheWrite;
}
function subagentSaving(measure) {
  let saving = 0;
  for (const hour of measure.hours) {
    saving += hour.subagentSavingUsd;
  }
  return saving;
}
function biggest(record2) {
  return Object.entries(record2).toSorted((left, right) => right[1] - left[1])[0];
}
function unusedSchemaUsd(measure, unused) {
  let total = 0;
  for (const [name, value] of Object.entries(measure.toolSchemas)) {
    total += unused.has(name) ? value : 0;
  }
  return total;
}
function contextCause({ m }) {
  const average = m.requests === 0 ? 0 : m.contextTokens / m.requests;
  if (average < BIG_AVERAGE) {
    return null;
  }
  const sent = `Each of ${plural(m.requests, "request")} re-sent ${tokens(average)} tokens on average (peak ${tokens(m.peakContext)})`;
  return {
    id: "context",
    text: `${sent}, so carrying context cost ${usd(inputUsd(m))}. Compacting at 200K would have saved about ${usd(m.compactSavingUsd)}.`,
    usd: inputUsd(m),
    savedUsd: m.compactSavingUsd,
    tipId: "huge-context"
  };
}
function subagentCause({ m }) {
  const [top] = m.subagents;
  if (m.subagentUsd === 0 || top === void 0) {
    return null;
  }
  const name = `${top.type} "${top.description}"`;
  const worst = ` The biggest, ${name}, cost ${usd(top.usd)} over ${plural(top.requests, "request")} with a ${tokens(top.peakContext)} peak.`;
  const saving = subagentSaving(m);
  const sonnet = saving > 0 ? ` Running them on Sonnet would have saved about ${usd(saving)}.` : "";
  return {
    id: "subagents",
    text: `Subagents cost ${usd(m.subagentUsd)}.${worst}${sonnet}`,
    usd: m.subagentUsd,
    savedUsd: saving > 0 ? saving : null,
    tipId: "subagent-model"
  };
}
function fileCause({ m, split }) {
  const top = biggest(m.files);
  const worst = top === void 0 ? "" : `, most of all ${shortPath(top[0], m.cwd)} (${usd(top[1])})`;
  return {
    id: "file-reads",
    text: `Files read with Read, cat and sed stayed in context and cost ${usd(split.fileReads)} to carry${worst}.`,
    usd: split.fileReads,
    savedUsd: null,
    tipId: "file-reads"
  };
}
function setupCause({ m, split, unused }) {
  const saving = unusedSchemaUsd(m, unused);
  const idle = saving > 0 ? ` Tools sessions here rarely call made up ${usd(saving)} of it.` : "";
  return {
    id: "setup",
    text: `The system prompt and tool definitions went out with every request and cost ${usd(split.setup)}.${idle}`,
    usd: split.setup,
    savedUsd: saving > 0 ? saving : null,
    tipId: saving > 0 ? "unused-tools" : null
  };
}
function inputCause({ split }) {
  return {
    id: "tool-inputs",
    text: `Files Claude wrote with Write and Edit, and long shell scripts, stayed in context and cost ${usd(split.toolInputs)} to carry. Edit sends less than writing a whole file again.`,
    usd: split.toolInputs,
    savedUsd: null,
    tipId: null
  };
}
function outputCause({ split }) {
  return {
    id: "tool-output",
    text: `Command and search output cost ${usd(split.toolOutput)} to carry.`,
    usd: split.toolOutput,
    savedUsd: null,
    tipId: "big-results"
  };
}
function skillCause({ m, split }) {
  const top = biggest(m.skills);
  const most = top === void 0 ? "" : `, ${skillName(top[0])} the most (${usd(top[1])})`;
  return {
    id: "skills",
    text: `The skill list and loaded skills cost ${usd(split.skills)}${most}.`,
    usd: split.skills,
    savedUsd: null,
    tipId: "heavy-skills"
  };
}
function replyCause({ split }) {
  return {
    id: "output",
    text: `Claude's own replies and thinking cost ${usd(split.output)} in output tokens.`,
    usd: split.output,
    savedUsd: null,
    tipId: null
  };
}
function idleCause({ m }) {
  if (m.idleRewrites === 0) {
    return null;
  }
  return {
    id: "idle",
    text: `${plural(m.idleRewrites, "time")} the session was picked up after its cache expired and wrote its context again, ${usd(m.idleRewriteUsd)}.`,
    usd: m.idleRewriteUsd,
    savedUsd: m.idleRewriteUsd,
    tipId: "idle-rewrite"
  };
}
var CAUSES = [
  contextCause,
  subagentCause,
  fileCause,
  setupCause,
  inputCause,
  outputCause,
  skillCause,
  replyCause,
  idleCause
];
function causesOf(measure, unused) {
  const split = addSpend(measure.spend, measure.subagentSpend);
  const whole = sessionUsd(measure);
  return CAUSES.flatMap((rule) => {
    const cause = rule({ m: measure, split, unused });
    return cause !== null && cause.usd >= whole * CAUSE_SHARE ? [cause] : [];
  }).toSorted(
    (left, right) => (right.savedUsd ?? 0) - (left.savedUsd ?? 0) || right.usd - left.usd
  );
}
function costlySessions(measures, unused) {
  return measures.filter((measure) => sessionUsd(measure) >= COSTLY_MIN_USD).toSorted((left, right) => sessionUsd(right) - sessionUsd(left)).slice(0, COSTLY_SESSIONS).map((measure) => ({
    sessionId: measure.sessionId,
    title: measure.title,
    cwd: measure.cwd,
    source: sourceOf(measure.entrypoint),
    updatedAt: measure.updatedAt,
    usd: sessionUsd(measure),
    subagentUsd: measure.subagentUsd,
    requests: measure.requests,
    averageContext: measure.requests === 0 ? 0 : measure.contextTokens / measure.requests,
    peakContext: measure.peakContext,
    spend: spendSlices(addSpend(measure.spend, measure.subagentSpend)),
    causes: causesOf(measure, unused),
    heavy: measure.heavy.map((item) => ({
      ...item,
      label: item.label.replace(`${measure.cwd ?? "\0"}/`, "")
    })),
    subagents: measure.subagents
  }));
}
function insideProject(file) {
  return !file.startsWith("/") && !file.startsWith("~") && !file.startsWith("..");
}
function readsSinceChange(file, changedAt) {
  if (changedAt === void 0) {
    return file.reads;
  }
  const changed = changedAt(`${file.project}/${file.path}`);
  return changed === null ? [] : file.reads.filter((read) => read.startedAt >= changed);
}
function hotFiles(measures, projectOf, changedAt) {
  const found = /* @__PURE__ */ new Map();
  for (const measure of measures) {
    const cwd = measure.cwd;
    const project = cwd === null ? "" : projectOf(cwd);
    for (const [file, value] of Object.entries(measure.files)) {
      const base = cwd !== null && file.startsWith(`${cwd}/`) ? cwd : project;
      const inside = shortPath(file, base === "" ? null : base);
      if (project === "" || !insideProject(inside)) {
        continue;
      }
      const key = `${project}\0${inside}`;
      const entry = found.get(key) ?? { project, path: inside, reads: [] };
      entry.reads.push({ startedAt: measure.startedAt, usd: value });
      found.set(key, entry);
    }
  }
  return [...found.values()].filter((file) => file.reads.length >= HOT_MIN_SESSIONS).map((file) => {
    const reads = readsSinceChange(file, changedAt);
    return {
      project: file.project,
      path: file.path,
      usd: reads.reduce((total, read) => total + read.usd, 0),
      sessions: reads.length
    };
  }).filter((file) => file.sessions >= HOT_MIN_SESSIONS).toSorted((left, right) => right.usd - left.usd).slice(0, HOT_FILES);
}

// src/core/tuning/summarize.ts
var MAX_ROWS = 200;
function summarize(inputs) {
  const measures = inputs.measures.filter((measure) => measure.requests > 0);
  const totals = totalsOf(measures, inputs.home);
  const projectOf = inputs.projectOf ?? ((cwd) => cwd);
  const hot = hotFiles(measures, projectOf, inputs.modifiedAt);
  const tips = buildTips({
    totals,
    live: measures,
    all: [...measures, ...inputs.history],
    tracked: inputs.tracked,
    now: inputs.now,
    fixEnv: {
      hotFiles: hot,
      knob: inputs.knob ?? (() => void 0),
      installed: inputs.installed,
      home: inputs.home,
      projectOf,
      modifiedAt: inputs.modifiedAt ?? (() => null)
    }
  });
  const unused = new Set(unusedTools(totals).map((tool) => tool.name));
  const rows = measures.map((measure) => ({
    sessionId: measure.sessionId,
    title: measure.title,
    source: sourceOf(measure.entrypoint),
    updatedAt: measure.updatedAt,
    prompts: measure.prompts,
    requests: measure.requests,
    peakContext: measure.peakContext,
    averageContext: measure.contextTokens / measure.requests,
    costUsd: sessionUsd(measure),
    cacheReadShare: cacheReadShare(measure),
    tips: tipsFor(measure, tips)
  })).toSorted((left, right) => right.costUsd - left.costUsd).slice(0, MAX_ROWS);
  return {
    sessions: totals.sessions,
    totalUsd: totals.totalUsd,
    cacheReadUsd: totals.cacheReadUsd,
    averageContext: totals.requests === 0 ? 0 : totals.contextTokens / totals.requests,
    largestContext: totals.largestContext,
    subagentUsd: totals.subagentUsd,
    spend: spendSlices(totals.spend),
    sources: sourceSlices(measures),
    costly: costlySessions(measures, unused),
    hotFiles: hot,
    tips,
    suggestions: buildSuggestions(totals, inputs.installed),
    rows,
    scannedAt: inputs.scannedAt
  };
}

// src/core/tuning/tracked.ts
var fileSchema2 = object({
  version: literal(1),
  tips: record(string2(), object({ since: number2() }))
});
async function loadTracked(file) {
  const text = await readOptional(file);
  if (text === null) {
    return /* @__PURE__ */ new Map();
  }
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return /* @__PURE__ */ new Map();
  }
  const parsed = fileSchema2.safeParse(json);
  if (!parsed.success) {
    return /* @__PURE__ */ new Map();
  }
  return new Map(Object.entries(parsed.data.tips).map(([id, entry]) => [id, entry.since]));
}
async function saveTracked(file, tracked) {
  const data = {
    version: 1,
    tips: Object.fromEntries([...tracked].map(([id, since]) => [id, { since }]))
  };
  await writeFileAtomic({
    target: file,
    content: `${JSON.stringify(data)}
`,
    backup: `${file}.bak`
  });
}

// src/cli/install.ts
var import_promises6 = require("node:fs/promises");
var import_node_path8 = __toESM(require("node:path"), 1);
var PLUGIN_ID = "tune@shanep";
function shimScript(fallbackRoot) {
  return `#!/usr/bin/env node
// Written by \`tune install\`. It finds the installed tune plugin on each run,
// so it keeps working when the plugin updates.
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 3)) {
  process.stderr.write(
    'tune: it needs Node 22.3 or newer, and \`node\` here is ' + process.version + '.\\n' +
      'Put a newer node first on your PATH.\\n',
  );
  process.exit(1);
}

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const fallback = ${JSON.stringify(fallbackRoot)};

function bundleIn(root) {
  const file = path.join(root, 'dist', 'tune.cjs');
  return fs.existsSync(file) ? file : null;
}

function installed() {
  try {
    const list = JSON.parse(
      fs.readFileSync(path.join(claudeDir, 'plugins', 'installed_plugins.json'), 'utf8'),
    );
    for (const entry of list.plugins[${JSON.stringify(PLUGIN_ID)}] || []) {
      const file = bundleIn(entry.installPath);
      if (file !== null) {
        return file;
      }
    }
  } catch {
    // No list, or not one this script understands, so use the fallback.
  }
  return null;
}

const bundle = installed() || bundleIn(fallback);
if (bundle === null) {
  process.stderr.write(
    'tune: the tune plugin is not installed. Run: claude plugin install ${PLUGIN_ID}\\n',
  );
  process.exit(1);
}
require(bundle);
`;
}
async function installShim(dir, fallbackRoot) {
  await (0, import_promises6.mkdir)(dir, { recursive: true });
  const file = import_node_path8.default.join(dir, "tune");
  await (0, import_promises6.writeFile)(file, shimScript(fallbackRoot));
  await (0, import_promises6.chmod)(file, 493);
  return file;
}
async function isCommand(file) {
  try {
    await (0, import_promises6.access)(file, import_promises6.constants.X_OK);
    return (await (0, import_promises6.stat)(file)).isFile();
  } catch {
    return false;
  }
}
async function pathProblem(file, pathValue) {
  const dir = import_node_path8.default.resolve(import_node_path8.default.dirname(file));
  for (const entry of (pathValue ?? "").split(import_node_path8.default.delimiter)) {
    if (entry === "") {
      continue;
    }
    if (import_node_path8.default.resolve(entry) === dir) {
      return null;
    }
    const other = import_node_path8.default.join(import_node_path8.default.resolve(entry), import_node_path8.default.basename(file));
    if (await isCommand(other)) {
      return { kind: "shadowed", by: other };
    }
  }
  return { kind: "not-on-path", dir };
}

// src/cli/installed.ts
var import_node_fs3 = require("node:fs");
var import_node_path9 = __toESM(require("node:path"), 1);
function suggestionFile(dirs, definition) {
  const name = nameOf(definition);
  return definition.kind === "skill" ? import_node_path9.default.join(dirs.skillsDir, name, "SKILL.md") : import_node_path9.default.join(dirs.agentsDir, `${name}.md`);
}
function installedSuggestions(libraries, exists = import_node_fs3.existsSync) {
  const installed = /* @__PURE__ */ new Set();
  for (const definition of SUGGESTIONS) {
    if (libraries.some((dirs) => exists(suggestionFile(dirs, definition)))) {
      installed.add(definition.id);
    }
  }
  return installed;
}
function librariesFor(user, projectRoot2) {
  return projectRoot2 === null ? [user] : [
    user,
    {
      skillsDir: import_node_path9.default.join(projectRoot2, ".claude", "skills"),
      agentsDir: import_node_path9.default.join(projectRoot2, ".claude", "agents")
    }
  ];
}

// src/cli/report.ts
var DEFAULT_REPORT = {
  costly: 5,
  hotFiles: 8,
  tipSessions: 3
};
function day(at) {
  return new Date(at).toISOString().slice(0, 10);
}
function shortPath2(folder, home) {
  return home !== "" && (folder === home || folder.startsWith(`${home}/`)) ? `~${folder.slice(home.length)}` : folder;
}
function tidyPaths(text, home) {
  const saved = text.replaceAll(/\S*\/tool-results\/([^\s/()]+?)(?=[\s().,:]|$)/gu, "saved tool output $1");
  return home === "" ? saved : saved.replaceAll(`${home}/`, "~/");
}
function oneLine3(text, max = 80) {
  const flat = text.replaceAll(/\s+/gu, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 3)}...` : flat;
}
function fixLine(fix2) {
  const status = fix2.applied ? " (already applied)" : "";
  return `- \`${fix2.id}\` [${fix2.kind}]${status} ${fix2.title}. ${fix2.detail}`;
}
function impactLines(impact) {
  return [
    `Tracked since ${day(impact.trackedSince)}: **${impact.verdict}** (${plural(impact.sessionsBefore, "session")} before, ${plural(impact.sessionsAfter, "session")} after). ${impact.summary}`
  ];
}
function tipLines(tip, options) {
  const lines = [`### ${tip.title} \`${tip.id}\` (${tip.severity})`, "", tip.finding, ""];
  if (tip.impact !== null) {
    lines.push(...impactLines(tip.impact), "");
  }
  lines.push("Advice:", ...tip.advice.map((text) => `- ${text}`), "");
  if (tip.cons.length > 0) {
    lines.push(`Gives up: ${tip.cons.join(" ")}`, `Skip when: ${tip.skipWhen}`, "");
  }
  const sessions = tip.sessions.slice(0, options.tipSessions);
  if (sessions.length > 0) {
    lines.push(
      "Worst sessions:",
      ...sessions.map((session) => `- ${oneLine3(session.title)}: ${session.detail}`),
      ""
    );
  }
  if (tip.autoFixes.length > 0) {
    lines.push("Fixes:", ...tip.autoFixes.map((fix2) => fixLine(fix2)), "");
  }
  return lines;
}
function costlyLines(session, home) {
  const where = session.cwd === null ? "" : ` in ${shortPath2(session.cwd, home)}`;
  const lines = [
    `### ${oneLine3(session.title)}: ${usd(session.usd)}`,
    "",
    `${day(session.updatedAt)}${where}, from ${session.source}. ${plural(session.requests, "request")}, ${tokens(session.averageContext)} average and ${tokens(session.peakContext)} peak context, ${usd(session.subagentUsd)} in subagents.`
  ];
  const spend = session.spend.slice(0, 4).map((slice) => `${slice.label} ${usd(slice.usd)}`).join(", ");
  if (spend !== "") {
    lines.push(`Spend: ${spend}.`);
  }
  if (session.causes.length > 0) {
    lines.push(
      "",
      "Causes:",
      ...session.causes.map((cause) => {
        const saved = cause.savedUsd === null ? "" : ` Fixing it saves about ${usd(cause.savedUsd)}.`;
        const tip = cause.tipId === null ? "" : ` (tip \`${cause.tipId}\`)`;
        return `- ${tidyPaths(cause.text, home)}${saved}${tip}`;
      })
    );
  }
  const heavy = session.heavy.slice(0, 3);
  if (heavy.length > 0) {
    lines.push(
      "",
      "Heaviest items:",
      ...heavy.map((item) => `- ${oneLine3(tidyPaths(item.label, home))}: ${tokens(item.tokens)} tokens, ${usd(item.usd)}`)
    );
  }
  lines.push("");
  return lines;
}
function hotLine(file, home) {
  const where = file.project === "" ? file.path : `${shortPath2(file.project, home)}/${file.path}`;
  return `- ${where}: ${usd(file.usd)} over ${plural(file.sessions, "session")}`;
}
function renderReport(state, options) {
  if (state.sessions === 0) {
    return "# Claude Code tuning\n\nNo sessions with requests yet, so there is nothing to tune.\n";
  }
  const cacheShare = state.totalUsd === 0 ? 0 : state.cacheReadUsd / state.totalUsd;
  const lines = [
    "# Claude Code tuning",
    "",
    `${plural(state.sessions, "session")}, ${usd(state.totalUsd)} at list price. ${percent(cacheShare)} of it re-read cached context, ${usd(state.subagentUsd)} went to subagents. Average context ${tokens(state.averageContext)} tokens, largest ${tokens(state.largestContext)}.`,
    ""
  ];
  if (state.sources.length > 0) {
    const sources = state.sources.map((slice) => `${slice.label} ${plural(slice.sessions, "session")} (${usd(slice.usd)})`).join(", ");
    lines.push(`By where they ran: ${sources}.`, "");
  }
  if (state.spend.length > 0) {
    lines.push(
      "## Where the spend went",
      "",
      ...state.spend.map((slice) => `- ${slice.label}: ${usd(slice.usd)} (${percent(slice.share)})`),
      ""
    );
  }
  lines.push("## Tips", "");
  if (state.tips.length === 0) {
    lines.push("Nothing stands out across your sessions.", "");
  }
  for (const tip of state.tips) {
    lines.push(...tipLines(tip, options));
  }
  const costly = state.costly.slice(0, options.costly);
  if (costly.length > 0) {
    lines.push("## Costliest sessions", "");
    for (const session of costly) {
      lines.push(...costlyLines(session, options.home));
    }
  }
  const hot = state.hotFiles.slice(0, options.hotFiles);
  if (hot.length > 0) {
    lines.push(
      "## Hot files",
      "",
      "Files sessions kept reading, by what carrying them in context cost.",
      "",
      ...hot.map((file) => hotLine(file, options.home)),
      ""
    );
  }
  const suggestions = state.suggestions.filter((item) => !item.installed && item.reason !== null);
  if (suggestions.length > 0) {
    lines.push(
      "## Suggested skills and agents",
      "",
      ...suggestions.map(
        (item) => `- \`create:${item.id}\` ${item.name} (${item.kind}): ${item.summary} ${item.reason ?? ""}`.trimEnd()
      ),
      ""
    );
  }
  if (state.scannedAt !== null) {
    lines.push(`Scanned ${new Date(state.scannedAt).toISOString()}.`);
  }
  return `${lines.join("\n").trimEnd()}
`;
}

// src/cli/settings.ts
var import_promises7 = require("node:fs/promises");
var import_node_path10 = __toESM(require("node:path"), 1);
function managedSettingsFile(platform) {
  return platform === "darwin" ? "/Library/Application Support/ClaudeCode/managed-settings.json" : "/etc/claude-code/managed-settings.json";
}
function settingsFiles(input) {
  const project = input.projectRoot === null ? [] : [
    {
      layer: "project-local",
      file: import_node_path10.default.join(input.projectRoot, ".claude", "settings.local.json")
    },
    { layer: "project", file: import_node_path10.default.join(input.projectRoot, ".claude", "settings.json") }
  ];
  return [
    { layer: "managed", file: managedSettingsFile(input.platform) },
    ...project,
    { layer: "user", file: input.userSettings }
  ];
}
function flatten(value, prefix = "") {
  const out = /* @__PURE__ */ new Map();
  for (const [key, child] of Object.entries(value)) {
    const dotted = prefix === "" ? key : `${prefix}.${key}`;
    if (isPlainObject(child)) {
      for (const [inner, leaf] of flatten(child, dotted)) {
        out.set(inner, leaf);
      }
    } else {
      out.set(dotted, child);
    }
  }
  return out;
}
async function readSettings(file) {
  let text;
  try {
    text = await readOptional(file);
  } catch {
    return null;
  }
  if (text === null) {
    return null;
  }
  try {
    const parsed = JSON.parse(text);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
async function effectiveSettings(files, env) {
  const chains = /* @__PURE__ */ new Map();
  const add2 = (key, link) => {
    const chain = chains.get(key) ?? [];
    chain.push(link);
    chains.set(key, chain);
  };
  for (const { layer, file } of files) {
    const settings = await readSettings(file);
    if (settings !== null) {
      for (const [key, value] of flatten(settings)) {
        add2(key, { layer, value, file });
      }
    }
  }
  for (const [key, value] of Object.entries(env)) {
    if (value !== void 0) {
      add2(key, { layer: "env", value, file: null });
    }
  }
  return [...chains].map(([key, chain]) => {
    const [winner] = chain;
    return { key, value: winner?.value, layer: winner?.layer ?? "default", chain };
  });
}
var ENV_NAME = /^[A-Z][A-Z0-9_]*$/u;
function settingsPath(key) {
  return ENV_NAME.test(key) ? ["env", key] : key.split(".");
}
function indentOf(text) {
  const match = /^\{\s*\n([ \t]+)\S/u.exec(text);
  return match?.[1] ?? "  ";
}
function withKey(value, keys, next) {
  const [first, ...rest] = keys;
  if (first === void 0) {
    return value;
  }
  if (rest.length === 0) {
    return { ...value, [first]: next };
  }
  const child = value[first];
  return { ...value, [first]: withKey(isPlainObject(child) ? child : {}, rest, next) };
}
async function writeSetting(write) {
  const target = await resolveLinkTarget(write.file);
  const text = await readOptional(target);
  let current = {};
  if (text !== null && text.trim() !== "") {
    const parsed = JSON.parse(text);
    if (!isPlainObject(parsed)) {
      throw new Error(`${write.file} does not hold a JSON object, so /tune left it alone.`);
    }
    current = parsed;
  }
  const next = withKey(current, settingsPath(write.key), write.value);
  const indent = text === null ? "  " : indentOf(text);
  let backup = null;
  if (text !== null) {
    await (0, import_promises7.mkdir)(write.backupDir, { recursive: true });
    backup = import_node_path10.default.join(
      write.backupDir,
      `${import_node_path10.default.basename(target)}.${new Date(write.now).toISOString().replaceAll(":", "-")}.bak`
    );
  }
  await writeFileAtomic({ target, content: `${JSON.stringify(next, null, indent)}
`, backup });
  return { target, backup };
}

// src/cli/app.ts
async function load(env) {
  const { paths } = env;
  const now = env.now();
  const index = await loadIndex(paths.indexFile);
  const scan = await scanInto(index, paths.projectsDir, now);
  if (scan.filesRead > 0 || scan.filesGone > 0) {
    await saveIndex(paths.indexFile, index);
  }
  const tracked = await loadTracked(paths.trackedFile);
  const root = projectRoot(env.cwd, env.git);
  const files = settingsFiles({
    platform: env.platform,
    userSettings: paths.userSettings,
    projectRoot: root
  });
  const items = [...index.entries.values()];
  const state = summarize({
    measures: items.filter((item) => item.live).map((item) => item.measure),
    history: items.filter((item) => !item.live).map((item) => item.measure),
    tracked,
    now,
    installed: installedSuggestions(librariesFor(paths, root)),
    home: paths.home,
    scannedAt: index.scannedAt,
    knob: knobReader(await effectiveSettings(files, env.env)),
    projectOf: projectReader(env.git),
    modifiedAt: modifiedCheck()
  });
  return { state, tracked, scan };
}
async function report(env, json) {
  const { state } = await load(env);
  return json ? `${JSON.stringify(state, null, 2)}
` : renderReport(state, { ...DEFAULT_REPORT, home: env.paths.home });
}
function findFix(state, id) {
  let fix2 = null;
  const tipIds = [];
  for (const tip of state.tips) {
    const match = tip.autoFixes.find((item) => item.id === id);
    if (match !== void 0) {
      fix2 ??= match;
      tipIds.push(tip.id);
    }
  }
  return fix2 === null ? null : { fix: fix2, tipIds };
}
async function trackTaken(env, loaded, step) {
  const shown = new Set(loaded.state.tips.map((tip) => tip.id));
  const fresh = tipsTakenBy(step).filter((id) => shown.has(id) && !loaded.tracked.has(id));
  if (fresh.length > 0) {
    const now = env.now();
    for (const id of fresh) {
      loaded.tracked.set(id, now);
    }
    await saveTracked(env.paths.trackedFile, loaded.tracked);
  }
  return fresh;
}
function trackedNote(ids) {
  return ids.length === 0 ? [] : [`Now tracking ${ids.map((id) => `\`${id}\``).join(", ")}, so a later /tune shows the impact.`];
}
async function applyKnob(env, loaded, fix2, dryRun) {
  const value = JSON.stringify(fix2.value);
  if (fix2.applied) {
    return [`${fix2.key} is already set that way. Nothing to change.`];
  }
  if (dryRun) {
    return [`Would set ${fix2.key} to ${value} in ${env.paths.userSettings}.`];
  }
  const written = await writeSetting({
    file: env.paths.userSettings,
    key: fix2.key,
    value: fix2.value,
    backupDir: env.paths.backupDir,
    now: env.now()
  });
  const via = written.target === env.paths.userSettings ? "" : ` (through the link to ${written.target})`;
  const backup = written.backup === null ? [] : [`The old file is saved at ${written.backup}.`];
  return [
    `Set ${fix2.key} to ${value} in ${env.paths.userSettings}${via}. New sessions pick it up.`,
    ...backup,
    ...trackedNote(await trackTaken(env, loaded, { kind: "knob", key: fix2.key }))
  ];
}
async function applyCreate(env, loaded, suggestionId, dryRun) {
  const definition = findSuggestion(suggestionId);
  if (definition === null) {
    throw new Error(`There is no suggestion called ${suggestionId}.`);
  }
  const file = suggestionFile(env.paths, definition);
  const label = `the ${nameOf(definition)} ${definition.kind}`;
  if (dryRun) {
    return [`Would write ${label} to ${file}.`];
  }
  const text = definition.kind === "agent" ? renderAgent(definition.spec) : renderSkill(definition.spec);
  await (0, import_promises8.mkdir)(import_node_path11.default.dirname(file), { recursive: true });
  try {
    await (0, import_promises8.writeFile)(file, text, { flag: "wx" });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST") {
      return [`${file} is already there, so /tune left it alone.`];
    }
    throw error;
  }
  return [
    `Wrote ${label} to ${file}. New sessions can use it.`,
    ...trackedNote(await trackTaken(env, loaded, { kind: "suggestion", id: definition.id }))
  ];
}
function launchLines(fix2, tipIds) {
  const track2 = tipIds.map((id) => `tune track ${id}`).join(" and ");
  return [
    `# ${fix2.title}`,
    "",
    fix2.detail,
    "",
    `Folder: ${fix2.cwd}`,
    `New worktree: ${fix2.worktree ? "yes, make one from the default branch first" : "no"}`,
    `When it is done, run: ${track2}`,
    "",
    "## Task",
    "",
    fix2.prompt
  ];
}
async function fix(env, id, dryRun) {
  const loaded = await load(env);
  const found = findFix(loaded.state, id);
  let lines;
  if (found === null) {
    if (!id.startsWith("create:")) {
      throw new Error(`No fix called ${id} is on offer right now. Run /tune to see the list.`);
    }
    lines = await applyCreate(env, loaded, id.slice("create:".length), dryRun);
  } else if (found.fix.kind === "knob") {
    lines = await applyKnob(env, loaded, found.fix, dryRun);
  } else if (found.fix.kind === "create") {
    lines = await applyCreate(env, loaded, found.fix.suggestionId, dryRun);
  } else {
    lines = launchLines(found.fix, found.tipIds);
  }
  return `${lines.join("\n")}
`;
}
async function track(env, tipId, on) {
  if (!isTipId(tipId)) {
    throw new Error(`There is no tip called ${tipId}.`);
  }
  const tracked = await loadTracked(env.paths.trackedFile);
  if (on && tracked.has(tipId)) {
    return `Already tracking ${tipId}.
`;
  }
  if (on) {
    tracked.set(tipId, env.now());
  } else if (!tracked.delete(tipId)) {
    return `${tipId} was not tracked.
`;
  }
  await saveTracked(env.paths.trackedFile, tracked);
  return on ? `Tracking ${tipId} from now. A later /tune compares the sessions before and after.
` : `Stopped tracking ${tipId}.
`;
}
async function help(env) {
  try {
    await (0, import_promises8.access)(env.helpFile);
  } catch {
    throw new Error(`${env.helpFile} is missing. Run npm run build to make it.`);
  }
  try {
    await env.open(env.helpFile);
  } catch {
    return `Could not open a browser. The help page is at ${env.helpFile}.
`;
  }
  return `Opened ${env.helpFile}.
`;
}
async function install(env, dir) {
  const folder = dir ?? import_node_path11.default.join(env.paths.home, ".local", "bin");
  const file = await installShim(folder, env.pluginRoot);
  const problem = await pathProblem(file, env.env["PATH"]);
  const lines = [`Installed ${file}. Run tune help --open from any folder.`];
  if (problem?.kind === "not-on-path") {
    lines.push(`${problem.dir} is not on your PATH. Add it in your shell profile.`);
  } else if (problem?.kind === "shadowed") {
    lines.push(
      `${problem.by} runs instead, since it comes first on your PATH.`,
      `Put ${folder} ahead of it in your shell profile, or remove it.`
    );
  }
  return `${lines.join("\n")}
`;
}

// src/cli/run.ts
var USAGE = `Usage: tune <command>

  report [--json]          Scan the transcripts and print the tips, costliest
                           sessions and hot files (Markdown, or JSON).
  fix <fix-id> [--dry-run] Apply a setting or create fix, or print the task
                           for a launch fix. Tracks the tips it follows.
  track <tip-id> [--off]   Start or stop tracking a tip by hand.
  help [--open]            Show this, or open the full guide in your browser.
  install [dir]            Put a tune command in ~/.local/bin (or dir), so
                           tune runs from any folder.
`;
async function run(argv, env) {
  const flags = new Set(argv.filter((arg) => arg.startsWith("--")));
  const [command = "report", target] = argv.filter((arg) => !arg.startsWith("--"));
  switch (command) {
    case "report": {
      return report(env, flags.has("--json"));
    }
    case "fix": {
      if (target === void 0) {
        throw new Error("Name the fix to apply, like: tune fix knob:autoCompactWindow");
      }
      return fix(env, target, flags.has("--dry-run"));
    }
    case "track": {
      if (target === void 0) {
        throw new Error("Name the tip to track, like: tune track huge-context");
      }
      return track(env, target, !flags.has("--off"));
    }
    case "help": {
      return flags.has("--open") ? help(env) : `${USAGE}
Run tune help --open for the full guide.
`;
    }
    case "install": {
      return install(env, target);
    }
    default: {
      throw new Error(`Unknown command ${command}.

${USAGE}`);
    }
  }
}

// src/cli/main.ts
function openFile(file) {
  const command = import_node_process.default.platform === "darwin" ? "open" : "xdg-open";
  return new Promise((resolve, reject) => {
    (0, import_node_child_process2.execFile)(command, [file], (error) => {
      if (error === null) {
        resolve();
      } else {
        reject(error);
      }
    });
  });
}
var pluginRoot = import_node_path12.default.resolve(__dirname, "..");
function envNow() {
  return {
    paths: pathsFor(import_node_process.default.env, import_node_os.default.homedir()),
    cwd: import_node_process.default.cwd(),
    env: import_node_process.default.env,
    platform: import_node_process.default.platform,
    now: () => Date.now(),
    git: runGit,
    pluginRoot,
    helpFile: import_node_path12.default.join(pluginRoot, "dist", "help.html"),
    open: openFile
  };
}
run(import_node_process.default.argv.slice(2), envNow()).then(
  (out) => {
    import_node_process.default.stdout.write(out);
  },
  (error) => {
    import_node_process.default.stderr.write(`tune: ${error instanceof Error ? error.message : String(error)}
`);
    import_node_process.default.exitCode = 1;
  }
);
