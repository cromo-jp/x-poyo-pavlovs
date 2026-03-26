const STYLE_ID = "x-notification-jackpot-style";
const OVERLAY_ID = "x-notification-jackpot-overlay";
const STORAGE_KEY = "xNotificationJackpotStateV1";
const HISTORY_HOOK_FLAG = "__xNotificationJackpotHistoryHooked";
const UNREAD_RESET_GRACE_MS = 15000;
const LIVE_TAB_CLASS = "x-notification-jackpot-live";
const LIVE_BADGE_CLASS = "x-notification-jackpot-live-badge";
const OBSERVED_ATTRIBUTES = ["aria-label", "class", "data-testid", "href"];
const NOTIFICATION_TAB_SELECTORS = [
  '[data-testid="AppTabBar_Notifications_Link"]',
  'a[href="/notifications"]',
  'a[href$="/notifications"]',
  'a[aria-label*="Notifications"]',
  'a[aria-label*="Notification"]',
  'a[aria-label*="通知"]'
];

const DEFAULT_STATE = {
  unreadActive: false,
  litAt: null,
  lastCelebratedLitAt: null,
  lastCelebratedAt: null,
  lastRank: null,
  lastElapsedMs: null
};

const RANK_TABLE = [
  {
    rank: "SSS",
    maxMs: 1000,
    title: "神速開封",
    message: "通知との距離がゼロです。もう反応が直結しています。",
    accentA: "#fff4a6",
    accentB: "#ff5b5b",
    accentC: "#7b61ff"
  },
  {
    rank: "SS",
    maxMs: 1500,
    title: "超速反応",
    message: "かなり鋭いです。通知が来た瞬間に視線を奪っています。",
    accentA: "#ffe380",
    accentB: "#ff7a18",
    accentC: "#ff3cac"
  },
  {
    rank: "S",
    maxMs: 2000,
    title: "一流反応",
    message: "十分速いです。通知に愛されています。",
    accentA: "#d6ff7f",
    accentB: "#27c93f",
    accentC: "#0fb9ff"
  },
  {
    rank: "A",
    maxMs: 5000,
    title: "好反応",
    message: "まだ強いです。通知チェックの素養があります。",
    accentA: "#89f7fe",
    accentB: "#66a6ff",
    accentC: "#3867ff"
  },
  {
    rank: "B",
    maxMs: 30000,
    title: "平常運転",
    message: "悪くはありませんが、もっと派手に食いつけます。",
    accentA: "#c3bef0",
    accentB: "#7f7fd5",
    accentC: "#86a8e7"
  },
  {
    rank: "C",
    maxMs: 60000,
    title: "鈍り気味",
    message: "通知が少し待ちぼうけです。次はもう少しだけ早く。",
    accentA: "#fddb92",
    accentB: "#d1fdff",
    accentC: "#ff9a9e"
  },
  {
    rank: "D",
    maxMs: 300000,
    title: "重い腰",
    message: "かなりのんびりです。通知はもう半分あきらめています。",
    accentA: "#f6d365",
    accentB: "#fda085",
    accentC: "#ff6b6b"
  },
  {
    rank: "E",
    maxMs: 1800000,
    title: "ほぼ放置",
    message: "通知を試していますか。だいぶ見逃し気味です。",
    accentA: "#f093fb",
    accentB: "#f5576c",
    accentC: "#8f94fb"
  },
  {
    rank: "F",
    maxMs: Number.POSITIVE_INFINITY,
    title: "化石級遅延",
    message: "通知が泣いています。次は起きてから参戦してください。",
    accentA: "#b8c6db",
    accentB: "#6b7280",
    accentC: "#2f3640"
  }
];

let syncTimer = null;
let routePollId = null;
let observer = null;
let overlayDismissTimer = null;
let lastKnownUrl = location.href;
let lastNotificationsPageState = false;
let lastObservedUnreadAt = 0;
let suppressUnreadUntilFreshSignal = false;
let suppressedUnreadCount = null;
let suppressedUnreadFingerprint = "";

