// scripts/relay/relay-controller.js

// #region Imports

import {
  MODULE_ID,
  PROTOCOL_VERSION,
  nowTs,
  makeDiscordSpeaking,
  isDiscordSpeakingMessage,
  normalizeDiscordSpeakingMessage
} from "../../shared/protocol.js";

import {
  getSetting,
  setSetting,
  SETTING_KEYS,
  isDebugEnabled
} from "../settings.js";

import {
  findUserByDiscordId
} from "../portraits/portrait-flags.js";

import {
  relayState
} from "./relay-state.js";

import {
  socketService
} from "./socket-service.js";

import {
  discordUserDirectory
} from "./discord-user-directory.js";

// #endregion


// #region Constants

const LOG_PREFIX =
  "[FoundryVTT_Max_Headroom]";

const RELAY_POPUP_NAME =
  `${MODULE_ID}-streamkit-relay`;

const RELAY_POPUP_FEATURES = [
  "popup=yes",
  "width=1000",
  "height=800",
  "resizable=yes",
  "scrollbars=yes"
].join(",");

const MAX_MESSAGE_AGE_MS = 60000;
const MAX_FUTURE_SKEW_MS = 5000;

const EXTENSION_HEARTBEAT_TIMEOUT_MS = 90000;

// #endregion


// #region Internal Helpers

function debugLog(...args) {
  if (!isDebugEnabled()) {
    return;
  }

  console.debug(
    `${LOG_PREFIX} [Relay Controller]`,
    ...args
  );
}

function requireGM() {
  if (!game.user?.isGM) {
    throw new Error(
      `${LOG_PREFIX} Relay-host control is GM-only.`
    );
  }
}

function isFreshTimestamp(timestamp) {
  const value =
    Number(timestamp);

  if (!Number.isFinite(value)) {
    return false;
  }

  const current =
    nowTs();

  if (
    value
    > current + MAX_FUTURE_SKEW_MS
  ) {
    return false;
  }

  if (
    current - value
    > MAX_MESSAGE_AGE_MS
  ) {
    return false;
  }

  return true;
}

// #endregion

// #region Relay Controller

export class RelayController {
  constructor() {
    // #region Runtime State

    this._initialized = false;

    this._isLocalHost = false;

    this._popupWindow = null;

    this._lastRejectedMessage = null;

    this._extensionIngressCount = 0;

    this._lastExtensionEventAt = null;

    this._lastExtensionHeartbeatAt =
      null;

    this._extensionVersion =
      "";

    this._extensionChannelId =
      "";

    this._settingHookId = null;

    // #endregion
  }

  // #region Initialization

  initialize() {
    if (this._initialized) {
      return;
    }

    socketService.initialize();

    this._settingHookId =
      Hooks.on(
        "updateSetting",
        (setting) => {
          if (
            setting.key
            !== `${MODULE_ID}.${SETTING_KEYS.RELAY_HOST_USER_ID}`
          ) {
            return;
          }

          this._syncHostOwnership();
        }
      );

    this._initialized = true;

    this._syncHostOwnership();

    debugLog(
      "Relay Controller initialized."
    );
  }

  destroy() {
    this._deactivateLocalHost({
      closePopup: true
    });

    if (
      this._settingHookId !== null
    ) {
      Hooks.off(
        "updateSetting",
        this._settingHookId
      );

      this._settingHookId = null;
    }

    this._initialized = false;
  }

  // #endregion

  // #region Host Ownership

  getHostUserId() {
    return String(
      getSetting(
        SETTING_KEYS.RELAY_HOST_USER_ID
      )
      ?? ""
    );
  }

  getHostUser() {
    const userId =
      this.getHostUserId();

    if (!userId) {
      return null;
    }

    return (
      game.users.get(userId)
      ?? null
    );
  }


  isLocalHost() {
    return this._isLocalHost;
  }

  async claimHost({
    force = false
  } = {}) {
    requireGM();

    const existingHost =
      this.getHostUser();

    if (
      existingHost
      && existingHost.id
        !== game.user.id
      && existingHost.active
      && !force
    ) {
      throw new Error(
        `${LOG_PREFIX} ${existingHost.name} is already the active relay host.`
      );
    }

    await setSetting(
      SETTING_KEYS.RELAY_HOST_USER_ID,
      game.user.id
    );

    const confirmedHostId =
      this.getHostUserId();

    if (
      confirmedHostId
      !== game.user.id
    ) {
      throw new Error(
        `${LOG_PREFIX} Relay-host claim was not confirmed.`
      );
    }

    this._syncHostOwnership();

    return true;
  }


