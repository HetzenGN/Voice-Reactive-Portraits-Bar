// scripts/portraits/portrait-flags.js

// #region Imports

import {
  MODULE_ID,
  FLAG_KEYS
} from "../../shared/protocol.js";

// #endregion

// #region Constants

const FLAG_SCOPE = FLAG_KEYS.ROOT;

export const PORTRAIT_DISPLAY_NAME_MODES =
  Object.freeze({
    USER:
      "user",

    CHARACTER:
      "character",

    CUSTOM:
      "custom"
  });

export const DEFAULT_REACTIVE_PORTRAIT_CONFIG = Object.freeze({
  discordUserId: "",

  displayNameMode:
    PORTRAIT_DISPLAY_NAME_MODES.USER,

  customDisplayName: "",

  idleImage: "",
  talkingImage: "",
  mutedImage: "",

  enabled: false,
  sortOrder: 0
});

// #endregion

// #region Internal Helpers

function requireUser(user) {
  if (
    !user
    || typeof user.getFlag !== "function"
    || typeof user.setFlag !== "function"
  ) {
    throw new TypeError(
      `[${MODULE_ID}] Expected a Foundry User document.`
    );
  }

  return user;
}

function normalizeDiscordUserId(value) {
  if (value === null || value === undefined) return "";

  return String(value).trim();
}

function normalizeDisplayNameMode(value) {
  const normalized =
    String(
      value
      ?? ""
    )
      .trim()
      .toLowerCase();

  if (
    Object.values(
      PORTRAIT_DISPLAY_NAME_MODES
    ).includes(normalized)
  ) {
    return normalized;
  }

  return DEFAULT_REACTIVE_PORTRAIT_CONFIG
    .displayNameMode;
}

function normalizeCustomDisplayName(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function normalizeImagePath(value) {
  if (typeof value !== "string") return "";

  return value.trim();
}

function normalizeSortOrder(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return DEFAULT_REACTIVE_PORTRAIT_CONFIG.sortOrder;
  }

  return Math.trunc(number);
}

function normalizeConfig(config = {}) {
  return {
    discordUserId: normalizeDiscordUserId(
      config.discordUserId
    ),

    displayNameMode:
    normalizeDisplayNameMode(
      config.displayNameMode
    ),

  customDisplayName:
    normalizeCustomDisplayName(
      config.customDisplayName
    ),

    idleImage: normalizeImagePath(
      config.idleImage
    ),

    talkingImage: normalizeImagePath(
      config.talkingImage
    ),

    mutedImage: normalizeImagePath(
      config.mutedImage
    ),

    enabled: Boolean(
      config.enabled
    ),

    sortOrder: normalizeSortOrder(
      config.sortOrder
    )
  };
}

function requireGM() {
  if (!game.user?.isGM) {
    throw new Error(
      `[${MODULE_ID}] Reactive portrait configuration may only be modified by a GM.`
    );
  }
}

// #endregion

// #region Configuration Readers

export function getReactivePortraitConfig(user) {
  requireUser(user);

  return normalizeConfig({
    discordUserId:
      user.getFlag(
        FLAG_SCOPE,
        FLAG_KEYS.DISCORD_USER_ID
      )
      ?? DEFAULT_REACTIVE_PORTRAIT_CONFIG.discordUserId,

    displayNameMode:
      user.getFlag(
        FLAG_SCOPE,
        FLAG_KEYS.DISPLAY_NAME_MODE
      )
      ?? DEFAULT_REACTIVE_PORTRAIT_CONFIG.displayNameMode,

    customDisplayName:
      user.getFlag(
        FLAG_SCOPE,
        FLAG_KEYS.CUSTOM_DISPLAY_NAME
      )
      ?? DEFAULT_REACTIVE_PORTRAIT_CONFIG.customDisplayName,

    idleImage:
      user.getFlag(
        FLAG_SCOPE,
        FLAG_KEYS.IDLE_IMAGE
      )
      ?? DEFAULT_REACTIVE_PORTRAIT_CONFIG.idleImage,

    talkingImage:
      user.getFlag(
        FLAG_SCOPE,
        FLAG_KEYS.TALKING_IMAGE
      )
      ?? DEFAULT_REACTIVE_PORTRAIT_CONFIG.talkingImage,

    mutedImage:
      user.getFlag(
        FLAG_SCOPE,
        FLAG_KEYS.MUTED_IMAGE
      )
      ?? DEFAULT_REACTIVE_PORTRAIT_CONFIG.mutedImage,

    enabled:
      user.getFlag(
        FLAG_SCOPE,
        FLAG_KEYS.ENABLED
      )
      ?? DEFAULT_REACTIVE_PORTRAIT_CONFIG.enabled,

    sortOrder:
      user.getFlag(
        FLAG_SCOPE,
        FLAG_KEYS.SORT_ORDER
      )
      ?? DEFAULT_REACTIVE_PORTRAIT_CONFIG.sortOrder
  });
}

export function getAllReactivePortraitConfigs() {
  return game.users.map((user) => ({
    user,
    config: getReactivePortraitConfig(user)
  }));
}