bootstrap();

function bootstrap() {
  injectStyles();
  installHistoryHooks();
  installClickHandler();
  installStorageListener();
  installDomObserver();
  queueSync();
}

function installHistoryHooks() {
  if (window[HISTORY_HOOK_FLAG]) {
    return;
  }

  window[HISTORY_HOOK_FLAG] = true;

  const wrapHistoryMethod = (methodName) => {
    const original = history[methodName];

    history[methodName] = function wrappedHistoryMethod(...args) {
      const result = original.apply(this, args);
      onRoutePossiblyChanged();
      return result;
    };
  };

  wrapHistoryMethod("pushState");
  wrapHistoryMethod("replaceState");

  window.addEventListener("popstate", onRoutePossiblyChanged);
  window.addEventListener("hashchange", onRoutePossiblyChanged);

  routePollId = window.setInterval(() => {
    if (location.href !== lastKnownUrl) {
      onRoutePossiblyChanged();
    }
  }, 500);
}

function onRoutePossiblyChanged() {
  if (location.href === lastKnownUrl) {
    queueSync();
    return;
  }

  lastKnownUrl = location.href;
  queueSync();
}

function installClickHandler() {
  document.addEventListener(
    "click",
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const notificationTab = target.closest(NOTIFICATION_TAB_SELECTORS.join(","));
      if (!notificationTab) {
        return;
      }

      void finalizeReaction("click", getUnreadSnapshot(notificationTab));
    },
    true
  );
}

function installStorageListener() {
  if (!chrome?.storage?.onChanged) {
    return;
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[STORAGE_KEY]) {
      return;
    }

    queueSync();
  });
}

function installDomObserver() {
  const start = () => {
    if (!document.body) {
      requestAnimationFrame(start);
      return;
    }

    observer = new MutationObserver(() => {
      queueSync();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: OBSERVED_ATTRIBUTES
    });
  };

  start();
}

function queueSync() {
  if (syncTimer !== null) {
    return;
  }

  syncTimer = window.setTimeout(async () => {
    syncTimer = null;
    await syncNotificationState();
  }, 80);
}

async function syncNotificationState() {
  const notificationTab = findNotificationTab();
  const unreadSnapshot = getUnreadSnapshot(notificationTab);
  const onNotificationsPage = isOnNotificationsPage();
  const now = Date.now();
  const unreadSuppressed = shouldSuppressUnread(unreadSnapshot);

  if (unreadSnapshot.active && !unreadSuppressed) {
    lastObservedUnreadAt = now;
  }

  const hasUnread =
    !unreadSuppressed &&
    (unreadSnapshot.active ||
      (!onNotificationsPage && lastObservedUnreadAt > 0 && now - lastObservedUnreadAt < UNREAD_RESET_GRACE_MS));

  decorateNotificationTab(notificationTab, hasUnread);

  if (hasUnread && !onNotificationsPage) {
    await patchState((state) => {
      if (state.unreadActive && state.litAt) {
        return null;
      }

      return {
        unreadActive: true,
        litAt: now
      };
    });
  } else if (!onNotificationsPage) {
    await patchState((state) => {
      if (!state.unreadActive && !state.litAt) {
        return null;
      }

      return {
        unreadActive: false,
        litAt: null
      };
    });
  }

  if (onNotificationsPage && !lastNotificationsPageState) {
    if (unreadSnapshot.active) {
      armUnreadSuppression(unreadSnapshot);
    }

    await finalizeReaction("page", unreadSnapshot);
  }

  lastNotificationsPageState = onNotificationsPage;
}

function findNotificationTab() {
  const selectors = NOTIFICATION_TAB_SELECTORS.join(",");
  const candidates = Array.from(document.querySelectorAll(selectors));

  return (
    candidates.find((candidate) => isVisible(candidate) && candidate.matches('a[href*="/notifications"]')) ||
    candidates.find((candidate) => isVisible(candidate)) ||
    null
  );
}