  async releaseHost() {
    requireGM();

    if (
      this.getHostUserId()
      !== game.user.id
    ) {
      return false;
    }

    relayState.resetSpeakingStates(
      "relay-host-release"
    );

    socketService.broadcastResetSpeaking();

    relayState.markDisconnected();

    this.closeRelayPopup();

    await setSetting(
      SETTING_KEYS.RELAY_HOST_USER_ID,
      ""
    );

    this._syncHostOwnership();

    return true;
  }


  _syncHostOwnership() {
    const hostUserId =
      this.getHostUserId();

    if (
      hostUserId
      && game.users.get(hostUserId)?.isGM
    ) {
      socketService.setAuthorityUserId(
        hostUserId
      );
    } else {
      socketService.setAuthorityUserId(
        null
      );
    }

    const shouldHost =
      Boolean(
        game.user?.isGM
        && hostUserId
          === game.user.id
      );

    if (shouldHost) {
      this._activateLocalHost();
    } else {
      this._deactivateLocalHost();
    }
  }

  _activateLocalHost() {
    if (this._isLocalHost) {
      return;
    }


    this._isLocalHost =
      true;


    socketService.setAuthoritative(
      true
    );


    debugLog(
      "Local GM became relay host."
    );
  }

  _deactivateLocalHost({
    closePopup = true
  } = {}) {
    if (!this._isLocalHost) {
      return;
    }


    if (closePopup) {
      this.closeRelayPopup();
    }


    socketService.setAuthoritative(
      false
    );


    this._isLocalHost =
      false;


    debugLog(
      "Local GM relinquished relay host."
    );
  }

  // #endregion

  // #region Popup Management

openRelayPopup() {
  requireGM();


  if (!this._isLocalHost) {
    throw new Error(
      `${LOG_PREFIX} Claim relay-host status before opening StreamKit.`
    );
  }


  const configuredUrl =
    String(
      getSetting(
        SETTING_KEYS.STREAMKIT_URL
      )
      ?? ""
    ).trim();


  if (!configuredUrl) {
    throw new Error(
      `${LOG_PREFIX} StreamKit Relay URL is not configured.`
    );
  }


  let url;


  try {
    url =
      new URL(
        configuredUrl,
        globalThis.location.href
      );

  } catch {
    throw new Error(
      `${LOG_PREFIX} StreamKit Relay URL is invalid.`
    );
  }


  const popupWindow =
    globalThis.open(
      url.toString(),
      RELAY_POPUP_NAME,
      RELAY_POPUP_FEATURES
    );


  if (!popupWindow) {
    throw new Error(
      `${LOG_PREFIX} StreamKit window was blocked by the browser.`
    );
  }

  this._popupWindow =
    popupWindow;


  return true;
}

  closeRelayPopup() {
    try {
      if (
        this._popupWindow
        && !this._popupWindow.closed
      ) {
        this._popupWindow.close();
      }

    } catch {
    }


    this._popupWindow =
      null;
  }

  // #endregion

