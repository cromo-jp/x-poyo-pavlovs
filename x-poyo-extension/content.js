const POYO_VARIANTS = [
  "ぽよ〜",
  "ポヨ〜",
  "ぽよー",
  "ポヨー",
  "ぽよ！",
  "ポヨ！",
  "ぽよ...",
  "ポヨ..."
];

const ENDING_REPLACEMENTS = [
  { pattern: /(でしょうか|でしょうね|でしょう)(?=$)/, suffix: pickPoyo },
  { pattern: /(でした)(?=$)/, suffix: () => "でした" + pickPoyo(true) },
  { pattern: /(です)(?=$)/, suffix: () => "です" + pickPoyo(true) },
  { pattern: /(ます)(?=$)/, suffix: () => "ます" + pickPoyo(true) },
  { pattern: /(たい)(?=$)/, suffix: () => "たい" + pickPoyo(true) },
  { pattern: /(ない)(?=$)/, suffix: () => "ない" + pickPoyo(true) },
  { pattern: /(だよ)(?=$)/, suffix: () => "だ" + pickPoyo(true) },
  { pattern: /(だね)(?=$)/, suffix: () => "だ" + pickPoyo(true) },
  { pattern: /(だ)(?=$)/, suffix: () => pickPoyo(true) },
  { pattern: /(だった)(?=$)/, suffix: () => "だった" + pickPoyo(true) },
  { pattern: /(かも)(?=$)/, suffix: () => "かも" + pickPoyo(true) },
  { pattern: /(かな)(?=$)/, suffix: () => "かな" + pickPoyo(true) },
  { pattern: /(よね)(?=$)/, suffix: () => pickPoyo(true) },
  { pattern: /(よ)(?=$)/, suffix: () => pickPoyo(true) },
  { pattern: /(ね)(?=$)/, suffix: () => pickPoyo(true) }
];

const TEXT_NODE = Node.TEXT_NODE;
const STYLE_ID = "x-poyo-softener-style";
const POYO_TOKEN_PATTERN = /(ぽよ|ポヨ)(〜|ー|！|\.{3})?/gu;
const BULGE_ANIMATIONS = [
  "poyo-softener-bulge-pop",
  "poyo-softener-bulge-jelly",
  "poyo-softener-bulge-spring",
  "poyo-softener-bulge-wobble"
];
const HOVER_INIT_MARK = "__poyoSoftenerHoverInit";

injectStyles();
initializeHoverBehavior();

function pickPoyo(plain = false) {
  const variant = POYO_VARIANTS[Math.floor(Math.random() * POYO_VARIANTS.length)];
  if (!plain) {
    return variant;
  }

  return variant.replace(/[！!]/g, "〜");
}

function softenLine(line) {
  const trimmedRight = line.replace(/\s+$/u, "");
  const trailingWhitespace = line.slice(trimmedRight.length);

  if (!trimmedRight) {
    return line;
  }

  const match = trimmedRight.match(/([。！？!?…]+)?$/u);
  const punctuation = match ? match[0] : "";
  const body = punctuation ? trimmedRight.slice(0, -punctuation.length) : trimmedRight;

  if (!body || /(?:ぽよ|ポヨ)(?:〜|ー|！|!|\.{3})?$/u.test(body)) {
    return line;
  }

  const softened = applyEndingRule(body);
  return `${softened}${trailingWhitespace}`;
}

function applyEndingRule(body) {
  for (const rule of ENDING_REPLACEMENTS) {
    if (rule.pattern.test(body)) {
      return body.replace(rule.pattern, () => rule.suffix());
    }
  }

  if (/[ぁ-んァ-ヶ一-龠ー々]$/u.test(body)) {
    return body + pickPoyo(true);
  }

  return body;
}

function transformText(text) {
  return text
    .split(/\n/u)
    .map((line) => softenLine(line))
    .join("\n");
}

