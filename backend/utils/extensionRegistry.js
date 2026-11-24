const { URL } = require("url");
const registeredExtensions = /* @__PURE__ */ new Map();
const dynamicSubrequestHeaders = /* @__PURE__ */ new Map();
function registerExtension(ext) {
  if (!ext || !ext.name) return;
  registeredExtensions.set(ext.name, ext);
}
function unregisterExtension(name) {
  registeredExtensions.delete(name);
}
function clearRegisteredExtensions() {
  registeredExtensions.clear();
  dynamicSubrequestHeaders.clear();
}
function registerSubrequestHeaders(domainOrPattern, headers, ttlMs = 36e5) {
  if (!domainOrPattern || !headers || typeof headers !== "object") return;
  const key = String(domainOrPattern).toLowerCase().trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!key) return;
  dynamicSubrequestHeaders.set(key, {
    headers: { ...headers },
    expiresAt: Date.now() + ttlMs
  });
  const ref = headers.Referer || headers.referer;
  if (ref && typeof global.setDynamicReferer === "function") {
    try {
      global.setDynamicReferer(key, ref);
    } catch (_) {
    }
  }
}
function ruleMatches(rule, lowerUrl, domain) {
  if (!rule) return false;
  const match = rule.match || rule.domains || rule.domain;
  if (!match) return false;
  const patterns = Array.isArray(match) ? match : [match];
  return patterns.some((p) => {
    if (p instanceof RegExp) return p.test(lowerUrl);
    const lp = String(p).toLowerCase();
    return lowerUrl.includes(lp) || domain && (domain === lp || domain.endsWith("." + lp));
  });
}
function getExtensionHeaderRules(url) {
  if (!url) return { headers: {}, strip: [] };
  const lowerUrl = String(url).toLowerCase();
  let domain = "";
  try {
    domain = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch (_) {
  }
  const resultHeaders = {};
  const stripHeaders = [];
  const now = Date.now();
  for (const [pattern, entry] of dynamicSubrequestHeaders.entries()) {
    if (entry.expiresAt && now > entry.expiresAt) {
      dynamicSubrequestHeaders.delete(pattern);
      continue;
    }
    if (lowerUrl.includes(pattern) || domain && (domain === pattern || domain.endsWith("." + pattern))) {
      Object.assign(resultHeaders, entry.headers);
    }
  }
  for (const ext of registeredExtensions.values()) {
    if (Array.isArray(ext.subrequestHeaders)) {
      for (const rule of ext.subrequestHeaders) {
        if (ruleMatches(rule, lowerUrl, domain)) {
          if (rule.headers) Object.assign(resultHeaders, rule.headers);
          if (Array.isArray(rule.strip)) stripHeaders.push(...rule.strip);
        }
      }
    } else if (ext.subrequestHeaders && typeof ext.subrequestHeaders === "object") {
      for (const [pattern, hdrs] of Object.entries(ext.subrequestHeaders)) {
        const lp = pattern.toLowerCase();
        if (lowerUrl.includes(lp) || domain && (domain === lp || domain.endsWith("." + lp))) {
          Object.assign(resultHeaders, hdrs);
        }
      }
    }
    if (Array.isArray(ext.headerRules)) {
      for (const rule of ext.headerRules) {
        if (ruleMatches(rule, lowerUrl, domain)) {
          if (rule.headers) Object.assign(resultHeaders, rule.headers);
          if (Array.isArray(rule.strip)) stripHeaders.push(...rule.strip);
        }
      }
    }
    if (typeof ext.getHeaders === "function") {
      try {
        const custom = ext.getHeaders(url);
        if (custom && typeof custom === "object") {
          Object.assign(resultHeaders, custom);
        }
      } catch (_) {
      }
    }
  }
  return { headers: resultHeaders, strip: stripHeaders };
}
function getCookieDomains(cleanDomain) {
  if (!cleanDomain) return [];
  const targetDomains = [];
  for (const ext of registeredExtensions.values()) {
    if (Array.isArray(ext.cookieDomains)) {
      const match = ext.cookieDomains.some(
        (d) => cleanDomain.includes(d.toLowerCase())
      );
      if (match) {
        targetDomains.push(...ext.cookieDomains);
      }
    }
    if (ext.domainAliases && typeof ext.domainAliases === "object") {
      for (const [alias, canonical] of Object.entries(ext.domainAliases)) {
        if (cleanDomain.includes(alias.toLowerCase())) {
          targetDomains.push(canonical);
        }
      }
    }
  }
  return targetDomains;
}
function getCanonicalDomain(cleanDomain) {
  if (!cleanDomain) return cleanDomain;
  for (const ext of registeredExtensions.values()) {
    if (ext.domainAliases && typeof ext.domainAliases === "object") {
      for (const [alias, canonical] of Object.entries(ext.domainAliases)) {
        if (cleanDomain.includes(alias.toLowerCase())) {
          return canonical;
        }
      }
    }
  }
  return cleanDomain;
}
function isBypassableUrl(urlStr, refererStr) {
  const url = String(urlStr || "").toLowerCase();
  const ref = String(refererStr || "").toLowerCase();
  for (const ext of registeredExtensions.values()) {
    const list = ext.bypassDomains || [];
    for (const d of list) {
      const ld = String(d).toLowerCase();
      if (url.includes(ld) || ref.includes(ld)) return true;
    }
  }
  return false;
}
function isExtensionPageLoaded(domain, title, html) {
  if (!html) return false;
  const lowerDomain = String(domain || "").toLowerCase();
  for (const ext of registeredExtensions.values()) {
    if (typeof ext.isPageLoaded === "function") {
      const matches = ext.name && lowerDomain.includes(ext.name.toLowerCase()) || ext.bypassDomains && ext.bypassDomains.some(
        (d) => lowerDomain.includes(String(d).toLowerCase())
      ) || ext.baseUrl && lowerDomain.includes(new URL(ext.baseUrl).hostname.toLowerCase());
      if (matches) {
        try {
          if (ext.isPageLoaded(title, html)) return true;
        } catch (_) {
        }
      }
    }
  }
  return false;
}
global.registerExtension = registerExtension;
global.registerSubrequestHeaders = registerSubrequestHeaders;
global.registerStreamHeaders = registerSubrequestHeaders;
module.exports = {
  registerExtension,
  unregisterExtension,
  clearRegisteredExtensions,
  registerSubrequestHeaders,
  getExtensionHeaderRules,
  getCookieDomains,
  getCanonicalDomain,
  isBypassableUrl,
  isExtensionPageLoaded
};
