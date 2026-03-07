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
const PROCESS_MARK = "__poyoSoftener";

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

  return Boolean(parent.closest("a, button, time, [role='link'], [contenteditable='true']"));
}

function processTextNode(textNode) {
  if (shouldSkipNode(textNode)) {
    return;
  }

  const currentText = textNode.textContent;
  const state = textNode[PROCESS_MARK];

  if (state && state.transformed === currentText) {
    return;
  }

  const original = currentText;
  const transformed = transformText(original);

  textNode[PROCESS_MARK] = { original, transformed };
  if (transformed !== currentText) {
    textNode.textContent = transformed;
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