function injectStyles() {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const styleHost = document.head || document.documentElement;
  if (!styleHost) {
    return;
  }

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .poyo-softener-processed {
      display: inline;
    }

    .poyo-softener-token {
      position: relative;
      display: inline-block;
      cursor: pointer;
      transform-origin: center 60%;
      font-weight: 700;
      font-size: 1.08em;
      line-height: 1;
      transition: font-weight 90ms ease, filter 120ms ease, font-size 120ms ease;
      will-change: transform;
    }

    .poyo-softener-token:hover {
      font-weight: 900;
      z-index: 1;
      color: transparent;
      background-image: linear-gradient(
        90deg,
        #ff2d55 0%,
        #ff8a00 14%,
        #ffe600 28%,
        #57ff57 42%,
        #00d5ff 58%,
        #4f7cff 72%,
        #c85cff 86%,
        #ff2d55 100%
      );
      background-size: 220% 100%;
      background-position: 0% 50%;
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;
      text-shadow:
        0 0 12px rgba(255, 255, 255, 0.48),
        0 0 22px rgba(255, 220, 120, 0.35),
        0 0 34px rgba(255, 120, 180, 0.25);
      filter:
        drop-shadow(0 0 8px rgba(255, 255, 255, 0.45))
        drop-shadow(0 0 18px rgba(255, 200, 80, 0.35));
      animation:
        var(--poyo-bulge-animation, poyo-softener-bulge-pop) 430ms cubic-bezier(0.16, 0.94, 0.24, 1.08) forwards,
        poyo-softener-rainbow 420ms linear infinite;
    }

    @keyframes poyo-softener-bulge-pop {
      0% {
        transform: scale(1);
      }

      8% {
        transform: translateX(-0.05em) scale(2.05) rotate(-6deg);
      }

      18% {
        transform: translateX(0.07em) scale(3.2) rotate(7deg);
      }

      32% {
        transform: translateX(-0.08em) scale(4.5) rotate(-8deg);
      }

      48% {
        transform: translateX(0.08em) scale(5.9) rotate(7deg);
      }

      64% {
        transform: translateX(-0.04em) scale(4.7) rotate(-4deg);
      }

      82% {
        transform: translateX(0.03em) scale(5.2) rotate(2deg);
      }

      92% {
        transform: translateX(-0.02em) scale(4.94) rotate(-1deg);
      }

      100% {
        transform: scale(5) rotate(0deg);
      }
    }

    @keyframes poyo-softener-bulge-jelly {
      0% {
        transform: scale(1, 1);
      }

      10% {
        transform: translateX(-0.05em) scale(2.7, 0.72) rotate(-4deg);
      }

      22% {
        transform: translateX(0.06em) scale(1.55, 2.95) rotate(5deg);
      }

      36% {
        transform: translateX(-0.07em) scale(3.95, 2.15) rotate(-5deg);
      }

      50% {
        transform: translateX(0.06em) scale(2.8, 5.5) rotate(4deg);
      }

      66% {
        transform: translateX(-0.04em) scale(5.85, 3.75) rotate(-3deg);
      }

      82% {
        transform: translateX(0.03em) scale(4.15, 5.45) rotate(2deg);
      }

      100% {
        transform: scale(5, 5) rotate(0deg);
      }
    }

    @keyframes poyo-softener-bulge-spring {
      0% {
        transform: scale(1);
      }

      8% {
        transform: translateY(0.18em) scale(1.25) rotate(-2deg);
      }

      18% {
        transform: translateY(-0.26em) scale(2.6) rotate(4deg);
      }

      32% {
        transform: translateY(0.16em) scale(3.15) rotate(-5deg);
      }

      46% {
        transform: translateY(-0.22em) scale(4.6) rotate(4deg);
      }

      60% {
        transform: translateY(0.12em) scale(4.75) rotate(-3deg);
      }

      74% {
        transform: translateY(-0.12em) scale(5.55) rotate(2deg);
      }

      88% {
        transform: translateY(0.05em) scale(4.9) rotate(-1deg);
      }

      100% {
        transform: scale(5) rotate(0deg);
      }
    }

    @keyframes poyo-softener-bulge-wobble {
      0% {
        transform: scale(1);
      }

      10% {
        transform: translateX(-0.14em) skewX(-13deg) scale(1.8) rotate(-9deg);
      }

      22% {
        transform: translateX(0.18em) skewX(12deg) scale(2.7) rotate(10deg);
      }

      36% {
        transform: translateX(-0.22em) skewX(-10deg) scale(3.75) rotate(-11deg);
      }

      52% {
        transform: translateX(0.2em) skewX(9deg) scale(4.7) rotate(9deg);
      }

      68% {
        transform: translateX(-0.12em) skewX(-6deg) scale(5.6) rotate(-6deg);
      }

      84% {
        transform: translateX(0.06em) skewX(3deg) scale(4.82) rotate(3deg);
      }

      100% {
        transform: scale(5) rotate(0deg) skewX(0deg);
      }
    }

    @keyframes poyo-softener-rainbow {
      0% {
        background-position: 0% 50%;
        filter:
          drop-shadow(0 0 8px rgba(255, 255, 255, 0.4))
          drop-shadow(0 0 16px rgba(255, 120, 180, 0.28));
      }

      50% {
        background-position: 100% 50%;
        filter:
          drop-shadow(0 0 10px rgba(255, 255, 255, 0.52))
          drop-shadow(0 0 20px rgba(255, 226, 82, 0.38));
      }

      100% {
        background-position: 220% 50%;
        filter:
          drop-shadow(0 0 8px rgba(255, 255, 255, 0.4))
          drop-shadow(0 0 16px rgba(75, 213, 255, 0.32));
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .poyo-softener-token:hover {
        animation: none;
        background-size: 100% 100%;
        background-position: 50% 50%;
        transform: scale(1.25);
      }
    }
  `;

  styleHost.appendChild(style);
}

function initializeHoverBehavior() {
  if (window[HOVER_INIT_MARK]) {
    return;
  }

  window[HOVER_INIT_MARK] = true;

  document.addEventListener(
    "mouseover",
    (event) => {
      if (!(event.target instanceof Element)) {
        return;
      }

      const token = event.target.closest(".poyo-softener-token");
      if (!token) {
        return;
      }

      token.style.setProperty("--poyo-bulge-animation", pickBulgeAnimation(token));
    },
    true
  );
}

function pickBulgeAnimation(token) {
  const current = token.style.getPropertyValue("--poyo-bulge-animation").trim();
  const candidates = BULGE_ANIMATIONS.filter((name) => name !== current);
  const pool = candidates.length > 0 ? candidates : BULGE_ANIMATIONS;

  return pool[Math.floor(Math.random() * pool.length)];
}

function buildProcessedNode(text) {
  const wrapper = document.createElement("span");
  wrapper.className = "poyo-softener-processed";

  let lastIndex = 0;

  for (const match of text.matchAll(POYO_TOKEN_PATTERN)) {
    const index = match.index ?? 0;
    const [fullMatch, base, suffix = ""] = match;

    if (index > lastIndex) {
      wrapper.append(document.createTextNode(text.slice(lastIndex, index)));
    }

    const token = document.createElement("span");
    token.className = "poyo-softener-token";
    token.style.setProperty("--poyo-bulge-animation", pickBulgeAnimation(token));
    token.textContent = base;
    wrapper.append(token);

    if (suffix) {
      wrapper.append(document.createTextNode(suffix));
    }

    lastIndex = index + fullMatch.length;
  }

  if (lastIndex < text.length) {
    wrapper.append(document.createTextNode(text.slice(lastIndex)));
  }

  return wrapper;
}

function shouldSkipNode(textNode) {
  if (!textNode || textNode.nodeType !== TEXT_NODE) {
    return true;
  }

  if (!textNode.textContent || !textNode.textContent.trim()) {
    return true;
  }

  const parent = textNode.parentElement;
  if (!parent) {
    return true;
  }

  return Boolean(
    parent.closest(
      "a, button, time, [role='link'], [contenteditable='true'], .poyo-softener-processed"
    )
  );
}

function processTextNode(textNode) {
  if (shouldSkipNode(textNode)) {
    return;
  }

  const currentText = textNode.textContent;
  const original = currentText;
  const transformed = transformText(original);

  if (transformed !== currentText) {
    textNode.replaceWith(buildProcessedNode(transformed));
  }
}

function walkTweetText(container) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const nodes = [];

  while (walker.nextNode()) {
    nodes.push(walker.currentNode);
  }

  for (const node of nodes) {
    processTextNode(node);
  }
}

function processRoot(root) {
  if (!(root instanceof Element) && root !== document) {
    return;
  }

  let containers;

  if (root === document) {
    containers = document.querySelectorAll("[data-testid='tweetText']");
  } else {
    const descendants = root.querySelectorAll
      ? Array.from(root.querySelectorAll("[data-testid='tweetText']"))
      : [];

    containers = root.matches?.("[data-testid='tweetText']")
      ? [root, ...descendants]
      : descendants;
  }

  for (const container of containers) {
    walkTweetText(container);
  }
}

const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    if (mutation.type === "childList") {
      for (const node of mutation.addedNodes) {
        processRoot(node);
      }
    }

    if (mutation.type === "characterData" && mutation.target.parentElement) {
      processRoot(mutation.target.parentElement);
    }
  }
});

processRoot(document);
observer.observe(document.body, {
  childList: true,
  subtree: true,
  characterData: true
});