function getUnreadSnapshot(notificationTab) {
  const signals = [];
  const titleCount = getTitleUnreadCount();
  const badge = findNotificationBadge(notificationTab);
  const badgeText = badge ? normalizeSpace(badge.textContent || "") : "";
  const badgeCount = parseUnreadCount(badgeText);
  const tabMetaText = getNotificationTabMetaText(notificationTab);
  const tabMetaCount = parseUnreadCount(tabMetaText);

  if (detectUnreadNotificationFromTab(notificationTab)) {
    signals.push("tab-badge");
  }

  if (titleCount !== null && titleCount > 0) {
    signals.push("title");
  }

  const counts = [titleCount, badgeCount, tabMetaCount].filter((value) => Number.isFinite(value));

  return {
    active: signals.length > 0,
    signals,
    count: counts.length > 0 ? Math.max(...counts) : null,
    fingerprint: `title:${titleCount ?? "-"}|tab:${tabMetaText || "-"}|badge:${badgeText || "-"}`
  };
}

function getNotificationTabMetaText(notificationTab) {
  if (!notificationTab) {
    return "";
  }

  return normalizeSpace(
    [
      notificationTab.getAttribute("aria-label") || "",
      notificationTab.getAttribute("title") || "",
      notificationTab.textContent || ""
    ].join(" ")
  );
}

function getTitleUnreadCount() {
  const match = document.title.match(/^\((\d+)\)\s/u);
  if (!match) {
    return null;
  }

  return Number.parseInt(match[1], 10);
}

function parseUnreadCount(text) {
  const match = text.match(/\d+/u);
  if (!match) {
    return null;
  }

  return Number.parseInt(match[0], 10);
}

function detectUnreadNotificationFromTab(notificationTab) {
  if (!notificationTab) {
    return false;
  }

  const tabMeta = [
    notificationTab.getAttribute("aria-label") || "",
    notificationTab.getAttribute("title") || "",
    notificationTab.textContent || ""
  ].join(" ");

  if (/(?:unread|未読)/iu.test(tabMeta)) {
    return true;
  }

  if (/(?:notification|notifications|通知)/iu.test(tabMeta) && /\d+/u.test(tabMeta)) {
    return true;
  }

  const badgeCandidates = notificationTab.querySelectorAll(
    [
      '[data-testid*="badge"]',
      '[data-testid*="Badge"]',
      '[aria-label*="unread"]',
      '[aria-label*="Unread"]',
      '[aria-label*="未読"]',
      "span",
      "div"
    ].join(",")
  );

  return Array.from(badgeCandidates).some((candidate) => isUnreadBadgeCandidate(candidate, notificationTab));
}

function findNotificationBadge(notificationTab) {
  if (!notificationTab) {
    return null;
  }

  const badgeCandidates = Array.from(
    notificationTab.querySelectorAll(
      [
        '[data-testid*="badge"]',
        '[data-testid*="Badge"]',
        '[aria-label*="unread"]',
        '[aria-label*="Unread"]',
        '[aria-label*="未読"]',
        "span",
        "div"
      ].join(",")
    )
  ).filter((candidate) => isUnreadBadgeCandidate(candidate, notificationTab));

  if (badgeCandidates.length === 0) {
    return null;
  }

  return badgeCandidates
    .map((candidate) => ({
      candidate,
      score: scoreNotificationBadge(candidate)
    }))
    .sort((left, right) => right.score - left.score)[0]?.candidate || null;
}