  // #region Extension Ingress

receiveExtensionRelayHealth(
  rawPayload
) {
  if (
    !game.user?.isGM
    || !this._isLocalHost
  ) {
    return {
      ok: false,
      error:
        "not-relay-host"
    };
  }


  const validation =
    this._validateExtensionRelayHealth(
      rawPayload
    );


  if (!validation.valid) {
    this._recordRejectedMessage(
      `Extension health ingress: ${validation.reason}`,
      rawPayload
    );


    return {
      ok: false,

      error:
        "invalid-extension-health",

      reason:
        validation.reason
    };
  }


  const health =
    validation.payload;


  this._extensionVersion =
    health.extensionVersion;

  this._extensionChannelId =
    health.channelId;

  this._lastExtensionHeartbeatAt =
    nowTs();


  const scriptVersion =
    `Chromium Extension ${health.extensionVersion}`;


  switch (health.state) {
    case "ready":
      relayState.markReady({
        protocolVersion:
          PROTOCOL_VERSION,

        scriptVersion,

        heartbeatTimeoutMs:
          EXTENSION_HEARTBEAT_TIMEOUT_MS
      });

      break;


    case "heartbeat":
      relayState.recordHeartbeat({
        protocolVersion:
          PROTOCOL_VERSION,

        scriptVersion,

        timestamp:
          health.observedAt,

        heartbeatTimeoutMs:
          EXTENSION_HEARTBEAT_TIMEOUT_MS
      });

      break;


    case "disconnected":
      relayState.resetSpeakingStates(
        "extension-disconnected"
      );

      socketService
        .broadcastResetSpeaking();

      relayState.markDisconnected();

      break;


    default:
      break;
  }


  return {
    ok: true,

    state:
      health.state,

    extensionVersion:
      health.extensionVersion,

    channelId:
      health.channelId
  };
}


_validateExtensionRelayHealth(
  payload
) {
  if (
    !payload
    || typeof payload !== "object"
  ) {
    return {
      valid: false,
      reason:
        "Extension health payload is not an object."
    };
  }


  const acceptedStates =
    new Set([
      "ready",
      "heartbeat",
      "disconnected"
    ]);


  if (
    !acceptedStates.has(
      payload.state
    )
  ) {
    return {
      valid: false,
      reason:
        "Extension health payload has an invalid state."
    };
  }


  const channelId =
    typeof payload.channelId
      === "string"
      ? payload.channelId.trim()
      : "";


  if (
    !/^\d+$/.test(
      channelId
    )
  ) {
    return {
      valid: false,
      reason:
        "Extension health payload has an invalid Discord channel ID."
    };
  }


  const extensionVersion =
    typeof payload.extensionVersion
      === "string"
      ? payload.extensionVersion.trim()
      : "";


  if (
    !extensionVersion
    || extensionVersion.length > 32
  ) {
    return {
      valid: false,
      reason:
        "Extension health payload has an invalid extension version."
    };
  }


  const observedAt =
    Number(
      payload.observedAt
    );


  if (
    !isFreshTimestamp(
      observedAt
    )
  ) {
    return {
      valid: false,
      reason:
        "Extension health timestamp is stale or invalid."
    };
  }


  return {
    valid: true,

    payload: {
      state:
        payload.state,

      channelId,

      extensionVersion,

      observedAt
    }
  };
}


_recordExtensionActivity(
  timestamp = nowTs()
) {
  this._lastExtensionEventAt =
    nowTs();


  relayState.recordHeartbeat({
    protocolVersion:
      PROTOCOL_VERSION,

    scriptVersion:
      this._extensionVersion
        ? `Chromium Extension ${this._extensionVersion}`
        : "Chromium Extension",

    timestamp,

    heartbeatTimeoutMs:
      EXTENSION_HEARTBEAT_TIMEOUT_MS
  });
}

receiveExtensionSpeakingEvent(
  rawPayload
) {
  if (
    !game.user?.isGM
    || !this._isLocalHost
  ) {
    return {
      ok: false,
      error:
        "not-relay-host"
    };
  }


  const validation =
    this._validateExtensionSpeakingEvent(
      rawPayload
    );


  if (!validation.valid) {
    this._recordRejectedMessage(
      `Extension ingress: ${validation.reason}`,
      rawPayload
    );

    return {
      ok: false,

      error:
        "invalid-extension-payload",

      reason:
        validation.reason
    };
  }


  const extensionEvent =
    validation.payload;

  const protocolPayload =
    makeDiscordSpeaking({
      discordUserId:
        extensionEvent.discordUserId,

      speaking:
        extensionEvent.speaking,

      channelId:
        extensionEvent.channelId,

      timestamp:
        extensionEvent.observedAt
    });


  this._extensionIngressCount += 1;


  this._recordExtensionActivity(
    extensionEvent.observedAt
  );


  this._handleDiscordSpeaking(
    protocolPayload
  );


  return {
    ok: true,

    type:
      protocolPayload.type,

    discordUserId:
      protocolPayload.discordUserId,

    speaking:
      protocolPayload.speaking
  };
}

receiveExtensionDiscordUserEvent(
  rawPayload
) {
  if (
    !game.user?.isGM
    || !this._isLocalHost
  ) {
    return {
      ok: false,
      error:
        "not-relay-host"
    };
  }


  const validation =
    this._validateExtensionDiscordUserEvent(
      rawPayload
    );


  if (!validation.valid) {
    this._recordRejectedMessage(
      `Extension user ingress: ${validation.reason}`,
      rawPayload
    );

    return {
      ok: false,

      error:
        "invalid-extension-user-payload",

      reason:
        validation.reason
    };
  }

  this._recordExtensionActivity(
    validation.payload.observedAt
  );

  const voiceEvent =
    validation.payload;


  const entry =
    discordUserDirectory.record(
      voiceEvent
    );


  this._handleDiscordVoiceState(
    voiceEvent
  );


  return {
    ok: true,

    discordUserId:
      entry.discordUserId,

    displayName:
      entry.displayName,

    present:
      entry.present,

    muted:
      entry.muted
  };
}

_handleDiscordVoiceState(
  voiceEvent
) {
  const current =
    relayState.getSpeakingState(
      voiceEvent.discordUserId
    );


  const muted =
    voiceEvent.present
      ? Boolean(
          voiceEvent.muted
        )
      : false;


  const speaking =
    voiceEvent.present
    && !muted
      ? Boolean(
          current?.speaking
        )
      : false;


  relayState.updateSpeakingState({
    discordUserId:
      voiceEvent.discordUserId,

    username:
      voiceEvent.username
      || current?.username,

    nick:
      voiceEvent.nick
      || current?.nick,

    speaking,

    muted,

    deafened:
      false,

    channelId:
      voiceEvent.channelId
      || current?.channelId,

    guildId:
      voiceEvent.guildId
      || current?.guildId,

    timestamp:
      voiceEvent.observedAt
  });
}


getDiscoveredDiscordUsers() {
  return discordUserDirectory.list();
}


_validateExtensionDiscordUserEvent(
  payload
) {
  if (
    !payload
    || typeof payload !== "object"
  ) {
    return {
      valid: false,
      reason:
        "Extension user payload is not an object."
    };
  }


  const acceptedEvents =
    new Set([
      "VOICE_STATE_CREATE",
      "VOICE_STATE_UPDATE",
      "VOICE_STATE_DELETE"
    ]);


  if (
    !acceptedEvents.has(
      payload.eventName
    )
  ) {
    return {
      valid: false,
      reason:
        "Extension user payload has an invalid event name."
    };
  }


  const discordUserId =
    typeof payload.discordUserId
      === "string"
      ? payload.discordUserId.trim()
      : "";


  if (
    !/^\d+$/.test(
      discordUserId
    )
  ) {
    return {
      valid: false,
      reason:
        "Extension user payload has an invalid Discord User ID."
    };
  }


  const guildId =
    typeof payload.guildId
      === "string"
      ? payload.guildId.trim()
      : "";


  const channelId =
    typeof payload.channelId
      === "string"
      ? payload.channelId.trim()
      : "";


  if (
    !/^\d+$/.test(guildId)
    || !/^\d+$/.test(
      channelId
    )
  ) {
    return {
      valid: false,
      reason:
        "Extension user payload has invalid Discord guild/channel information."
    };
  }


  const expectedPresent =
    payload.eventName
      !== "VOICE_STATE_DELETE";


  if (
    payload.present
    !== expectedPresent
  ) {
    return {
      valid: false,
      reason:
        "Extension user presence does not match its voice-state event."
    };
  }

  if (
  typeof payload.muted
  !== "boolean"
) {
  return {
    valid: false,
    reason:
      "Extension user payload has an invalid muted state."
  };
}


  const observedAt =
    Number(
      payload.observedAt
    );


  if (
    !isFreshTimestamp(
      observedAt
    )
  ) {
    return {
      valid: false,
      reason:
        "Extension user event timestamp is stale or invalid."
    };
  }


  return {
    valid: true,

    payload: {
      eventName:
        payload.eventName,

      discordUserId,

      username:
        typeof payload.username
          === "string"
          ? payload.username.trim()
          : "",

      nick:
        typeof payload.nick
          === "string"
          ? payload.nick.trim()
          : "",

      guildId,
      channelId,

      present:
        expectedPresent,

      muted:
        expectedPresent
          ? payload.muted
          : false,

      observedAt
    }
  };
}

_validateExtensionSpeakingEvent(
  payload
) {
  if (
    !payload
    || typeof payload !== "object"
  ) {
    return {
      valid: false,
      reason:
        "Extension payload is not an object."
    };
  }


  const discordUserId =
    typeof payload.discordUserId
      === "string"
      ? payload.discordUserId.trim()
      : "";


  if (
    !discordUserId
    || !/^\d+$/.test(
      discordUserId
    )
  ) {
    return {
      valid: false,
      reason:
        "Extension payload has an invalid Discord User ID."
    };
  }


  const channelId =
    typeof payload.channelId
      === "string"
      ? payload.channelId.trim()
      : "";


  if (
    !channelId
    || !/^\d+$/.test(
      channelId
    )
  ) {
    return {
      valid: false,
      reason:
        "Extension payload has an invalid Discord channel ID."
    };
  }

  if (
    typeof payload.speaking
      !== "boolean"
  ) {
    return {
      valid: false,
      reason:
        "Extension payload has an invalid speaking state."
    };
  }


  const expectedEventName =
    payload.speaking
      ? "SPEAKING_START"
      : "SPEAKING_STOP";


  if (
    payload.eventName
    !== expectedEventName
  ) {
    return {
      valid: false,

      reason:
        `Extension event name does not match speaking=${String(payload.speaking)}.`
    };
  }


  const observedAt =
    Number(
      payload.observedAt
    );


  if (
    !isFreshTimestamp(
      observedAt
    )
  ) {
    return {
      valid: false,
      reason:
        "Extension speaking event timestamp is stale or invalid."
    };
  }


  return {
    valid: true,

    payload: {
      discordUserId,
      channelId,

      speaking:
        payload.speaking,

      eventName:
        expectedEventName,

      observedAt
    }
  };
}

// #endregion

// #region Validation Diagnostics

