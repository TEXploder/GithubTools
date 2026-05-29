const revealItems = document.querySelectorAll(".reveal");

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.14 },
  );

  revealItems.forEach((item) => observer.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add("is-visible"));
}

const builder = document.querySelector("#utilityBuilder");
const builderTitle = document.querySelector("#builderTitle");
const toolPreview = document.querySelector("#toolPreview");
const socialPreview = document.querySelector("#socialPreview");
const copyMarkdown = document.querySelector("#copyMarkdown");
const markdownOutput = document.querySelector("#markdownOutput");
const readmeSandboxInput = document.querySelector("#readmeSandboxInput");
const readmeSandboxPreview = document.querySelector("#readmeSandboxPreview");
const copyReadme = document.querySelector("#copyReadme");
const syncReadme = document.querySelector("#syncReadme");

if (
  builder &&
  builderTitle &&
  toolPreview &&
  socialPreview &&
  copyMarkdown &&
  markdownOutput &&
  readmeSandboxInput &&
  readmeSandboxPreview &&
  copyReadme &&
  syncReadme
) {
  const fields = {
    title: document.querySelector("#titleInput"),
    subtitle: document.querySelector("#subtitleInput"),
    status: document.querySelector("#statusInput"),
    repo: document.querySelector("#repoInput"),
    repoTagline: document.querySelector("#repoTaglineInput"),
    repoLink: document.querySelector("#repoLinkInput"),
    badgePrefix: document.querySelector("#badgePrefixInput"),
    badgeLabel: document.querySelector("#badgeLabelInput"),
    badgeValue: document.querySelector("#badgeValueInput"),
    badgeRadius: document.querySelector("#badgeRadiusInput"),
    socialLabels: document.querySelector("#socialLabelsInput"),
    socialIcons: document.querySelector("#socialIconsInput"),
    socialLinks: document.querySelector("#socialLinksInput"),
    terminalCommand: document.querySelector("#terminalCommandInput"),
    terminalOutput: document.querySelector("#terminalOutputInput"),
    timelineTitle: document.querySelector("#timelineTitleInput"),
    timelineSteps: document.querySelector("#timelineStepsInput"),
    timelineActive: document.querySelector("#timelineActiveInput"),
    primary: document.querySelector("#primaryInput"),
    secondary: document.querySelector("#secondaryInput"),
    text: document.querySelector("#textInput"),
    scale: document.querySelector("#scaleInput"),
  };
  const scaleOutput = document.querySelector("#scaleOutput");
  const scaleWarning = document.querySelector("#scaleWarning");
  const toolInputs = [...builder.querySelectorAll('input[name="tool"]')];
  const themeInputs = [...builder.querySelectorAll('input[name="theme"]')];
  const toolPanels = [...builder.querySelectorAll("[data-tool-panel]")];
  const requiredFields = Object.values(fields);

  if (
    toolInputs.length &&
    themeInputs.length &&
    scaleOutput &&
    scaleWarning &&
    requiredFields.every(Boolean)
  ) {
    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
    const origin = window.location.origin;
    const themePresets = {
      clean: {
        primary: "#9b5cff",
        secondary: "#0e1a3d",
        text: "#f5f7ff",
      },
      liquid: {
        primary: "#8d62ff",
        secondary: "#05050d",
        text: "#f5f3ff",
      },
      matrix: {
        primary: "#37ff8b",
        secondary: "#031007",
        text: "#d9ffe8",
      },
    };
    const toolTitles = {
      pulse: "Pulse Banner Builder",
      repo: "Repo Launch Card",
      badge: "Custom Badge Studio",
      social: "Social Link Row",
      terminal: "Terminal Demo",
      timeline: "Project Timeline",
    };
    const endpointLabels = {
      pulse: "README Pulse SVG",
      repo: "Repo Launch Card",
      badge: `${fields.badgeLabel.value || "badge"} badge`,
      social: "Social Link Row",
      terminal: "Terminal Demo",
      timeline: "Project Timeline",
    };
    const baseDimensions = {
      pulse: { width: 760, height: 220 },
      repo: { width: 760, height: 220 },
      badge: { height: 40 },
      terminal: { width: 760, height: 220 },
      timeline: { width: 760, height: 170 },
    };
    let sandboxTouched = false;

    const getChecked = (name) =>
      builder.querySelector(`input[name="${name}"]:checked`)?.value || "";
    const getTool = () => getChecked("tool") || "pulse";
    const getTheme = () => getChecked("theme") || "liquid";
    const cleanHex = (input) => input.value.replace("#", "");
    const cleanIconSlug = (value) =>
      String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .slice(0, 48);
    const buildUrl = (path, params) => `${origin}${path}?${params.toString()}`;
    const escapeAttribute = (value) =>
      String(value)
        .replaceAll("&", "&amp;")
        .replaceAll('"', "&quot;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
    const normalizeTargetUrl = (value, fallback = origin) => {
      const raw = value.trim();

      if (!raw) {
        return fallback;
      }

      const candidate = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;

      try {
        const parsed = new URL(candidate);

        if (["http:", "https:"].includes(parsed.protocol)) {
          return parsed.href;
        }
      } catch {
        return fallback;
      }

      return fallback;
    };
    const getRepoTargetUrl = () => {
      const customLink = fields.repoLink.value.trim();
      const repo = fields.repo.value.trim() || "TEXploder/GithubTools";
      const githubTarget = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)
        ? `https://github.com/${repo}`
        : origin;

      return normalizeTargetUrl(customLink, githubTarget);
    };
    const splitList = (value, fallback) => {
      const items = value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 5);

      return items.length ? items : fallback;
    };
    const getSocialItems = () => {
      const labels = splitList(fields.socialLabels.value, ["GitHub", "Website", "Contact"]);
      const icons = splitList(fields.socialIcons.value, [
        "github",
        "firefoxbrowser",
        "discord",
        "linktree",
        "simpleicons",
      ]);
      const links = splitList(fields.socialLinks.value, [origin]);

      return labels.map((label, index) => ({
        label,
        icon: cleanIconSlug(icons[index] || icons[0] || label) || "simpleicons",
        href: normalizeTargetUrl(links[index] || links[0] || origin, origin),
      }));
    };

    const applyThemePreset = () => {
      const preset = themePresets[getTheme()];

      if (!preset) {
        return;
      }

      fields.primary.value = preset.primary;
      fields.secondary.value = preset.secondary;
      fields.text.value = preset.text;
    };

    const addThemeParams = (params) => {
      params.set("theme", getTheme());
      params.set("primary", cleanHex(fields.primary));
      params.set("secondary", cleanHex(fields.secondary));
      params.set("text", cleanHex(fields.text));
    };

    const addScaleParam = (params) => {
      params.set("scale", String(getScale()));
    };

    const getScale = () => clamp(Number(fields.scale.value) || 100, 50, 130);
    const getDimensions = (tool = getTool()) => {
      const scale = getScale() / 100;

      if (tool === "badge") {
        return {
          height: clamp(Math.round(baseDimensions.badge.height * scale), 28, 54),
          scale: getScale(),
        };
      }

      if (tool === "social") {
        const itemCount = getSocialItems().length || 1;

        return {
          width: Math.round((56 + itemCount * 64 + Math.max(0, itemCount - 1) * 12) * scale),
          height: Math.round(72 * scale),
          scale: getScale(),
        };
      }

      const base = baseDimensions[tool] || baseDimensions.pulse;

      return {
        width: Math.round(base.width * scale),
        height: Math.round(base.height * scale),
        scale: getScale(),
      };
    };

    const buildPulseUrl = () => {
      const params = new URLSearchParams({
        title: fields.title.value.trim() || "GitHub Tools",
        subtitle: fields.subtitle.value.trim(),
        status: fields.status.value.trim(),
      });

      addThemeParams(params);
      addScaleParam(params);
      return buildUrl("/svg/pulse", params);
    };

    const buildRepoUrl = () => {
      const params = new URLSearchParams({
        repo: fields.repo.value.trim() || "TEXploder/GithubTools",
        tagline: fields.repoTagline.value.trim() || "README utilities running on gh.tex-api.com",
      });

      addThemeParams(params);
      addScaleParam(params);
      return buildUrl("/svg/repo-card", params);
    };

    const buildBadgeUrl = () => {
      const radius = clamp(Number(fields.badgeRadius.value) || 0, 0, 20);
      const params = new URLSearchParams({
        prefix: fields.badgePrefix.value.trim(),
        label: fields.badgeLabel.value.trim() || "github tools",
        value: fields.badgeValue.value.trim() || "online",
        radius: String(radius),
      });

      addThemeParams(params);
      addScaleParam(params);
      return buildUrl("/svg/badge", params);
    };

    const buildSocialRowUrl = () => {
      const socialItems = getSocialItems();
      const params = new URLSearchParams({
        labels: socialItems.map((item) => item.label).join(","),
        icons: socialItems.map((item) => item.icon).join(","),
        links: socialItems.map((item) => item.href).join(","),
      });

      addThemeParams(params);
      addScaleParam(params);
      return buildUrl("/svg/social-row", params);
    };

    const buildSocialIconUrl = (item) => {
      return `https://cdn.simpleicons.org/${encodeURIComponent(item.icon || "simpleicons")}`;
    };

    const buildSocialPreviewHtml = () => {
      const scale = getScale() / 100;
      const tileSize = clamp(Math.round(46 * scale), 28, 60);
      const iconSize = clamp(Math.round(30 * scale), 18, 42);

      return getSocialItems()
        .map((item) => {
          const image = buildSocialIconUrl(item);

          return `<a href="${escapeAttribute(item.href)}" target="_blank" rel="noreferrer" aria-label="${escapeAttribute(item.label)}" style="width:${tileSize}px;height:${tileSize}px"><img src="${escapeAttribute(image)}" alt="${escapeAttribute(item.label)}" width="${iconSize}" height="${iconSize}" /></a>`;
        })
        .join("");
    };

    const buildTerminalUrl = () => {
      const params = new URLSearchParams({
        command: fields.terminalCommand.value.trim() || "npm install github-tools\nnpm run generate",
        output: fields.terminalOutput.value.trim() || "resolved packages\nready: README utilities generated",
      });

      addThemeParams(params);
      addScaleParam(params);
      return buildUrl("/svg/terminal-demo", params);
    };

    const buildTimelineUrl = () => {
      const params = new URLSearchParams({
        title: fields.timelineTitle.value.trim() || "Project Timeline",
        steps: fields.timelineSteps.value.trim() || "Plan, Build, Preview, Ship",
        active: String(clamp(Number(fields.timelineActive.value) || 1, 1, 6)),
      });

      addThemeParams(params);
      addScaleParam(params);
      return buildUrl("/svg/project-timeline", params);
    };

    const buildToolUrl = (tool = getTool()) => {
      if (tool === "repo") {
        return buildRepoUrl();
      }

      if (tool === "badge") {
        return buildBadgeUrl();
      }

      if (tool === "social") {
        return buildSocialRowUrl();
      }

      if (tool === "terminal") {
        return buildTerminalUrl();
      }

      if (tool === "timeline") {
        return buildTimelineUrl();
      }

      return buildPulseUrl();
    };

    const buildMarkdown = (tool = getTool(), url = buildToolUrl(tool)) => {
      if (tool === "repo") {
        return `[![Repo Launch Card](${url})](${getRepoTargetUrl()})`;
      }

      if (tool === "badge") {
        return `![${fields.badgeLabel.value.trim() || "github tools"}](${url})`;
      }

      if (tool === "social") {
        const iconSize = clamp(Math.round(38 * (getScale() / 100)), 20, 52);
        const images = getSocialItems()
          .map((item) => {
            const image = buildSocialIconUrl(item);
            return `<a href="${escapeAttribute(item.href)}"><img src="${escapeAttribute(image)}" alt="${escapeAttribute(item.label)}" width="${iconSize}" height="${iconSize}" /></a>`;
          })
          .join(" ");

        return `<p align="center">${images}</p>`;
      }

      if (tool === "terminal") {
        return `![Terminal Demo](${url})`;
      }

      if (tool === "timeline") {
        return `![Project Timeline](${url})`;
      }

      return `[![README Pulse SVG](${url})](${origin})`;
    };

    const buildGeneratedReadme = () => {
      const repoName = fields.repo.value.trim() || "TEXploder/GithubTools";
      const title = fields.title.value.trim() || "GitHub Tools by TEXploder";
      const tagline =
        fields.repoTagline.value.trim() || "README utilities running on gh.tex-api.com";

      return [
        `# ${repoName}`,
        "",
        `[![README Pulse SVG](${buildPulseUrl()})](${origin})`,
        "",
        tagline,
        "",
        "## Launch",
        "",
        buildMarkdown("repo", buildRepoUrl()),
        "",
        "## Status",
        "",
        `![${fields.badgeLabel.value.trim() || "github tools"}](${buildBadgeUrl()})`,
        "",
        "## Connect",
        "",
        buildMarkdown("social", buildSocialRowUrl()),
        "",
        "## Terminal Demo",
        "",
        buildMarkdown("terminal", buildTerminalUrl()),
        "",
        "## Timeline",
        "",
        buildMarkdown("timeline", buildTimelineUrl()),
        "",
        `Generated with ${origin}.`,
        "",
        `<!-- ${title} -->`,
      ].join("\n");
    };

    const escapeHtml = (value) =>
      String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

    const safeUrl = (value) => {
      try {
        const parsed = new URL(value, origin);

        if (["http:", "https:"].includes(parsed.protocol)) {
          return parsed.href;
        }
      } catch {
        return "#";
      }

      return "#";
    };

    const isAllowedHtmlUrl = (value) => {
      try {
        const parsed = new URL(value, origin);
        return ["http:", "https:"].includes(parsed.protocol);
      } catch {
        return false;
      }
    };

    const looksLikeHtml = (value) => {
      const trimmed = value.replace(/<!--[\s\S]*?-->/g, "").trim();

      return /^<\/?[a-z][\w:-]*(\s|>|\/>)/i.test(trimmed);
    };

    const hasOpenHtmlBlock = (value) => {
      const tags = [
        "a",
        "blockquote",
        "details",
        "div",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "li",
        "ol",
        "p",
        "summary",
        "table",
        "tbody",
        "td",
        "th",
        "thead",
        "tr",
        "ul",
      ];

      return tags.some((tag) => {
        const open = value.match(new RegExp(`<${tag}\\b(?![^>]*\\/>)`, "gi")) || [];
        const close = value.match(new RegExp(`</${tag}>`, "gi")) || [];
        return open.length > close.length;
      });
    };

    const sanitizeHtml = (htmlText) => {
      const template = document.createElement("template");
      const allowedTags = new Set([
        "a",
        "b",
        "blockquote",
        "br",
        "code",
        "del",
        "details",
        "div",
        "em",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "hr",
        "i",
        "img",
        "ins",
        "kbd",
        "li",
        "ol",
        "p",
        "pre",
        "s",
        "small",
        "span",
        "strong",
        "sub",
        "summary",
        "sup",
        "table",
        "tbody",
        "td",
        "th",
        "thead",
        "tr",
        "ul",
      ]);
      const dropTags = new Set([
        "embed",
        "iframe",
        "math",
        "object",
        "script",
        "style",
        "svg",
        "template",
      ]);
      const globalAttributes = new Set(["align", "title"]);
      const tagAttributes = {
        a: new Set(["href", "target", "rel"]),
        details: new Set(["open"]),
        img: new Set(["align", "alt", "height", "src", "title", "width"]),
        td: new Set(["align", "colspan", "rowspan"]),
        th: new Set(["align", "colspan", "rowspan"]),
      };
      const safeDimension = (value) => /^[0-9.]+(%|px)?$/i.test(value);
      const safeAlign = (value) => /^(left|center|right|justify)$/i.test(value);

      template.innerHTML = htmlText.replace(/<!--[\s\S]*?-->/g, "");

      const cleanNode = (node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          return document.createTextNode(node.textContent || "");
        }

        if (node.nodeType !== Node.ELEMENT_NODE) {
          return document.createDocumentFragment();
        }

        const tag = node.tagName.toLowerCase();

        if (dropTags.has(tag)) {
          return document.createDocumentFragment();
        }

        if (!allowedTags.has(tag)) {
          const fragment = document.createDocumentFragment();
          [...node.childNodes].forEach((child) => {
            fragment.append(cleanNode(child));
          });
          return fragment;
        }

        const element = document.createElement(tag);
        [...node.attributes].forEach((attribute) => {
          const name = attribute.name.toLowerCase();
          const value = attribute.value.trim();
          const allowed =
            globalAttributes.has(name) || (tagAttributes[tag] && tagAttributes[tag].has(name));

          if (!allowed || name.startsWith("on")) {
            return;
          }

          if ((name === "href" || name === "src") && !isAllowedHtmlUrl(value)) {
            return;
          }

          if (name === "align" && !safeAlign(value)) {
            return;
          }

          if (["height", "width", "colspan", "rowspan"].includes(name) && !safeDimension(value)) {
            return;
          }

          element.setAttribute(name, value);
        });

        if (tag === "a") {
          element.setAttribute("target", "_blank");
          element.setAttribute("rel", "noreferrer");
        }

        if (tag === "img") {
          element.setAttribute("loading", "lazy");
        }

        [...node.childNodes].forEach((child) => {
          element.append(cleanNode(child));
        });

        return element;
      };

      const output = document.createElement("div");
      [...template.content.childNodes].forEach((node) => {
        output.append(cleanNode(node));
      });

      return output.innerHTML.trim();
    };

    const renderInline = (value) =>
      escapeHtml(value)
        .replace(/`([^`]+)`/g, "<code>$1</code>")
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/__([^_]+)__/g, "<strong>$1</strong>")
        .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+|\/[^)]+)\)/g, (_match, label, url) => {
          const safe = safeUrl(url);
          return `<a href="${safe}" target="_blank" rel="noreferrer">${label}</a>`;
        });

    const renderMarkdown = (markdown) => {
      const lines = markdown.replace(/\r\n/g, "\n").split("\n");
      const html = [];
      let paragraph = [];
      let inCode = false;
      let codeLines = [];

      const flushParagraph = () => {
        if (!paragraph.length) {
          return;
        }

        html.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
        paragraph = [];
      };

      const renderImage = (alt, src, href = "") => {
        const safeSrc = safeUrl(src);
        const image = `<img src="${safeSrc}" alt="${escapeHtml(alt)}" loading="lazy" />`;

        if (!href) {
          html.push(image);
          return;
        }

        html.push(`<a href="${safeUrl(href)}" target="_blank" rel="noreferrer">${image}</a>`);
      };

      const splitTableRow = (value) => {
        const normalized = value.trim().replace(/^\|/, "").replace(/\|$/, "");

        return normalized.split(/(?<!\\)\|/).map((cell) => cell.replace(/\\\|/g, "|").trim());
      };

      const isTableSeparator = (value) => {
        const cells = splitTableRow(value);

        return cells.length > 1 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
      };

      const getTableAlignments = (separatorLine) =>
        splitTableRow(separatorLine).map((cell) => {
          const left = cell.startsWith(":");
          const right = cell.endsWith(":");

          if (left && right) {
            return "center";
          }

          if (right) {
            return "right";
          }

          return left ? "left" : "";
        });

      const renderTable = (headerLine, separatorLine, bodyLines) => {
        const headerCells = splitTableRow(headerLine);
        const alignments = getTableAlignments(separatorLine);
        const renderCell = (tag, cell, cellIndex) => {
          const align = alignments[cellIndex] ? ` style="text-align: ${alignments[cellIndex]}"` : "";

          return `<${tag}${align}>${renderInline(cell)}</${tag}>`;
        };
        const head = headerCells.map((cell, cellIndex) => renderCell("th", cell, cellIndex)).join("");
        const body = bodyLines
          .map((bodyLine) => {
            const cells = splitTableRow(bodyLine);
            return `<tr>${cells.map((cell, cellIndex) => renderCell("td", cell, cellIndex)).join("")}</tr>`;
          })
          .join("");

        return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
      };

      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        const trimmed = line.trim();

        if (trimmed.startsWith("```")) {
          flushParagraph();

          if (inCode) {
            html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
            codeLines = [];
            inCode = false;
          } else {
            inCode = true;
          }

          continue;
        }

        if (inCode) {
          codeLines.push(line);
          continue;
        }

        if (!trimmed) {
          flushParagraph();
          continue;
        }

        if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
          flushParagraph();
          html.push("<hr />");
          continue;
        }

        if (trimmed.startsWith("<!--") || looksLikeHtml(trimmed)) {
          flushParagraph();

          const block = [line];
          while (
            index + 1 < lines.length &&
            lines[index + 1].trim() &&
            !lines[index + 1].trim().startsWith("```") &&
            (looksLikeHtml(lines[index + 1]) || hasOpenHtmlBlock(block.join("\n")))
          ) {
            index += 1;
            block.push(lines[index]);
          }

          const sanitized = sanitizeHtml(block.join("\n"));
          if (sanitized) {
            html.push(sanitized);
          }
          continue;
        }

        const linkedImage = trimmed.match(/^\[!\[([^\]]*)\]\(([^)]+)\)\]\(([^)]+)\)$/);
        const image = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);

        if (linkedImage) {
          flushParagraph();
          renderImage(linkedImage[1], linkedImage[2], linkedImage[3]);
          continue;
        }

        if (image) {
          flushParagraph();
          renderImage(image[1], image[2]);
          continue;
        }

        if (
          trimmed.includes("|") &&
          index + 1 < lines.length &&
          isTableSeparator(lines[index + 1].trim())
        ) {
          const headerLine = line;
          const separatorLine = lines[index + 1];
          const bodyLines = [];
          flushParagraph();
          index += 2;

          while (index < lines.length && lines[index].trim().includes("|")) {
            bodyLines.push(lines[index]);
            index += 1;
          }

          index -= 1;
          html.push(renderTable(headerLine, separatorLine, bodyLines));
          continue;
        }

        if (/^[-*]\s+/.test(trimmed)) {
          const items = [];
          flushParagraph();

          while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
            items.push(`<li>${renderInline(lines[index].trim().replace(/^[-*]\s+/, ""))}</li>`);
            index += 1;
          }

          index -= 1;
          html.push(`<ul>${items.join("")}</ul>`);
          continue;
        }

        if (/^\d+\.\s+/.test(trimmed)) {
          const items = [];
          flushParagraph();

          while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
            items.push(`<li>${renderInline(lines[index].trim().replace(/^\d+\.\s+/, ""))}</li>`);
            index += 1;
          }

          index -= 1;
          html.push(`<ol>${items.join("")}</ol>`);
          continue;
        }

        if (/^>\s?/.test(trimmed)) {
          const quoteLines = [];
          flushParagraph();

          while (index < lines.length && /^>\s?/.test(lines[index].trim())) {
            quoteLines.push(lines[index].trim().replace(/^>\s?/, ""));
            index += 1;
          }

          index -= 1;
          html.push(`<blockquote><p>${renderInline(quoteLines.join(" "))}</p></blockquote>`);
          continue;
        }

        if (trimmed.startsWith("### ")) {
          flushParagraph();
          html.push(`<h3>${renderInline(trimmed.slice(4))}</h3>`);
          continue;
        }

        if (trimmed.startsWith("## ")) {
          flushParagraph();
          html.push(`<h2>${renderInline(trimmed.slice(3))}</h2>`);
          continue;
        }

        if (trimmed.startsWith("# ")) {
          flushParagraph();
          html.push(`<h1>${renderInline(trimmed.slice(2))}</h1>`);
          continue;
        }

        paragraph.push(trimmed);
      }

      flushParagraph();

      if (inCode) {
        html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
      }

      readmeSandboxPreview.innerHTML = html.join("\n") || "<p>No README content yet.</p>";
    };

    const syncGeneratedReadme = () => {
      readmeSandboxInput.value = buildGeneratedReadme();
      renderMarkdown(readmeSandboxInput.value);
    };

    const updatePanels = () => {
      const tool = getTool();

      toolPanels.forEach((panel) => {
        panel.hidden = panel.dataset.toolPanel !== tool;
      });

      builderTitle.textContent = toolTitles[tool] || toolTitles.pulse;
    };

    const renderPreview = () => {
      const tool = getTool();
      const url = buildToolUrl(tool);
      const dimensions = getDimensions(tool);

      updatePanels();
      scaleOutput.textContent = `${dimensions.scale}%`;
      scaleWarning.hidden = dimensions.scale >= 80;

      if (tool === "social") {
        toolPreview.hidden = true;
        socialPreview.hidden = false;
        socialPreview.dataset.theme = getTheme();
        socialPreview.style.setProperty("--social-primary", fields.primary.value);
        socialPreview.style.setProperty("--social-secondary", fields.secondary.value);
        socialPreview.style.setProperty("--social-text", fields.text.value);
        socialPreview.innerHTML = buildSocialPreviewHtml();
      } else {
        socialPreview.hidden = true;
        socialPreview.removeAttribute("data-theme");
        socialPreview.innerHTML = "";
        toolPreview.hidden = false;
        toolPreview.src = url;
        toolPreview.alt = `${endpointLabels[tool] || "Generated SVG"} preview`;
      }

      if (tool === "badge" || tool === "social") {
        toolPreview.style.width = "";
        toolPreview.style.height = "";
      } else {
        toolPreview.style.width = `${dimensions.width}px`;
        toolPreview.style.height = "auto";
      }
      markdownOutput.value = buildMarkdown(tool, url);

      if (!sandboxTouched) {
        syncGeneratedReadme();
      }
    };

    const copyText = async (value, button, label) => {
      try {
        await navigator.clipboard.writeText(value);
      } catch {
        const fallback = document.createElement("textarea");
        fallback.value = value;
        fallback.style.position = "fixed";
        fallback.style.left = "-9999px";
        document.body.append(fallback);
        fallback.select();
        document.execCommand("copy");
        fallback.remove();
      }

      button.textContent = "Copied";
      window.setTimeout(() => {
        button.textContent = label;
      }, 1400);
    };

    builder.addEventListener("submit", (event) => event.preventDefault());
    builder.querySelectorAll("input, textarea").forEach((input) => {
      input.addEventListener("input", renderPreview);
      input.addEventListener("change", renderPreview);
    });
    themeInputs.forEach((input) => {
      input.addEventListener("change", () => {
        applyThemePreset();
        renderPreview();
      });
    });
    copyMarkdown.addEventListener("click", () =>
      copyText(markdownOutput.value, copyMarkdown, "Copy"),
    );
    readmeSandboxInput.addEventListener("input", () => {
      sandboxTouched = true;
      renderMarkdown(readmeSandboxInput.value);
    });
    syncReadme.addEventListener("click", () => {
      sandboxTouched = false;
      syncGeneratedReadme();
    });
    copyReadme.addEventListener("click", () =>
      copyText(readmeSandboxInput.value, copyReadme, "Copy README"),
    );

    renderPreview();
  }
}