function scoreNotificationBadge(candidate) {
  const text = normalizeSpace(candidate.textContent || "");
  const dataTestId = candidate.getAttribute("data-testid") || "";
  const label = candidate.getAttribute("aria-label") || "";
  const rect = candidate.getBoundingClientRect();
  let score = 0;

  if (/^\d+$/u.test(text)) {
    score += 6;
  } else if (/^(?:[•●•･·]|\d+\+?)$/u.test(text)) {
    score += 4;
  }

  if (/badge/iu.test(dataTestId)) {
    score += 5;
  }

  if (/(?:unread|未読)/iu.test(label)) {
    score += 4;
  }

  if (rect.width <= 32 && rect.height <= 32) {
    score += 2;
  }

  if (rect.width <= 24 && rect.height <= 24) {
    score += 2;
  }

  return score;
}

function isUnreadBadgeCandidate(candidate, notificationTab) {
  if (!(candidate instanceof Element) || candidate === notificationTab) {
    return false;
  }

  if (!isVisible(candidate)) {
    return false;
  }

  const label = candidate.getAttribute("aria-label") || "";
  if (/(?:unread|未読)/iu.test(label)) {
    return true;
  }

  const dataTestId = candidate.getAttribute("data-testid") || "";
  if (/badge/iu.test(dataTestId)) {
    return true;
  }

  const text = normalizeSpace(candidate.textContent || "");
  if (!text) {
    return false;
  }

  if (/^(?:\d+|[•●•･·])$/u.test(text)) {
    return true;
  }

  const rect = candidate.getBoundingClientRect();
  return rect.width <= 28 && rect.height <= 28 && /\d+/u.test(text);
}

function isVisible(element) {
  if (!(element instanceof Element)) {
    return false;
  }

  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
    return false;
  }

  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function decorateNotificationTab(notificationTab, hasUnread) {
  document.querySelectorAll(`.${LIVE_TAB_CLASS}`).forEach((node) => {
    if (node !== notificationTab) {
      node.classList.remove(LIVE_TAB_CLASS);
    }
  });

  document.querySelectorAll(`.${LIVE_BADGE_CLASS}`).forEach((node) => {
    node.classList.remove(LIVE_BADGE_CLASS);
  });

  if (!notificationTab) {
    return;
  }

  notificationTab.classList.toggle(LIVE_TAB_CLASS, hasUnread);

  const badge = findNotificationBadge(notificationTab);
  if (badge) {
    badge.classList.toggle(LIVE_BADGE_CLASS, hasUnread);
  }
}

function isOnNotificationsPage() {
  const path = location.pathname.replace(/\/+$/u, "") || "/";
  return /^\/notifications(?:\/|$)/u.test(path);
}

async function finalizeReaction(trigger, unreadSnapshot = null) {
  const now = Date.now();
  const snapshot = unreadSnapshot || getUnreadSnapshot(findNotificationTab());

  const result = await patchState((state) => {
    if (!state.unreadActive || !state.litAt) {
      return null;
    }

    if (state.lastCelebratedLitAt === state.litAt) {
      return null;
    }

    const elapsedMs = Math.max(0, now - state.litAt);
    const rankInfo = getRankInfo(elapsedMs);

    return {
      unreadActive: false,
      litAt: null,
      lastCelebratedLitAt: state.litAt,
      lastCelebratedAt: now,
      lastRank: rankInfo.rank,
      lastElapsedMs: elapsedMs
    };
  });

  if (!result || !result.changed || !result.previous.litAt) {
    return false;
  }

  armUnreadSuppression(snapshot);
  const elapsedMs = Math.max(0, now - result.previous.litAt);
  const rankInfo = getRankInfo(elapsedMs);
  showRankOverlay(rankInfo, elapsedMs, trigger);
  queueSync();
  return true;
}

function armUnreadSuppression(snapshot) {
  suppressUnreadUntilFreshSignal = true;
  suppressedUnreadCount = snapshot?.count ?? null;
  suppressedUnreadFingerprint = snapshot?.fingerprint || "";
  lastObservedUnreadAt = 0;
}

function clearUnreadSuppression() {
  suppressUnreadUntilFreshSignal = false;
  suppressedUnreadCount = null;
  suppressedUnreadFingerprint = "";
}

