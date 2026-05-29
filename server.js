const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { URL } = require("node:url");

const publicDir = path.join(__dirname, "public");
const port = Number(process.env.PORT) || 80;

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const escapeXml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const cleanText = (value, fallback, maxLength) => {
  const text = String(value || fallback)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text.slice(0, maxLength) || fallback;
};

const cleanOptionalText = (value, maxLength) =>
  String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);

const cleanLines = (value, fallback, maxLines, maxLength) => {
  const lines = String(value || fallback)
    .replace(/\r\n/g, "\n")
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim().slice(0, maxLength))
    .filter(Boolean)
    .slice(0, maxLines);

  if (lines.length) {
    return lines;
  }

  return String(fallback)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, maxLines);
};

const cleanHex = (value, fallback = "9B5CFF") => {
  const hex = String(value || "").replace("#", "").trim();

  if (/^[0-9a-f]{3}$/i.test(hex)) {
    return hex
      .split("")
      .map((char) => char + char)
      .join("")
      .toUpperCase();
  }

  if (/^[0-9a-f]{6}$/i.test(hex)) {
    return hex.toUpperCase();
  }

  return fallback;
};

const themes = new Set(["clean", "liquid", "matrix"]);

const cleanTheme = (value) => {
  const theme = String(value || "liquid").toLowerCase();
  return themes.has(theme) ? theme : "liquid";
};

const cleanScale = (query) => {
  const scale = Number(query.get("scale"));
  return clamp(Number.isFinite(scale) ? scale : 100, 50, 130) / 100;
};

const cleanIconSlug = (value, fallback = "simpleicons") => {
  const slug = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 48);

  return slug || fallback;
};