export function getConfiguredReactiveUsers() {
  return getAllReactivePortraitConfigs()
    .filter(({ config }) => config.enabled)
    .sort((a, b) => {
      const orderDifference =
        a.config.sortOrder - b.config.sortOrder;

      if (orderDifference !== 0) {
        return orderDifference;
      }

      return String(a.user.name ?? "").localeCompare(
        String(b.user.name ?? "")
      );
    });
}

export function findUserByDiscordId(discordUserId) {
  const targetId = normalizeDiscordUserId(discordUserId);

  if (!targetId) return null;

  for (const user of game.users) {
    const config = getReactivePortraitConfig(user);

    if (config.discordUserId === targetId) {
      return user;
    }
  }

  return null;
}

// #endregion

// #region Configuration Writers

export async function setReactivePortraitConfig(
  user,
  changes = {}
) {
  requireGM();
  requireUser(user);

  const current = getReactivePortraitConfig(user);

  const next = normalizeConfig({
    ...current,
    ...changes
  });

  const writes = [];

  if (
    Object.hasOwn(changes, "discordUserId")
    && next.discordUserId !== current.discordUserId
  ) {
    writes.push([
      FLAG_KEYS.DISCORD_USER_ID,
      next.discordUserId
    ]);
  }

  if (
    Object.hasOwn(
      changes,
      "displayNameMode"
    )
    && next.displayNameMode
      !== current.displayNameMode
  ) {
    writes.push([
      FLAG_KEYS.DISPLAY_NAME_MODE,
      next.displayNameMode
    ]);
  }


  if (
    Object.hasOwn(
      changes,
      "customDisplayName"
    )
    && next.customDisplayName
      !== current.customDisplayName
  ) {
    writes.push([
      FLAG_KEYS.CUSTOM_DISPLAY_NAME,
      next.customDisplayName
    ]);
  }

  if (
    Object.hasOwn(changes, "idleImage")
    && next.idleImage !== current.idleImage
  ) {
    writes.push([
      FLAG_KEYS.IDLE_IMAGE,
      next.idleImage
    ]);
  }

  if (
    Object.hasOwn(changes, "talkingImage")
    && next.talkingImage !== current.talkingImage
  ) {
    writes.push([
      FLAG_KEYS.TALKING_IMAGE,
      next.talkingImage
    ]);
  }

  if (
    Object.hasOwn(changes, "mutedImage")
    && next.mutedImage !== current.mutedImage
  ) {
    writes.push([
      FLAG_KEYS.MUTED_IMAGE,
      next.mutedImage
    ]);
  }

  if (
    Object.hasOwn(changes, "enabled")
    && next.enabled !== current.enabled
  ) {
    writes.push([
      FLAG_KEYS.ENABLED,
      next.enabled
    ]);
  }

  if (
    Object.hasOwn(changes, "sortOrder")
    && next.sortOrder !== current.sortOrder
  ) {
    writes.push([
      FLAG_KEYS.SORT_ORDER,
      next.sortOrder
    ]);
  }

  for (const [key, value] of writes) {
    await user.setFlag(
      FLAG_SCOPE,
      key,
      value
    );
  }

  return getReactivePortraitConfig(user);
}

export async function resetReactivePortraitConfig(user) {
  requireGM();
  requireUser(user);

  return setReactivePortraitConfig(
    user,
    DEFAULT_REACTIVE_PORTRAIT_CONFIG
  );
}

export async function clearReactivePortraitConfig(user) {
  requireGM();
  requireUser(user);

  const keys = [
    FLAG_KEYS.DISCORD_USER_ID,
    FLAG_KEYS.IDLE_IMAGE,
    FLAG_KEYS.TALKING_IMAGE,
    FLAG_KEYS.MUTED_IMAGE,
    FLAG_KEYS.ENABLED,
    FLAG_KEYS.SORT_ORDER,
    FLAG_KEYS.DISPLAY_NAME_MODE,
    FLAG_KEYS.CUSTOM_DISPLAY_NAME
  ];

  for (const key of keys) {
    const existing = user.getFlag(
      FLAG_SCOPE,
      key
    );

    if (existing !== undefined) {
      await user.unsetFlag(
        FLAG_SCOPE,
        key
      );
    }
  }

  return getReactivePortraitConfig(user);
}

// #endregion

// #region Validation and Diagnostics

export function validateReactivePortraitConfig(user) {
  requireUser(user);

  const config = getReactivePortraitConfig(user);
  const warnings = [];

  if (config.enabled && !config.discordUserId) {
    warnings.push(
      "Enabled user has no Discord User ID."
    );
  }

  if (config.enabled && !config.idleImage) {
    warnings.push(
      "Enabled user has no idle image."
    );
  }

  if (
    config.enabled
    && config.idleImage
    && !config.talkingImage
  ) {
    warnings.push(
      "Talking image is missing; idle image will be used as the fallback."
    );
  }

  return {
    valid: warnings.length === 0,
    warnings,
    config
  };
}

// #endregion