function shouldSuppressUnread(snapshot) {
  if (!suppressUnreadUntilFreshSignal) {
    return false;
  }

  if (!snapshot.active) {
    clearUnreadSuppression();
    return false;
  }

  if (
    Number.isFinite(snapshot.count) &&
    Number.isFinite(suppressedUnreadCount) &&
    snapshot.count > suppressedUnreadCount
  ) {
    clearUnreadSuppression();
    return false;
  }

  if (
    suppressedUnreadFingerprint &&
    snapshot.fingerprint &&
    snapshot.fingerprint !== suppressedUnreadFingerprint
  ) {
    clearUnreadSuppression();
    return false;
  }

  return true;
}

function getRankInfo(elapsedMs) {
  return RANK_TABLE.find((entry) => elapsedMs < entry.maxMs) || RANK_TABLE[RANK_TABLE.length - 1];
}

function showRankOverlay(rankInfo, elapsedMs, trigger) {
  const existing = document.getElementById(OVERLAY_ID);
  if (existing) {
    existing.remove();
  }

  if (overlayDismissTimer !== null) {
    window.clearTimeout(overlayDismissTimer);
    overlayDismissTimer = null;
  }

  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.className = "x-notification-jackpot-overlay";
  overlay.style.setProperty("--xnj-accent-a", rankInfo.accentA);
  overlay.style.setProperty("--xnj-accent-b", rankInfo.accentB);
  overlay.style.setProperty("--xnj-accent-c", rankInfo.accentC);

  const panel = document.createElement("div");
  panel.className = "x-notification-jackpot-panel";

  const badge = document.createElement("div");
  badge.className = "x-notification-jackpot-badge";
  badge.textContent = `${rankInfo.rank} RANK`;

  const title = document.createElement("div");
  title.className = "x-notification-jackpot-title";
  title.textContent = rankInfo.title;

  const elapsed = document.createElement("div");
  elapsed.className = "x-notification-jackpot-elapsed";
  elapsed.textContent = `${formatElapsed(elapsedMs)} / trigger: ${trigger}`;

  const message = document.createElement("div");
  message.className = "x-notification-jackpot-message";
  message.textContent = rankInfo.message;

  const burst = document.createElement("div");
  burst.className = "x-notification-jackpot-burst";
  burst.setAttribute("aria-hidden", "true");

  for (let index = 0; index < 10; index += 1) {
    const ray = document.createElement("span");
    ray.style.setProperty("--xnj-ray-rotate", `${index * 36}deg`);
    ray.style.setProperty("--xnj-ray-delay", `${index * 45}ms`);
    burst.appendChild(ray);
  }

  panel.append(badge, title, elapsed, message, burst);
  overlay.appendChild(panel);
  (document.body || document.documentElement).appendChild(overlay);

  overlayDismissTimer = window.setTimeout(() => {
    overlay.classList.add("is-leaving");
    window.setTimeout(() => {
      overlay.remove();
    }, 500);
  }, 4200);
}

function formatElapsed(elapsedMs) {
  if (elapsedMs < 1000) {
    return `${elapsedMs}ms`;
  }

  if (elapsedMs < 60000) {
    return `${(elapsedMs / 1000).toFixed(2)}s`;
  }

  return `${(elapsedMs / 60000).toFixed(2)}min`;
}

function normalizeSpace(text) {
  return text.replace(/\s+/gu, " ").trim();
}