const cleanList = (value, fallback, maxItems = 5, maxLength = 32) => {
  const items = String(value || "")
    .split(",")
    .map((item) => cleanOptionalText(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);

  return items.length ? items : fallback;
};

const iconCache = new Map();

const readAttribute = (source, name) => {
  const match = source.match(new RegExp(`\\s${name}="([^"]+)"`, "i"));
  return match ? match[1] : "";
};

const cleanSvgColor = (value, fallback = "#111111") =>
  /^#[0-9a-f]{3,8}$/i.test(value) ? value : fallback;

const parseSimpleIconSvg = (svgText) => {
  const svgTag = svgText.match(/<svg\b[^>]*>/i)?.[0] || "";
  const viewBox = readAttribute(svgTag, "viewBox") || "0 0 24 24";
  const rootFill = cleanSvgColor(readAttribute(svgTag, "fill"));
  const paths = (svgText.match(/<path\b[^>]*\/?>/gi) || [])
    .map((pathTag) => {
      const d = readAttribute(pathTag, "d");

      if (!d) {
        return "";
      }

      const fill = cleanSvgColor(readAttribute(pathTag, "fill"), rootFill);
      const fillRule = readAttribute(pathTag, "fill-rule");
      const clipRule = readAttribute(pathTag, "clip-rule");
      const fillRuleAttr = fillRule ? ` fill-rule="${escapeXml(fillRule)}"` : "";
      const clipRuleAttr = clipRule ? ` clip-rule="${escapeXml(clipRule)}"` : "";

      return `<path d="${escapeXml(d)}" fill="${fill}"${fillRuleAttr}${clipRuleAttr}/>`;
    })
    .filter(Boolean)
    .join("");

  return paths ? { viewBox: escapeXml(viewBox), paths } : null;
};

const fetchSimpleIcon = async (slug) => {
  const icon = cleanIconSlug(slug);

  if (iconCache.has(icon)) {
    return iconCache.get(icon);
  }

  if (typeof fetch !== "function") {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1800);

  try {
    const response = await fetch(`https://cdn.simpleicons.org/${icon}`, {
      signal: controller.signal,
      headers: { accept: "image/svg+xml" },
    });

    if (!response.ok) {
      throw new Error(`Simple Icons returned ${response.status}`);
    }

    const parsed = parseSimpleIconSvg(await response.text());
    iconCache.set(icon, parsed);
    return parsed;
  } catch {
    iconCache.set(icon, null);
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

const buildInlineSimpleIcon = async ({ icon, label, x, y, size, primary, text }) => {
  const source = await fetchSimpleIcon(icon);

  if (!source) {
    return buildSocialMark({
      label,
      cx: x + size / 2,
      cy: y + size / 2,
      size,
      primary,
      text,
    });
  }

  return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="${source.viewBox}" aria-hidden="true">${source.paths}</svg>`;
};

const getUrlHost = (value) => {
  const raw = String(value || "").trim();
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;

  try {
    const parsed = new URL(candidate);

    if (["http:", "https:"].includes(parsed.protocol)) {
      return parsed.hostname.replace(/^www\./, "").slice(0, 28);
    }
  } catch {
    return "";
  }

  return "";
};

const getSocialItems = (query) => {
  const labels = cleanList(query.get("labels"), ["GitHub", "Website", "Contact"], 5, 18);
  const icons = cleanList(
    query.get("icons"),
    ["github", "firefoxbrowser", "discord", "linktree", "simpleicons"],
    5,
    48,
  ).map((icon) => cleanIconSlug(icon));
  const links = cleanList(query.get("links"), ["https://gh.tex-api.com"], 5, 120);

  return labels.map((label, index) => ({
    label,
    icon: icons[index] || icons[0] || "simpleicons",
    host: getUrlHost(links[index] || links[0] || "https://gh.tex-api.com"),
  }));
};

const buildSocialMark = ({ label, cx, cy, size, primary, text }) => {
  const lower = label.toLowerCase();
  const strokeWidth = Math.max(2, Math.round(size / 13));

  if (lower.includes("web") || lower.includes("site") || lower.includes("link")) {
    return `<circle cx="${cx}" cy="${cy}" r="${Math.round(size * 0.34)}" fill="none" stroke="${text}" stroke-opacity="0.84" stroke-width="${strokeWidth}"/>
    <path d="M${cx - Math.round(size * 0.34)} ${cy} H${cx + Math.round(size * 0.34)} M${cx} ${cy - Math.round(size * 0.34)} C${cx - Math.round(size * 0.16)} ${cy - Math.round(size * 0.12)} ${cx - Math.round(size * 0.16)} ${cy + Math.round(size * 0.12)} ${cx} ${cy + Math.round(size * 0.34)} M${cx} ${cy - Math.round(size * 0.34)} C${cx + Math.round(size * 0.16)} ${cy - Math.round(size * 0.12)} ${cx + Math.round(size * 0.16)} ${cy + Math.round(size * 0.12)} ${cx} ${cy + Math.round(size * 0.34)}" fill="none" stroke="${primary}" stroke-width="${strokeWidth}" stroke-linecap="round"/>`;
  }

  if (lower.includes("mail") || lower.includes("contact") || lower.includes("email")) {
    const w = Math.round(size * 0.66);
    const h = Math.round(size * 0.46);
    const x = cx - Math.round(w / 2);
    const y = cy - Math.round(h / 2);

    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="none" stroke="${text}" stroke-opacity="0.84" stroke-width="${strokeWidth}"/>
    <path d="M${x + 3} ${y + 5} L${cx} ${y + Math.round(h * 0.62)} L${x + w - 3} ${y + 5}" fill="none" stroke="${primary}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }

  if (lower.includes("discord") || lower.includes("chat")) {
    const w = Math.round(size * 0.7);
    const h = Math.round(size * 0.52);
    const x = cx - Math.round(w / 2);
    const y = cy - Math.round(h / 2);

    return `<path d="M${x + 6} ${y} H${x + w - 6} Q${x + w} ${y} ${x + w} ${y + 6} V${y + h - 8} Q${x + w} ${y + h - 2} ${x + w - 6} ${y + h - 2} H${x + Math.round(w * 0.58)} L${x + Math.round(w * 0.46)} ${y + h + 6} V${y + h - 2} H${x + 6} Q${x} ${y + h - 2} ${x} ${y + h - 8} V${y + 6} Q${x} ${y} ${x + 6} ${y} Z" fill="none" stroke="${text}" stroke-opacity="0.84" stroke-width="${strokeWidth}" stroke-linejoin="round"/>
    <circle cx="${cx - Math.round(size * 0.13)}" cy="${cy}" r="2.6" fill="${primary}"/>
    <circle cx="${cx + Math.round(size * 0.13)}" cy="${cy}" r="2.6" fill="${primary}"/>`;
  }

  if (lower.includes("github")) {
    return `<text x="${cx}" y="${cy + Math.round(size * 0.15)}" fill="${text}" font-family="SFMono-Regular, Consolas, monospace" font-size="${Math.round(size * 0.42)}" font-weight="900" text-anchor="middle">GH</text>`;
  }

  if (lower.includes("x") || lower.includes("twitter")) {
    return `<path d="M${cx - Math.round(size * 0.22)} ${cy - Math.round(size * 0.24)} L${cx + Math.round(size * 0.24)} ${cy + Math.round(size * 0.24)} M${cx + Math.round(size * 0.22)} ${cy - Math.round(size * 0.24)} L${cx - Math.round(size * 0.24)} ${cy + Math.round(size * 0.24)}" stroke="${text}" stroke-width="${strokeWidth + 1}" stroke-linecap="round"/>`;
  }

  if (lower.includes("linkedin")) {
    return `<text x="${cx}" y="${cy + Math.round(size * 0.17)}" fill="${text}" font-family="Inter, Segoe UI, sans-serif" font-size="${Math.round(size * 0.5)}" font-weight="900" text-anchor="middle">in</text>`;
  }

  const initials = label
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return `<text x="${cx}" y="${cy + Math.round(size * 0.16)}" fill="${text}" font-family="SFMono-Regular, Consolas, monospace" font-size="${Math.round(size * 0.42)}" font-weight="900" text-anchor="middle">${escapeXml(initials || "?")}</text>`;
};

const estimateTextWidth = (text, fontSize, maxWidth) =>
  clamp(Math.round(text.length * fontSize * 0.62), 140, maxWidth);

const buildTypewriterText = (value, startDelay, baseDelay, jitter) => {
  let delay = startDelay;
  const starts = [];
  const tspans = Array.from(value, (char, index) => {
    const begin = delay.toFixed(3);
    starts.push(delay);
    delay += baseDelay + ((index * 7) % 5) * jitter + (char === " " ? baseDelay * 0.7 : 0);

    return `<tspan opacity="0">${escapeXml(char)}<animate attributeName="opacity" from="0" to="1" dur="0.01s" begin="${begin}s" fill="freeze"/></tspan>`;
  }).join("");

  return {
    endDelay: delay,
    starts,
    tspans,
  };
};

const buildCursorXAnimation = ({ charWidth, fallbackX, startDelay, starts, titleX }) => {
  const endDelay = starts.length ? starts[starts.length - 1] + 0.08 : startDelay + 0.08;
  const duration = Math.max(endDelay - startDelay, 0.08);
  const times = [];
  const values = [];

  starts.forEach((begin, index) => {
    const progress = Math.min(0.98, Math.max(0, (begin - startDelay) / duration));

    times.push(Number(progress.toFixed(3)));
    values.push(Math.round(titleX + (index + 1) * charWidth));
  });

  if (!times.length || times[0] !== 0) {
    times.unshift(0);
    values.unshift(titleX);
  }

  times.push(1);
  values.push(fallbackX);

  return `<animate attributeName="x" begin="${startDelay.toFixed(3)}s" dur="${duration.toFixed(3)}s" values="${values.join(";")}" keyTimes="${times.join(";")}" calcMode="discrete" fill="freeze"/>`;
};

const buildMatrixRain = (width, height, primary) =>
  Array.from({ length: Math.ceil(width / 34) }, (_, index) => {
    const x = 18 + index * 34;
    const y = -height + ((index * 37) % height);
    const opacity = 0.16 + (index % 5) * 0.05;
    const delay = (index % 7) * 0.22;
    const glyphs = index % 3 === 0 ? "10110" : index % 3 === 1 ? "01101" : "11001";
    const hiddenText =
      index % 23 === 5 ? "TEXploder" : index % 29 === 11 ? "asashin.com" : "";

    if (hiddenText) {
      const hiddenStartY = -(hiddenText.length * 18 + 28 + ((index * 23) % Math.max(height, 1)));
      const verticalText = Array.from(hiddenText, (char, charIndex) =>
        `<tspan x="${x}" dy="${charIndex === 0 ? 0 : 18}">${escapeXml(char)}</tspan>`,
      ).join("");

      return `<text x="${x}" y="${hiddenStartY}" fill="${primary}" opacity="0.18" font-family="SFMono-Regular, Consolas, monospace" font-size="12" letter-spacing="0">
      ${verticalText}
      <animate attributeName="y" from="${hiddenStartY}" to="${height + hiddenText.length * 18 + 40}" dur="${7.2 + (index % 3) * 0.9}s" begin="${delay}s" repeatCount="indefinite"/>
    </text>`;
    }

    return `<text x="${x}" y="${y}" fill="${primary}" opacity="${opacity.toFixed(2)}" font-family="SFMono-Regular, Consolas, monospace" font-size="13" letter-spacing="0">
      <tspan x="${x}" dy="0">${glyphs[0]}</tspan>
      <tspan x="${x}" dy="18">${glyphs[1]}</tspan>
      <tspan x="${x}" dy="18">${glyphs[2]}</tspan>
      <tspan x="${x}" dy="18">${glyphs[3]}</tspan>
      <tspan x="${x}" dy="18">${glyphs[4]}</tspan>
      <animate attributeName="y" from="${y}" to="${height + 40}" dur="${4.8 + (index % 4) * 0.7}s" begin="${delay}s" repeatCount="indefinite"/>
    </text>`;
  }).join("\n");

const getPalette = (query, theme) => {
  const defaults = {
    clean: { primary: "9B5CFF", secondary: "0E1A3D", text: "F5F7FF" },
    liquid: { primary: "8D62FF", secondary: "05050D", text: "F5F3FF" },
    matrix: { primary: "37FF8B", secondary: "031007", text: "D9FFE8" },
  }[theme];

  return {
    primary: `#${cleanHex(query.get("primary") || query.get("accent"), defaults.primary)}`,
    secondary: `#${cleanHex(query.get("secondary"), defaults.secondary)}`,
    text: `#${cleanHex(query.get("text"), defaults.text)}`,
  };
};

const buildSvgDefs = ({
  width,
  height,
  primary,
  secondary,
  text,
  titleX = 46,
  contentWidth,
  outerRadius = 18,
}) => `
  <defs>
    <linearGradient id="cleanBg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#070B18"/>
      <stop offset="0.54" stop-color="${secondary}"/>
      <stop offset="1" stop-color="#142653"/>
    </linearGradient>
    <radialGradient id="liquidBg" cx="72%" cy="18%" r="84%">
      <stop offset="0" stop-color="${primary}" stop-opacity="0.2"/>
      <stop offset="0.36" stop-color="${secondary}" stop-opacity="0.42"/>
      <stop offset="1" stop-color="#030306"/>
    </radialGradient>
    <linearGradient id="glassSurface" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.14"/>
      <stop offset="0.45" stop-color="#FFFFFF" stop-opacity="0.025"/>
      <stop offset="1" stop-color="${primary}" stop-opacity="0.08"/>
    </linearGradient>
    <linearGradient id="glassEdge" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.72"/>
      <stop offset="0.45" stop-color="${primary}" stop-opacity="0.18"/>
      <stop offset="1" stop-color="${primary}" stop-opacity="0.54"/>
    </linearGradient>
    <radialGradient id="glassHighlight" cx="22%" cy="12%" r="78%">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.2"/>
      <stop offset="0.34" stop-color="#FFFFFF" stop-opacity="0.055"/>
      <stop offset="1" stop-color="${primary}" stop-opacity="0.02"/>
    </radialGradient>
    <linearGradient id="matrixBg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#000000"/>
      <stop offset="0.56" stop-color="${secondary}"/>
      <stop offset="1" stop-color="#020403"/>
    </linearGradient>
    <linearGradient id="matrixScan" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${primary}" stop-opacity="0"/>
      <stop offset="0.5" stop-color="${primary}" stop-opacity="0.18"/>
      <stop offset="1" stop-color="${primary}" stop-opacity="0"/>
    </linearGradient>
    <filter id="glassWarp" x="-4%" y="-8%" width="108%" height="116%">
      <feTurbulence type="fractalNoise" baseFrequency="0.018 0.035" numOctaves="2" seed="7" result="warp"/>
      <feDisplacementMap in="SourceGraphic" in2="warp" scale="3" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
    <clipPath id="outerClip">
      <rect width="${width}" height="${height}" rx="${outerRadius}"/>
    </clipPath>
    <clipPath id="contentClip">
      <rect x="${titleX}" y="0" width="${contentWidth || width - titleX * 2}" height="${height}"/>
    </clipPath>
  </defs>`;

const buildThemeLayers = ({ theme, width, height, primary, secondary, text }) => {
  const matrixRain = theme === "matrix" ? buildMatrixRain(width, height, primary) : "";

  const backgrounds = {
    clean: `
  <rect width="${width}" height="${height}" rx="18" fill="${secondary}"/>
  <rect x="34" y="36" width="5" height="${height - 72}" rx="2.5" fill="${primary}"/>
  <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="17" fill="none" stroke="${text}" stroke-opacity="0.24"/>`,
    liquid: `
  <rect width="${width}" height="${height}" rx="18" fill="${secondary}"/>
  <rect width="${width}" height="${height}" rx="18" fill="url(#liquidBg)"/>
  <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="17" fill="url(#glassSurface)" filter="url(#glassWarp)"/>
  <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="17" fill="url(#glassHighlight)" opacity="0.55"/>
  <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="17" fill="none" stroke="url(#glassEdge)" stroke-opacity="0.88"/>`,
    matrix: `
  <rect width="${width}" height="${height}" rx="18" fill="${secondary}"/>
  <rect width="${width}" height="${height}" rx="18" fill="url(#matrixBg)"/>
  <g clip-path="url(#outerClip)">${matrixRain}</g>
  <rect width="${width}" height="${height}" rx="18" fill="url(#matrixScan)" opacity="0.38">
    <animate attributeName="y" from="-${height}" to="${height}" dur="4s" repeatCount="indefinite"/>
  </rect>
  <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="17" fill="none" stroke="${primary}" stroke-opacity="0.58"/>`,
  };

  return backgrounds[theme];
};

const buildCompactSurface = ({ theme, width, height, primary, secondary, text, radius = 18 }) => {
  const matrixRain = theme === "matrix" ? buildMatrixRain(width, height, primary) : "";
  const innerRadius = Math.max(0, radius - 1);

  if (theme === "liquid") {
    return `
  <rect width="${width}" height="${height}" rx="${radius}" fill="${secondary}"/>
  <rect width="${width}" height="${height}" rx="${radius}" fill="url(#liquidBg)"/>
  <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="${innerRadius}" fill="url(#glassSurface)" filter="url(#glassWarp)"/>
  <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="${innerRadius}" fill="url(#glassHighlight)" opacity="0.38"/>
  <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="${innerRadius}" fill="none" stroke="url(#glassEdge)" stroke-opacity="0.7"/>`;
  }

  if (theme === "matrix") {
    return `
  <rect width="${width}" height="${height}" rx="${radius}" fill="url(#matrixBg)"/>
  <g clip-path="url(#outerClip)" opacity="0.52">${matrixRain}</g>
  <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="${innerRadius}" fill="none" stroke="${primary}" stroke-opacity="0.56"/>`;
  }

  return `
  <rect width="${width}" height="${height}" rx="${radius}" fill="${secondary}"/>
  <rect x="12" y="14" width="4" height="${Math.max(12, height - 28)}" rx="2" fill="${primary}"/>
  <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="${innerRadius}" fill="none" stroke="${text}" stroke-opacity="0.22"/>`;
};

const buildThemeAccent = ({ theme, width, height, primary, text }) => {
  if (theme === "matrix") {
    const terminalX = Math.round(width * 0.55);
    const terminalY = Math.max(116, Math.round(height * 0.58));
    const terminalWidth = width - terminalX - 42;

    return `
  <g transform="translate(${terminalX} ${terminalY})" opacity="0.88">
    <path d="M0 0 H${terminalWidth} V50 H0 Z" fill="#000000" opacity="0.26" stroke="${primary}" stroke-opacity="0.28"/>
    <text x="14" y="23" fill="${primary}" font-family="SFMono-Regular, Consolas, monospace" font-size="13" font-weight="700">$ render --readme</text>
    <text x="14" y="42" fill="${text}" opacity="0.72" font-family="SFMono-Regular, Consolas, monospace" font-size="12">status: online</text>
    <rect x="${Math.min(146, terminalWidth - 18)}" y="13" width="8" height="14" fill="${primary}">
      <animate attributeName="opacity" values="1;0.15;1" dur="0.9s" repeatCount="indefinite"/>
    </rect>
  </g>`;
  }

  return "";
};

const buildPulseSvg = (query) => {
  const theme = cleanTheme(query.get("theme"));
  const hasScale = query.has("scale");
  const scale = cleanScale(query);
  const width = hasScale ? 760 : clamp(Number(query.get("width")) || 760, 520, 1000);
  const height = hasScale ? 220 : clamp(Number(query.get("height")) || 220, 180, 320);
  const outputWidth = hasScale ? Math.round(width * scale) : width;
  const outputHeight = hasScale ? Math.round(height * scale) : height;
  const title = cleanText(query.get("title"), "GitHub Tools by TEXploder", 72);
  const subtitle = cleanOptionalText(query.get("subtitle"), 96);
  const status = cleanOptionalText(query.get("status"), 36);
  const { primary, secondary, text } = getPalette(query, theme);
  const titleSize = clamp(Math.round(width / 24), 26, 40);
  const subtitleSize = clamp(Math.round(width / 47), 14, 20);
  const labelSize = clamp(Math.round(width / 64), 11, 14);
  const titleX = theme === "clean" ? 66 : 46;
  const contentWidth = width - titleX * 2;
  const titleWidth = estimateTextWidth(title, titleSize, contentWidth);
  const hasSubtitle = subtitle.length > 0;
  const hasStatus = status.length > 0;
  const titleY = hasSubtitle
    ? clamp(Math.round(height * 0.41), 76, 124)
    : clamp(Math.round(height / 2 + titleSize * 0.34), 78, height - 58);
  const subtitleY = titleY + 38;
  const cardBottom = height - 36;
  const badgeWidth = Math.min(contentWidth, Math.max(168, status.length * 9 + 62));
  const badgeFill = theme === "liquid" ? "#FFFFFF" : secondary;
  const badgeOpacity = theme === "liquid" ? "0.055" : "0.76";
  const titleWeight = theme === "matrix" ? 760 : 820;
  const titleType = buildTypewriterText(title, 0.24, 0.052, 0.008);
  const subtitleType = hasSubtitle
    ? buildTypewriterText(subtitle, titleType.endDelay + 0.28, 0.026, 0.005)
    : { endDelay: titleType.endDelay, starts: [], tspans: "" };
  const cursorOpacity = theme === "matrix" ? "1" : "0.82";
  const titleCharWidth = titleSize * 0.54;
  const cursorX = Math.min(titleX + Math.round(title.length * titleCharWidth) + 15, width - 54);
  const cursorMove = buildCursorXAnimation({
    charWidth: titleCharWidth,
    fallbackX: cursorX,
    startDelay: 0.24,
    starts: titleType.starts,
    titleX,
  });
  const cursorDimOpacity = theme === "matrix" ? "0.18" : "0.2";
  const cursorAnimation = `<animate attributeName="opacity" values="${cursorOpacity};${cursorOpacity};${cursorDimOpacity};${cursorDimOpacity};${cursorOpacity}" keyTimes="0;0.42;0.5;0.86;1" dur="1.7s" begin="0s" repeatCount="indefinite"/>`;
  const statusDotAnimation =
    theme === "matrix"
      ? '<animate attributeName="opacity" values="0.35;1;0.35" dur="1.6s" repeatCount="indefinite"/>'
      : "";
  const topControls =
    theme === "matrix"
      ? `<g transform="translate(28 24)">
    <circle cx="0" cy="0" r="5" fill="${primary}"/>
    <circle cx="18" cy="0" r="5" fill="${text}" opacity="0.52"/>
    <circle cx="36" cy="0" r="5" fill="${primary}" opacity="0.38"/>
  </g>`
      : "";
  const subtitleMarkup = hasSubtitle
    ? `<text x="${titleX}" y="${subtitleY}" fill="${text}" opacity="0.72" font-family="Inter, Segoe UI, sans-serif" font-size="${subtitleSize}" font-weight="500" clip-path="url(#contentClip)">${subtitleType.tspans}</text>`
    : "";
  const statusMarkup = hasStatus
    ? `<g transform="translate(${titleX} ${cardBottom})">
    <rect x="0" y="-23" width="${badgeWidth}" height="32" rx="16" fill="${badgeFill}" opacity="${badgeOpacity}" stroke="${text}" stroke-opacity="0.22"/>
    <circle cx="18" cy="-7" r="5" fill="${primary}">
      ${statusDotAnimation}
    </circle>
    <text x="34" y="-2" fill="${text}" font-family="SFMono-Regular, Consolas, monospace" font-size="${labelSize}" font-weight="700">${escapeXml(status)}</text>
  </g>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${outputWidth}" height="${outputHeight}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(title)}</title>
  <desc id="desc">${escapeXml(subtitle)}</desc>
  <defs>
    <linearGradient id="cleanBg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#070B18"/>
      <stop offset="0.54" stop-color="${secondary}"/>
      <stop offset="1" stop-color="#142653"/>
    </linearGradient>
    <radialGradient id="liquidBg" cx="72%" cy="18%" r="84%">
      <stop offset="0" stop-color="${primary}" stop-opacity="0.2"/>
      <stop offset="0.36" stop-color="${secondary}" stop-opacity="0.42"/>
      <stop offset="1" stop-color="#030306"/>
    </radialGradient>
    <linearGradient id="glassSurface" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.14"/>
      <stop offset="0.45" stop-color="#FFFFFF" stop-opacity="0.025"/>
      <stop offset="1" stop-color="${primary}" stop-opacity="0.08"/>
    </linearGradient>
    <linearGradient id="glassEdge" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.72"/>
      <stop offset="0.45" stop-color="${primary}" stop-opacity="0.18"/>
      <stop offset="1" stop-color="${primary}" stop-opacity="0.54"/>
    </linearGradient>
    <radialGradient id="glassHighlight" cx="22%" cy="12%" r="78%">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.2"/>
      <stop offset="0.34" stop-color="#FFFFFF" stop-opacity="0.055"/>
      <stop offset="1" stop-color="${primary}" stop-opacity="0.02"/>
    </radialGradient>
    <linearGradient id="matrixBg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#000000"/>
      <stop offset="0.56" stop-color="${secondary}"/>
      <stop offset="1" stop-color="#020403"/>
    </linearGradient>
    <linearGradient id="matrixScan" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${primary}" stop-opacity="0"/>
      <stop offset="0.5" stop-color="${primary}" stop-opacity="0.18"/>
      <stop offset="1" stop-color="${primary}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="shine" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${primary}" stop-opacity="0"/>
      <stop offset="0.5" stop-color="${primary}" stop-opacity="0.92"/>
      <stop offset="1" stop-color="${primary}" stop-opacity="0"/>
    </linearGradient>
    <filter id="softGlow" x="-20%" y="-30%" width="140%" height="160%">
      <feGaussianBlur stdDeviation="10" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <filter id="glassWarp" x="-4%" y="-8%" width="108%" height="116%">
      <feTurbulence type="fractalNoise" baseFrequency="0.018 0.035" numOctaves="2" seed="7" result="warp"/>
      <feDisplacementMap in="SourceGraphic" in2="warp" scale="3" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
    <clipPath id="outerClip">
      <rect width="${width}" height="${height}" rx="18"/>
    </clipPath>
    <clipPath id="contentClip">
      <rect x="${titleX}" y="0" width="${contentWidth}" height="${height}"/>
    </clipPath>
    <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
      <path d="M32 0H0V32" fill="none" stroke="${text}" stroke-width="0.65" opacity="0.18"/>
    </pattern>
  </defs>

  ${buildThemeLayers({ theme, width, height, primary, secondary, text })}

  ${topControls}

  <text x="${titleX}" y="${titleY}" fill="${text}" font-family="SFMono-Regular, Consolas, monospace" font-size="${titleSize}" font-weight="${titleWeight}" letter-spacing="0" clip-path="url(#contentClip)">${titleType.tspans}</text>
  <rect x="${titleX}" y="${titleY - titleSize + 5}" width="4" height="${titleSize + 2}" rx="2" fill="${primary}" opacity="${cursorOpacity}">
    ${cursorMove}
    ${cursorAnimation}
  </rect>

  ${subtitleMarkup}

  ${statusMarkup}

  ${buildThemeAccent({ theme, width, height, primary, text })}
</svg>`;
};

const buildRepoCardSvg = (query) => {
  const theme = cleanTheme(query.get("theme"));
  const hasScale = query.has("scale");
  const scale = cleanScale(query);
  const width = hasScale ? 760 : clamp(Number(query.get("width")) || 760, 560, 1000);
  const height = hasScale ? 220 : clamp(Number(query.get("height")) || 220, 180, 300);
  const outputWidth = hasScale ? Math.round(width * scale) : width;
  const outputHeight = hasScale ? Math.round(height * scale) : height;
  const repo = cleanText(query.get("repo"), "TEXploder/GithubTools", 56);
  const tagline = cleanText(
    query.get("tagline"),
    "README utilities running on gh.tex-api.com",
    92,
  );
  const { primary, secondary, text } = getPalette(query, theme);
  const titleX = theme === "clean" ? 66 : 46;
  const markSize = clamp(Math.round(height * 0.54), 86, 126);
  const markX = width - markSize - (theme === "clean" ? 56 : 42);
  const markY = Math.round((height - markSize) / 2);
  const contentWidth = Math.max(260, markX - titleX - 34);
  const titleSize = clamp(Math.round(width / 22), 30, 44);
  const ownerSize = clamp(Math.round(width / 58), 12, 16);
  const taglineSize = clamp(Math.round(width / 50), 14, 18);
  const ownerY = clamp(Math.round(height * 0.36), 62, 88);
  const titleY = ownerY + 46;
  const taglineY = titleY + 38;
  const repoParts = repo.split("/");
  const owner = repoParts.length > 1 ? repoParts[0] : "repository";
  const project = repoParts.length > 1 ? repoParts.slice(1).join("/") : repo;
  const iconStroke = theme === "matrix" ? primary : text;
  const iconOpacity = theme === "clean" ? "0.74" : "0.82";
  const launchMark = `
  <g transform="translate(${markX} ${markY})" opacity="${theme === "matrix" ? "0.94" : "0.88"}">
    <circle cx="${markSize / 2}" cy="${markSize / 2}" r="${markSize / 2 - 3}" fill="${primary}" opacity="${theme === "liquid" ? "0.16" : "0.08"}"/>
    <path d="M${Math.round(markSize * 0.18)} ${Math.round(markSize * 0.38)} H${Math.round(markSize * 0.39)} L${Math.round(markSize * 0.48)} ${Math.round(markSize * 0.29)} H${Math.round(markSize * 0.82)} V${Math.round(markSize * 0.73)} H${Math.round(markSize * 0.18)} Z" fill="none" stroke="${iconStroke}" stroke-opacity="${iconOpacity}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M${Math.round(markSize * 0.49)} ${Math.round(markSize * 0.66)} L${Math.round(markSize * 0.76)} ${Math.round(markSize * 0.39)}" fill="none" stroke="${primary}" stroke-width="5" stroke-linecap="round"/>
    <path d="M${Math.round(markSize * 0.59)} ${Math.round(markSize * 0.38)} H${Math.round(markSize * 0.77)} V${Math.round(markSize * 0.56)}" fill="none" stroke="${primary}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${Math.round(markSize * 0.26)}" cy="${Math.round(markSize * 0.62)}" r="4" fill="${primary}" opacity="${theme === "matrix" ? "1" : "0.86"}"/>
  </g>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${outputWidth}" height="${outputHeight}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(repo)} launch card</title>
  <desc id="desc">${escapeXml(tagline)}</desc>
  ${buildSvgDefs({ width, height, primary, secondary, text, titleX, contentWidth })}

  ${buildThemeLayers({ theme, width, height, primary, secondary, text })}

  ${launchMark}

  <text x="${titleX}" y="${ownerY}" fill="${primary}" opacity="0.9" font-family="SFMono-Regular, Consolas, monospace" font-size="${ownerSize}" font-weight="800" letter-spacing="0" clip-path="url(#contentClip)">${escapeXml(owner)}</text>
  <text x="${titleX}" y="${titleY}" fill="${text}" font-family="Inter, Segoe UI, sans-serif" font-size="${titleSize}" font-weight="840" letter-spacing="0" clip-path="url(#contentClip)">${escapeXml(project)}</text>
  <text x="${titleX}" y="${taglineY}" fill="${text}" opacity="0.68" font-family="Inter, Segoe UI, sans-serif" font-size="${taglineSize}" font-weight="500" clip-path="url(#contentClip)">${escapeXml(tagline)}</text>
</svg>`;
};

const buildBadgeSvg = (query) => {
  const theme = cleanTheme(query.get("theme"));
  const label = cleanText(query.get("label"), "github tools", 28);
  const value = cleanText(query.get("value"), "online", 28);
  const prefix = cleanOptionalText(query.get("prefix"), 8);
  const { primary, secondary, text } = getPalette(query, theme);
  const hasScale = query.has("scale");
  const scale = cleanScale(query);
  const height = hasScale ? 40 : clamp(Number(query.get("height")) || 40, 28, 54);
  const fontSize = clamp(Math.round(height * 0.34), 11, 16);
  const requestedRadius = Number(query.get("radius"));
  const radius = Math.round(
    clamp(Number.isFinite(requestedRadius) ? requestedRadius : height / 2, 0, height / 2),
  );
  const innerRadius = Math.max(0, radius - 1);
  const prefixWidth = prefix ? Math.round(Math.max(38, prefix.length * fontSize * 0.72 + 24)) : 0;
  const labelWidth = Math.max(76, Math.round(label.length * fontSize * 0.62 + 34));
  const valueWidth = Math.max(68, Math.round(value.length * fontSize * 0.62 + 36));
  const width = Math.round(prefixWidth + labelWidth + valueWidth);
  const matrixRain = theme === "matrix" ? buildMatrixRain(width, height, primary) : "";
  const labelX = prefixWidth + Math.round(labelWidth / 2);
  const valueX = prefixWidth + labelWidth + Math.round(valueWidth / 2);
  const outputWidth = hasScale ? Math.round(width * scale) : width;
  const outputHeight = hasScale ? Math.round(height * scale) : height;
  const prefixSegment = prefix
    ? `<rect x="0" y="0" width="${prefixWidth}" height="${height}" fill="${primary}" opacity="0.9"/>`
    : "";
  const prefixTextMarkup = prefix
    ? `<text x="${Math.round(prefixWidth / 2)}" y="${Math.round(height * 0.62)}" fill="#FFFFFF" font-family="SFMono-Regular, Consolas, monospace" font-size="${fontSize}" font-weight="900" text-anchor="middle">${escapeXml(prefix)}</text>`
    : "";
  const prefixDivider = prefix
    ? `<path d="M${prefixWidth} 7 V${height - 7}" stroke="${text}" stroke-opacity="0.16"/>`
    : "";
  const liquidOverlay =
    theme === "liquid"
      ? `<rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="${innerRadius}" fill="url(#glassSurface)" filter="url(#glassWarp)"/>
  <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="${innerRadius}" fill="url(#glassHighlight)" opacity="0.38"/>`
      : "";
  const matrixOverlay =
    theme === "matrix"
      ? `<g clip-path="url(#outerClip)" opacity="0.42">${matrixRain}</g>
  <rect width="${width}" height="${height}" rx="${radius}" fill="url(#matrixScan)" opacity="0.34">
    <animate attributeName="y" from="-${height}" to="${height}" dur="3.2s" repeatCount="indefinite"/>
  </rect>`
      : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${outputWidth}" height="${outputHeight}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(label)}: ${escapeXml(value)}</title>
  <desc id="desc">Custom badge generated on gh.tex-api.com</desc>
  ${buildSvgDefs({ width, height, primary, secondary, text, titleX: 0, contentWidth: width, outerRadius: radius })}

  <g clip-path="url(#outerClip)">
    <rect width="${width}" height="${height}" fill="${secondary}"/>
    ${prefixSegment}
    <rect x="${prefixWidth + labelWidth}" y="0" width="${valueWidth}" height="${height}" fill="${primary}" opacity="${theme === "liquid" ? "0.78" : "0.92"}"/>
  </g>
  ${liquidOverlay}
  ${matrixOverlay}
  ${prefixDivider}
  <path d="M${prefixWidth + labelWidth} 7 V${height - 7}" stroke="${text}" stroke-opacity="0.18"/>
  <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="${innerRadius}" fill="none" stroke="${theme === "matrix" ? primary : text}" stroke-opacity="${theme === "matrix" ? "0.56" : "0.24"}"/>
  ${prefixTextMarkup}
  <text x="${labelX}" y="${Math.round(height * 0.62)}" fill="${text}" opacity="0.82" font-family="Inter, Segoe UI, sans-serif" font-size="${fontSize}" font-weight="800" text-anchor="middle">${escapeXml(label)}</text>
  <text x="${valueX}" y="${Math.round(height * 0.62)}" fill="#FFFFFF" font-family="Inter, Segoe UI, sans-serif" font-size="${fontSize}" font-weight="900" text-anchor="middle">${escapeXml(value)}</text>
</svg>`;
};

const buildSocialRowSvg = async (query) => {
  const theme = cleanTheme(query.get("theme"));
  const hasScale = query.has("scale");
  const scale = cleanScale(query);
  const items = getSocialItems(query);
  const { primary, secondary, text } = getPalette(query, theme);
  const itemWidth = 64;
  const gap = 12;
  const pad = 28;
  const width = pad * 2 + items.length * itemWidth + Math.max(0, items.length - 1) * gap;
  const height = 72;
  const outputWidth = hasScale ? Math.round(width * scale) : width;
  const outputHeight = hasScale ? Math.round(height * scale) : height;
  const itemMarkup = (
    await Promise.all(
      items.map(async (item, index) => {
      const x = pad + index * (itemWidth + gap);
      const label = item.label.length > 10 ? `${item.label.slice(0, 9)}.` : item.label;
      const iconMarkup = await buildInlineSimpleIcon({
        icon: item.icon,
        label: item.label,
        x: 20,
        y: 12,
        size: 24,
        primary,
        text,
      });

      return `<g transform="translate(${x} 9)">
    <rect width="${itemWidth}" height="54" rx="14" fill="${theme === "liquid" ? "#FFFFFF" : text}" opacity="${theme === "matrix" ? "0.055" : "0.07"}" stroke="${theme === "matrix" ? primary : text}" stroke-opacity="${theme === "matrix" ? "0.28" : "0.14"}"/>
    ${iconMarkup}
    <text x="32" y="47" fill="${text}" opacity="0.78" font-family="Inter, Segoe UI, sans-serif" font-size="9" font-weight="800" text-anchor="middle">${escapeXml(label)}</text>
  </g>`;
    }),
    )
  ).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${outputWidth}" height="${outputHeight}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">Social Link Row</title>
  <desc id="desc">Evenly scaled social link icons generated on gh.tex-api.com</desc>
  ${buildSvgDefs({ width, height, primary, secondary, text, titleX: 0, contentWidth: width, outerRadius: 18 })}

  ${buildCompactSurface({ theme, width, height, primary, secondary, text })}

  ${itemMarkup}
</svg>`;
};

const buildSocialIconSvg = async (query) => {
  const theme = cleanTheme(query.get("theme"));
  const hasScale = query.has("scale");
  const scale = cleanScale(query);
  const label = cleanText(query.get("label"), "Link", 18);
  const icon = cleanIconSlug(query.get("icon") || label);
  const { primary, secondary, text } = getPalette(query, theme);
  const width = 46;
  const height = 46;
  const outputWidth = hasScale ? Math.round(width * scale) : width;
  const outputHeight = hasScale ? Math.round(height * scale) : height;
  const bgOpacity = theme === "matrix" ? "0.16" : theme === "liquid" ? "0.2" : "0.1";
  const iconMarkup = await buildInlineSimpleIcon({
    icon,
    label,
    x: 13,
    y: 13,
    size: 20,
    primary,
    text,
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${outputWidth}" height="${outputHeight}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(label)}</title>
  <desc id="desc">Social icon generated on gh.tex-api.com</desc>
  ${buildSvgDefs({ width, height, primary, secondary, text, titleX: 0, contentWidth: width, outerRadius: 12 })}

  <rect width="${width}" height="${height}" rx="12" fill="${theme === "matrix" ? "#020403" : secondary}"/>
  <rect width="${width}" height="${height}" rx="12" fill="${primary}" opacity="${bgOpacity}"/>
  ${theme === "liquid" ? `<rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="11" fill="url(#glassSurface)" opacity="0.82"/>` : ""}
  <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="11" fill="none" stroke="${theme === "matrix" ? primary : text}" stroke-opacity="${theme === "matrix" ? "0.54" : "0.22"}"/>
  ${iconMarkup}
</svg>`;
};

const buildTerminalDemoSvg = (query) => {
  const theme = cleanTheme(query.get("theme"));
  const hasScale = query.has("scale");
  const scale = cleanScale(query);
  const width = hasScale ? 760 : clamp(Number(query.get("width")) || 760, 560, 1000);
  const height = hasScale ? 220 : clamp(Number(query.get("height")) || 220, 180, 300);
  const outputWidth = hasScale ? Math.round(width * scale) : width;
  const outputHeight = hasScale ? Math.round(height * scale) : height;
  const commandLines = cleanLines(
    query.get("command"),
    "npm install github-tools\nnpm run generate",
    3,
    72,
  );
  const outputLines = cleanLines(
    query.get("output"),
    "resolved packages\nready: README utilities generated",
    4,
    86,
  );
  const { primary, secondary, text } = getPalette(query, theme);
  const titleX = theme === "clean" ? 66 : 46;
  const contentWidth = width - titleX - 42;
  const lineHeight = 24;
  const promptY = 72;
  const outputStartY = promptY + commandLines.length * lineHeight + 24;
  const commandSize = clamp(Math.round(width / 54), 13, 16);
  const outputSize = clamp(Math.round(width / 58), 12, 15);
  const commandMarkup = commandLines
    .map((line, index) => {
      const y = promptY + index * lineHeight;
      const prefix = index === 0 ? "$" : ">";

      return `<text x="${titleX}" y="${y}" fill="${primary}" font-family="SFMono-Regular, Consolas, monospace" font-size="${commandSize}" font-weight="900">${prefix}</text>
  <text x="${titleX + 22}" y="${y}" fill="${text}" font-family="SFMono-Regular, Consolas, monospace" font-size="${commandSize}" font-weight="760" clip-path="url(#contentClip)">${escapeXml(line)}</text>`;
    })
    .join("\n  ");
  const outputMarkup = outputLines
    .map((line, index) => {
      const y = outputStartY + index * lineHeight;

      return `<text x="${titleX}" y="${y}" fill="${text}" opacity="0.68" font-family="SFMono-Regular, Consolas, monospace" font-size="${outputSize}" font-weight="620" clip-path="url(#contentClip)">${escapeXml(line)}</text>`;
    })
    .join("\n  ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${outputWidth}" height="${outputHeight}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">Terminal Demo</title>
  <desc id="desc">${escapeXml([...commandLines, ...outputLines].join(" - "))}</desc>
  ${buildSvgDefs({ width, height, primary, secondary, text, titleX, contentWidth })}

  ${buildThemeLayers({ theme, width, height, primary, secondary, text })}

  <path d="M${titleX} ${Math.round(height * 0.24)} H${width - 42}" stroke="${text}" stroke-opacity="0.14"/>
  ${commandMarkup}
  <path d="M${titleX} ${outputStartY - 18} H${Math.min(width - 42, titleX + 220)}" stroke="${primary}" stroke-opacity="0.28"/>
  ${outputMarkup}
  <rect x="${titleX}" y="${height - 34}" width="${Math.min(190, contentWidth)}" height="2" rx="1" fill="${primary}" opacity="0.42"/>
</svg>`;
};

const buildProjectTimelineSvg = (query) => {
  const theme = cleanTheme(query.get("theme"));
  const hasScale = query.has("scale");
  const scale = cleanScale(query);
  const width = hasScale ? 760 : clamp(Number(query.get("width")) || 760, 560, 1000);
  const height = hasScale ? 170 : clamp(Number(query.get("height")) || 170, 150, 260);
  const outputWidth = hasScale ? Math.round(width * scale) : width;
  const outputHeight = hasScale ? Math.round(height * scale) : height;
  const title = cleanText(query.get("title"), "Project Timeline", 52);
  const steps = cleanList(query.get("steps"), ["Plan", "Build", "Preview", "Ship"], 6, 24);
  const requestedActive = Number(query.get("active"));
  const active = clamp(Number.isFinite(requestedActive) ? Math.round(requestedActive) : 1, 1, steps.length);
  const { primary, secondary, text } = getPalette(query, theme);
  const titleX = theme === "clean" ? 66 : 46;
  const contentWidth = width - titleX - 46;
  const lineY = 94;
  const startX = titleX;
  const endX = width - 52;
  const stepGap = steps.length > 1 ? (endX - startX) / (steps.length - 1) : 0;
  const titleSize = clamp(Math.round(width / 42), 16, 22);
  const labelSize = clamp(Math.round(width / 68), 11, 13);
  const stepMarkup = steps
    .map((step, index) => {
      const stepNumber = index + 1;
      const x = Math.round(startX + index * stepGap);
      const isDone = stepNumber <= active;
      const markerFill = isDone ? primary : secondary;
      const markerStroke = isDone ? primary : text;
      const labelOpacity = isDone ? "0.9" : "0.52";
      const textAnchor = index === 0 ? "start" : index === steps.length - 1 ? "end" : "middle";

      return `<g>
    <circle cx="${x}" cy="${lineY}" r="12" fill="${markerFill}" fill-opacity="${isDone ? "0.22" : "0.72"}" stroke="${markerStroke}" stroke-opacity="${isDone ? "0.92" : "0.26"}" stroke-width="2"/>
    <circle cx="${x}" cy="${lineY}" r="4" fill="${isDone ? primary : text}" opacity="${isDone ? "1" : "0.34"}"/>
    <text x="${x}" y="${lineY + 40}" fill="${text}" opacity="${labelOpacity}" font-family="Inter, Segoe UI, sans-serif" font-size="${labelSize}" font-weight="800" text-anchor="${textAnchor}">${escapeXml(step)}</text>
  </g>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${outputWidth}" height="${outputHeight}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(title)}</title>
  <desc id="desc">${escapeXml(steps.join(" to "))}</desc>
  ${buildSvgDefs({ width, height, primary, secondary, text, titleX, contentWidth })}

  ${buildThemeLayers({ theme, width, height, primary, secondary, text })}

  <text x="${titleX}" y="50" fill="${text}" font-family="Inter, Segoe UI, sans-serif" font-size="${titleSize}" font-weight="860" letter-spacing="0" clip-path="url(#contentClip)">${escapeXml(title)}</text>
  <path d="M${startX} ${lineY} H${endX}" stroke="${text}" stroke-opacity="0.18" stroke-width="2" stroke-linecap="round"/>
  <path d="M${startX} ${lineY} H${Math.round(startX + Math.max(0, active - 1) * stepGap)}" stroke="${primary}" stroke-opacity="0.82" stroke-width="2" stroke-linecap="round"/>
  ${stepMarkup}
</svg>`;
};

const send = (response, statusCode, body, headers = {}) => {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...headers,
  });
  response.end(body);
};

const serveStatic = (requestUrl, response) => {
  const decodedPath = decodeURIComponent(requestUrl.pathname);
  const normalizedPath = path.normalize(decodedPath).replace(/^(\.\.[/\\])+/, "");
  let filePath = path.join(publicDir, normalizedPath);

  if (!filePath.startsWith(publicDir)) {
    send(response, 403, "Forbidden", { "Content-Type": "text/plain; charset=utf-8" });
    return;
  }

  if (decodedPath.endsWith("/")) {
    filePath = path.join(filePath, "index.html");
  }

  fs.stat(filePath, (statError, stat) => {
    const finalPath = statError || stat.isDirectory() ? path.join(publicDir, "index.html") : filePath;
    const extension = path.extname(finalPath);

    fs.readFile(finalPath, (readError, data) => {
      if (readError) {
        send(response, 404, "Not found", { "Content-Type": "text/plain; charset=utf-8" });
        return;
      }

      send(response, 200, data, {
        "Content-Type": mimeTypes[extension] || "application/octet-stream",
      });
    });
  });
};

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  try {
    if (requestUrl.pathname === "/healthz") {
      send(response, 200, "ok", { "Content-Type": "text/plain; charset=utf-8" });
      return;
    }

    if (requestUrl.pathname === "/svg/pulse") {
      send(response, 200, buildPulseSvg(requestUrl.searchParams), {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      });
      return;
    }

    if (requestUrl.pathname === "/svg/repo-card") {
      send(response, 200, buildRepoCardSvg(requestUrl.searchParams), {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      });
      return;
    }

    if (requestUrl.pathname === "/svg/badge") {
      send(response, 200, buildBadgeSvg(requestUrl.searchParams), {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      });
      return;
    }

    if (requestUrl.pathname === "/svg/social-row") {
      send(response, 200, await buildSocialRowSvg(requestUrl.searchParams), {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      });
      return;
    }

    if (requestUrl.pathname === "/svg/social-icon") {
      send(response, 200, await buildSocialIconSvg(requestUrl.searchParams), {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      });
      return;
    }

    if (requestUrl.pathname === "/svg/terminal-demo") {
      send(response, 200, buildTerminalDemoSvg(requestUrl.searchParams), {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      });
      return;
    }

    if (requestUrl.pathname === "/svg/project-timeline") {
      send(response, 200, buildProjectTimelineSvg(requestUrl.searchParams), {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      });
      return;
    }

    serveStatic(requestUrl, response);
  } catch (error) {
    console.error(error);

    if (!response.headersSent) {
      send(response, 500, "Internal server error", {
        "Content-Type": "text/plain; charset=utf-8",
      });
    }
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`GitHub Tools listening on ${port}`);
});