  _recordRejectedMessage(
    reason,
    payload
  ) {
    this._lastRejectedMessage = {
      reason,

      timestamp:
        nowTs(),

      type:
        payload?.type
        ?? payload?.eventName
        ?? payload?.state
        ?? null
    };


    debugLog(
      "Rejected extension relay message:",
      reason,
      payload
    );
  }

// #endregion

// #region Discord Speaking Processing

  _handleDiscordSpeaking(payload) {
    if (
      !isDiscordSpeakingMessage(
        payload
      )
    ) {
      this._recordRejectedMessage(
        "Malformed Discord speaking payload.",
        payload
      );

      return;
    }

    const normalized =
      normalizeDiscordSpeakingMessage(
        payload
      );

    if (!normalized) {
      this._recordRejectedMessage(
        "Discord speaking normalization failed.",
        payload
      );

      return;
    }

    const mappedUser =
      findUserByDiscordId(
        normalized.discordUserId
      );

    if (!mappedUser) {
      relayState.recordUnmappedUser({
        discordUserId:
          normalized.discordUserId,

        username:
          normalized.username,

        nick:
          normalized.nick,

        timestamp:
          normalized.timestamp
      });
    } else {
      relayState.clearUnmappedUser(
        normalized.discordUserId
      );
    }

    const current =
      relayState.getSpeakingState(
        normalized.discordUserId
      );


    relayState.updateSpeakingState({
      ...normalized,

      muted:
        current?.muted
        ?? false,

      deafened:
        false
    });
  }

  // #endregion


  // #region Diagnostics

  getStatus() {
    const host =
      this.getHostUser();


    return {
      initialized:
        this._initialized,

      isLocalHost:
        this._isLocalHost,

      hostUserId:
        host?.id
        ?? "",

      hostUserName:
        host?.name
        ?? "",

      hostActive:
        Boolean(
          host?.active
        ),

      transport:
        "chromium-extension",

      extensionVersion:
        this._extensionVersion,

      extensionChannelId:
        this._extensionChannelId,

      lastExtensionHeartbeatAt:
        this._lastExtensionHeartbeatAt,

      extensionIngressCount:
        this._extensionIngressCount,

      lastExtensionEventAt:
        this._lastExtensionEventAt,

      lastRejectedMessage:
        this._lastRejectedMessage
          ? {
              ...this._lastRejectedMessage
            }
          : null
    };
  }
  
  // #endregion
}

// #endregion


// #region Singleton

export const relayController =
  new RelayController();

// #endregion