function injectStyles() {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .x-notification-jackpot-live {
      position: relative !important;
      isolation: isolate;
      transform-origin: center;
      animation:
        x-notification-jackpot-bounce 0.75s ease-in-out infinite,
        x-notification-jackpot-rainbow 1.2s linear infinite !important;
      filter:
        saturate(1.45)
        drop-shadow(0 0 12px rgba(255, 255, 255, 0.72))
        drop-shadow(0 0 20px rgba(255, 196, 0, 0.6))
        drop-shadow(0 0 34px rgba(255, 0, 102, 0.48));
    }

    .x-notification-jackpot-live-badge {
      position: relative !important;
      z-index: 1;
      font-weight: 900 !important;
      transform-origin: center;
      animation:
        x-notification-jackpot-badge-pop 0.68s cubic-bezier(0.22, 0.8, 0.3, 1.2) infinite,
        x-notification-jackpot-badge-rainbow 0.95s linear infinite !important;
      filter:
        saturate(1.8)
        drop-shadow(0 0 8px rgba(255, 255, 255, 0.95))
        drop-shadow(0 0 14px rgba(255, 214, 10, 0.88))
        drop-shadow(0 0 28px rgba(255, 0, 133, 0.78));
      text-shadow:
        0 0 8px rgba(255, 255, 255, 0.95),
        0 0 16px rgba(255, 225, 91, 0.9),
        0 0 26px rgba(255, 0, 110, 0.72);
      box-shadow:
        0 0 16px rgba(255, 255, 255, 0.32),
        0 0 26px rgba(255, 196, 0, 0.46),
        0 0 42px rgba(255, 0, 98, 0.36);
    }

    .x-notification-jackpot-live-badge::before {
      content: "";
      position: absolute;
      inset: -5px;
      border-radius: inherit;
      background:
        conic-gradient(
          from 0deg,
          rgba(255, 61, 127, 0.95),
          rgba(255, 166, 0, 0.95),
          rgba(255, 240, 90, 0.95),
          rgba(98, 255, 103, 0.95),
          rgba(76, 224, 255, 0.95),
          rgba(112, 121, 255, 0.95),
          rgba(210, 94, 255, 0.95),
          rgba(255, 61, 127, 0.95)
        );
      z-index: -1;
      opacity: 0.95;
      filter: blur(7px);
      animation:
        x-notification-jackpot-rotate 0.7s linear infinite,
        x-notification-jackpot-pulse 0.55s ease-in-out infinite;
      pointer-events: none;
    }

    .x-notification-jackpot-live-badge > * {
      color: inherit !important;
    }

    .x-notification-jackpot-live::after {
      content: "";
      position: absolute;
      inset: -8px;
      border-radius: 999px;
      background:
        conic-gradient(
          from 0deg,
          rgba(255, 0, 102, 0.95),
          rgba(255, 145, 0, 0.95),
          rgba(255, 230, 0, 0.92),
          rgba(61, 255, 0, 0.92),
          rgba(0, 214, 255, 0.92),
          rgba(57, 124, 255, 0.95),
          rgba(177, 75, 255, 0.95),
          rgba(255, 0, 102, 0.95)
        );
      opacity: 0.75;
      z-index: -1;
      pointer-events: none;
      filter: blur(12px);
      animation:
        x-notification-jackpot-rotate 0.9s linear infinite,
        x-notification-jackpot-pulse 0.8s ease-in-out infinite;
    }

    .x-notification-jackpot-overlay {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      display: grid;
      place-items: center;
      pointer-events: none;
      background:
        radial-gradient(circle at center, rgba(255, 255, 255, 0.18), rgba(0, 0, 0, 0.58));
      animation: x-notification-jackpot-overlay-in 220ms ease-out forwards;
    }

    .x-notification-jackpot-overlay.is-leaving {
      animation: x-notification-jackpot-overlay-out 450ms ease-in forwards;
    }

    .x-notification-jackpot-panel {
      position: relative;
      width: min(88vw, 540px);
      padding: 28px 24px 30px;
      border: 2px solid rgba(255, 255, 255, 0.68);
      border-radius: 28px;
      overflow: hidden;
      text-align: center;
      color: #fffefb;
      background:
        linear-gradient(135deg, rgba(8, 14, 35, 0.96), rgba(26, 20, 48, 0.94)),
        linear-gradient(135deg, var(--xnj-accent-a), var(--xnj-accent-b), var(--xnj-accent-c));
      box-shadow:
        0 0 0 2px rgba(255, 255, 255, 0.18) inset,
        0 18px 80px rgba(0, 0, 0, 0.42),
        0 0 26px color-mix(in srgb, var(--xnj-accent-b) 64%, transparent),
        0 0 70px color-mix(in srgb, var(--xnj-accent-c) 52%, transparent);
      animation:
        x-notification-jackpot-panel-in 420ms cubic-bezier(0.17, 0.84, 0.24, 1.18) forwards,
        x-notification-jackpot-rainbow 2.1s linear infinite;
      backdrop-filter: blur(9px);
    }

    .x-notification-jackpot-panel::before,
    .x-notification-jackpot-panel::after {
      content: "";
      position: absolute;
      inset: 0;
      pointer-events: none;
    }

    .x-notification-jackpot-panel::before {
      background:
        radial-gradient(circle at 20% 20%, color-mix(in srgb, var(--xnj-accent-a) 80%, transparent), transparent 38%),
        radial-gradient(circle at 80% 30%, color-mix(in srgb, var(--xnj-accent-b) 76%, transparent), transparent 36%),
        radial-gradient(circle at 50% 85%, color-mix(in srgb, var(--xnj-accent-c) 74%, transparent), transparent 42%);
      opacity: 0.82;
      mix-blend-mode: screen;
    }

    .x-notification-jackpot-panel::after {
      background:
        linear-gradient(120deg, transparent 15%, rgba(255, 255, 255, 0.32) 42%, transparent 68%);
      transform: translateX(-140%);
      animation: x-notification-jackpot-shine 1.8s ease-in-out infinite;
    }

    .x-notification-jackpot-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 120px;
      margin-bottom: 12px;
      padding: 7px 14px;
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.46);
      background: rgba(255, 255, 255, 0.1);
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.24em;
      text-indent: 0.24em;
      text-transform: uppercase;
    }

    .x-notification-jackpot-title {
      font-size: clamp(34px, 9vw, 68px);
      font-weight: 900;
      letter-spacing: 0.08em;
      line-height: 0.96;
      text-shadow:
        0 0 16px rgba(255, 255, 255, 0.5),
        0 0 28px color-mix(in srgb, var(--xnj-accent-a) 60%, transparent),
        0 0 46px color-mix(in srgb, var(--xnj-accent-b) 68%, transparent);
    }

    .x-notification-jackpot-elapsed {
      margin-top: 14px;
      font-size: 15px;
      font-weight: 700;
      letter-spacing: 0.08em;
      color: rgba(255, 255, 255, 0.82);
    }

    .x-notification-jackpot-message {
      margin-top: 14px;
      padding: 0 10px;
      font-size: clamp(15px, 3.5vw, 20px);
      font-weight: 700;
      line-height: 1.6;
      text-wrap: balance;
      text-shadow: 0 0 18px rgba(255, 255, 255, 0.18);
    }

    .x-notification-jackpot-burst {
      position: absolute;
      inset: 50% auto auto 50%;
      width: 0;
      height: 0;
      pointer-events: none;
    }

    .x-notification-jackpot-burst span {
      position: absolute;
      left: 0;
      top: 0;
      width: 8px;
      height: 118px;
      border-radius: 999px;
      background:
        linear-gradient(
          to bottom,
          rgba(255, 255, 255, 0),
          rgba(255, 255, 255, 0.92),
          color-mix(in srgb, var(--xnj-accent-b) 72%, white)
        );
      transform-origin: center 0;
      transform: rotate(var(--xnj-ray-rotate)) translateY(-16px) scaleY(0.2);
      opacity: 0;
      animation: x-notification-jackpot-ray 860ms ease-out var(--xnj-ray-delay) forwards;
      filter: blur(0.3px);
    }

    @keyframes x-notification-jackpot-rainbow {
      0% {
        color: #ff5b5b;
      }

      17% {
        color: #ffb400;
      }

      34% {
        color: #ffee58;
      }

      51% {
        color: #42ff87;
      }

      68% {
        color: #48d6ff;
      }

      85% {
        color: #8f68ff;
      }

      100% {
        color: #ff5b5b;
      }
    }

    @keyframes x-notification-jackpot-badge-rainbow {
      0% {
        color: #ff4d6d;
      }

      16% {
        color: #ff9f1c;
      }

      32% {
        color: #fff275;
      }

      48% {
        color: #70e000;
      }

      64% {
        color: #00d1ff;
      }

      82% {
        color: #7b61ff;
      }

      100% {
        color: #ff4d6d;
      }
    }

    @keyframes x-notification-jackpot-badge-pop {
      0%,
      100% {
        transform: scale(1) translateY(0);
      }

      20% {
        transform: scale(1.16) translateY(-1px);
      }

      45% {
        transform: scale(1.3) translateY(-2px);
      }

      68% {
        transform: scale(1.12) translateY(0);
      }
    }

    @keyframes x-notification-jackpot-rotate {
      from {
        transform: rotate(0deg) scale(1);
      }

      to {
        transform: rotate(360deg) scale(1);
      }
    }

    @keyframes x-notification-jackpot-pulse {
      0%,
      100% {
        opacity: 0.4;
        transform: scale(0.94);
      }

      50% {
        opacity: 0.92;
        transform: scale(1.08);
      }
    }

    @keyframes x-notification-jackpot-bounce {
      0%,
      100% {
        transform: translateY(0) scale(1);
      }

      35% {
        transform: translateY(-1px) scale(1.04);
      }

      65% {
        transform: translateY(1px) scale(1.08);
      }
    }

    @keyframes x-notification-jackpot-overlay-in {
      from {
        opacity: 0;
      }

      to {
        opacity: 1;
      }
    }

    @keyframes x-notification-jackpot-overlay-out {
      from {
        opacity: 1;
      }

      to {
        opacity: 0;
      }
    }

    @keyframes x-notification-jackpot-panel-in {
      0% {
        transform: scale(0.75) translateY(26px);
        opacity: 0;
      }

      50% {
        transform: scale(1.06) translateY(-6px);
        opacity: 1;
      }

      100% {
        transform: scale(1) translateY(0);
        opacity: 1;
      }
    }

    @keyframes x-notification-jackpot-shine {
      0%,
      20% {
        transform: translateX(-140%);
      }

      45% {
        transform: translateX(160%);
      }

      100% {
        transform: translateX(160%);
      }
    }

    @keyframes x-notification-jackpot-ray {
      0% {
        opacity: 0;
        transform: rotate(var(--xnj-ray-rotate)) translateY(-16px) scaleY(0.2);
      }

      20% {
        opacity: 1;
      }

      100% {
        opacity: 0;
        transform: rotate(var(--xnj-ray-rotate)) translateY(-190px) scaleY(1);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .x-notification-jackpot-live,
      .x-notification-jackpot-live-badge,
      .x-notification-jackpot-live-badge::before,
      .x-notification-jackpot-live::after,
      .x-notification-jackpot-panel,
      .x-notification-jackpot-panel::after,
      .x-notification-jackpot-burst span {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
      }
    }
  `;

  (document.head || document.documentElement).appendChild(style);
}

function readState() {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      if (chrome.runtime.lastError) {
        resolve({ ...DEFAULT_STATE });
        return;
      }

      resolve({
        ...DEFAULT_STATE,
        ...(result?.[STORAGE_KEY] || {})
      });
    });
  });
}

async function patchState(updater) {
  const previous = await readState();
  const patch = typeof updater === "function" ? updater(previous) : updater;

  if (!patch || typeof patch !== "object") {
    return {
      previous,
      next: previous,
      changed: false
    };
  }

  const next = {
    ...previous,
    ...patch
  };

  await new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: next }, () => {
      resolve();
    });
  });

  return {
    previous,
    next,
    changed: true
  };
}
