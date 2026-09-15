// scripts/relay/relay-state.js

// #region Imports

import {
  PROTOCOL_VERSION,
  nowTs
} from "../../shared/protocol.js";

import {
  getSetting,
  SETTING_KEYS
} from "../settings.js";

// #endregion


// #region Constants

const LOG_PREFIX = "[FoundryVTT_Max_Headroom]";

export const RELAY_STATUS = Object.freeze({
  DISCONNECTED: "disconnected",
  CONNECTED: "connected",
  STALE: "stale",
  INCOMPATIBLE: "incompatible",
  ERROR: "error"
});

export const RELAY_STATE_EVENTS = Object.freeze({
  RELAY_STATUS: "relay-status",
  SPEAKING_UPDATE: "speaking-update",
  RESET_SPEAKING: "reset-speaking",
  FULL_STATE: "full-state",
  UNMAPPED_UPDATE: "unmapped-update"
});

const WATCHDOG_INTERVAL_MS = 500;

const DEFAULT_RELAY_HEARTBEAT_TIMEOUT_MS = 90000;

// #endregion


// #region Internal Helpers

function normalizeDiscordUserId(value) {
  if (
    value === null
    || value === undefined
  ) {
    return "";
  }

  return String(value).trim();
}

function normalizeSpeakingState(state = {}) {
  return {
    discordUserId:
      normalizeDiscordUserId(
        state.discordUserId
      ),

    username:
      state.username
      ?? undefined,

    nick:
      state.nick
      ?? undefined,

    speaking:
      Boolean(state.speaking),

    muted:
      Boolean(state.muted),

    deafened:
      Boolean(state.deafened),

    channelId:
      state.channelId
      ?? undefined,

    guildId:
      state.guildId
      ?? undefined,

    updatedAt:
      Number.isFinite(
        Number(state.updatedAt)
      )
        ? Number(state.updatedAt)
        : nowTs()
  };
}

function getStaleSpeakerTimeoutMs() {
  const value = Number(
    getSetting(
      SETTING_KEYS.STALE_SPEAKER_TIMEOUT_MS
    )
  );

  if (!Number.isFinite(value)) {
    return 10000;
  }

  return Math.max(
    1000,
    value
  );
}

function requireGM() {
  if (!game.user?.isGM) {
    throw new Error(
      `${LOG_PREFIX} Authoritative relay state may only be modified by a GM.`
    );
  }
}

function normalizeHeartbeatTimeout(
  value
) {
  const number =
    Number(value);


  if (!Number.isFinite(number)) {
    return null;
  }


  return Math.max(
    1000,
    number
  );
}

// #endregion

// #region Relay State Store

export class RelayStateStore {
  constructor() {
    // #region Relay Health State

    this._relayStatus =
      RELAY_STATUS.DISCONNECTED;

    this._lastHeartbeat = 0;
    this._lastValidDiscordEvent = 0;

    this._relayProtocolVersion = null;
    this._relayScriptVersion = null;
    this._heartbeatTimeoutOverrideMs =
      null;

    this._lastError = null;

    // #endregion

    // #region Speaking State

    this._speakingStates =
      new Map();

    this._unmappedUsers =
      new Map();

    // #endregion

    // #region Subscriptions and Watchdog

    this._listeners =
      new Set();

    this._watchdogTimer =
      null;

    // #endregion
  }

  // #region Relay Health Readers

  getRelayStatus() {
    return this._relayStatus;
  }

  getRelayHealth() {
    return {
      status:
        this._relayStatus,

      lastHeartbeat:
        this._lastHeartbeat,

      heartbeatTimeoutMs:
        this._heartbeatTimeoutOverrideMs
        ?? DEFAULT_RELAY_HEARTBEAT_TIMEOUT_MS,

      lastValidDiscordEvent:
        this._lastValidDiscordEvent,

      relayProtocolVersion:
        this._relayProtocolVersion,

      relayScriptVersion:
        this._relayScriptVersion,

      lastError:
        this._lastError
    };
  }

  // #endregion

  // #region Relay Health Writers

  markReady({
    protocolVersion = PROTOCOL_VERSION,
    scriptVersion,
    heartbeatTimeoutMs
  } = {}) {
    requireGM();


    this._relayProtocolVersion =
      protocolVersion;


    this._relayScriptVersion =
      scriptVersion
      ?? this._relayScriptVersion;


    this._heartbeatTimeoutOverrideMs =
      normalizeHeartbeatTimeout(
        heartbeatTimeoutMs
      );


    this._lastHeartbeat =
      nowTs();


    this._lastError =
      null;


    if (
      protocolVersion
      !== PROTOCOL_VERSION
    ) {
      this._setRelayStatus(
        RELAY_STATUS.INCOMPATIBLE
      );

      return this.getRelayHealth();
    }


    this._setRelayStatus(
      RELAY_STATUS.CONNECTED
    );


    return this.getRelayHealth();
  }

  recordHeartbeat({
    protocolVersion = PROTOCOL_VERSION,
    scriptVersion,
    timestamp = nowTs(),
    heartbeatTimeoutMs
  } = {}) {
    requireGM();


    this._relayProtocolVersion =
      protocolVersion;


    this._relayScriptVersion =
      scriptVersion
      ?? this._relayScriptVersion;


    if (
      heartbeatTimeoutMs
      !== undefined
    ) {
      this._heartbeatTimeoutOverrideMs =
        normalizeHeartbeatTimeout(
          heartbeatTimeoutMs
        );
    }


    this._lastHeartbeat =
      Number(timestamp)
      || nowTs();


    if (
      protocolVersion
      !== PROTOCOL_VERSION
    ) {
      this._setRelayStatus(
        RELAY_STATUS.INCOMPATIBLE
      );

      return this.getRelayHealth();
    }


    this._lastError =
      null;


    this._setRelayStatus(
      RELAY_STATUS.CONNECTED
    );


    return this.getRelayHealth();
  }

  markDisconnected() {
    requireGM();


    this._heartbeatTimeoutOverrideMs =
      null;


    this._setRelayStatus(
      RELAY_STATUS.DISCONNECTED
    );
  }

  markIncompatible(
    protocolVersion = null
  ) {
    requireGM();

    this._relayProtocolVersion =
      protocolVersion;

    this._setRelayStatus(
      RELAY_STATUS.INCOMPATIBLE
    );
  }

  markError(error) {
    requireGM();

    this._lastError =
      error instanceof Error
        ? error.message
        : String(error ?? "Unknown relay error");

    this._setRelayStatus(
      RELAY_STATUS.ERROR
    );
  }

  _setRelayStatus(status) {
    if (
      this._relayStatus
      === status
    ) {
      return;
    }

    this._relayStatus =
      status;

    this._emit({
      type:
        RELAY_STATE_EVENTS.RELAY_STATUS,

      health:
        this.getRelayHealth()
    });
  }

  // #endregion

  // #region Speaking State Readers

  getSpeakingState(
    discordUserId
  ) {
    const id =
      normalizeDiscordUserId(
        discordUserId
      );

    if (!id) {
      return null;
    }

    const state =
      this._speakingStates.get(id);

    return state
      ? { ...state }
      : null;
  }

  getSpeakingStates() {
    return Object.fromEntries(
      Array.from(
        this._speakingStates.entries(),
        ([id, state]) => [
          id,
          { ...state }
        ]
      )
    );
  }

  getActiveSpeakers() {
    return Array.from(
      this._speakingStates.values()
    )
      .filter(
        (state) =>
          state.speaking
      )
      .map(
        (state) => ({
          ...state
        })
      );
  }

  // #endregion

  // #region Speaking State Writers

  updateSpeakingState(
    update
  ) {
    requireGM();

    const state =
      normalizeSpeakingState({
        ...update,

        updatedAt:
          update?.timestamp
          ?? update?.updatedAt
          ?? nowTs()
      });

    if (!state.discordUserId) {
      throw new TypeError(
        `${LOG_PREFIX} Discord speaking update is missing discordUserId.`
      );
    }

    this._speakingStates.set(
      state.discordUserId,
      state
    );

    this._lastValidDiscordEvent =
      state.updatedAt;

    this._emit({
      type:
        RELAY_STATE_EVENTS.SPEAKING_UPDATE,

      reason:
        "relay-event",

      state: {
        ...state
      }
    });

    return {
      ...state
    };
  }

  resetSpeakingStates(
    reason = "manual-reset"
  ) {
    requireGM();

    const changed = [];

    for (
      const [discordUserId, state]
      of this._speakingStates.entries()
    ) {
      if (!state.speaking) {
        continue;
      }

      const nextState = {
        ...state,
        speaking: false,
        updatedAt: nowTs()
      };

      this._speakingStates.set(
        discordUserId,
        nextState
      );

      changed.push({
        ...nextState
      });

      this._emit({
        type:
          RELAY_STATE_EVENTS.SPEAKING_UPDATE,

        reason,

        state: {
          ...nextState
        }
      });
    }

    this._emit({
      type:
        RELAY_STATE_EVENTS.RESET_SPEAKING,

      reason,

      states:
        changed
    });

    return changed;
  }

  clearSpeakingStates() {
    requireGM();

    this._speakingStates.clear();

    this._emit({
      type:
        RELAY_STATE_EVENTS.FULL_STATE,

      states: {}
    });
  }

  // #endregion

  // #region Unmapped Discord Users

  recordUnmappedUser({
    discordUserId,
    username,
    nick,
    timestamp = nowTs()
  } = {}) {
    requireGM();

    const id =
      normalizeDiscordUserId(
        discordUserId
      );

    if (!id) {
      return null;
    }

    const record = {
      discordUserId:
        id,

      username:
        username
        ?? undefined,

      nick:
        nick
        ?? undefined,

      lastSeen:
        Number(timestamp)
        || nowTs()
    };

    this._unmappedUsers.set(
      id,
      record
    );

    this._emit({
      type:
        RELAY_STATE_EVENTS.UNMAPPED_UPDATE,

      unmappedUsers:
        this.getUnmappedUsers()
    });

    return {
      ...record
    };
  }

  clearUnmappedUser(
    discordUserId
  ) {
    requireGM();

    const id =
      normalizeDiscordUserId(
        discordUserId
      );

    if (!id) {
      return false;
    }

    const removed =
      this._unmappedUsers.delete(id);

    if (removed) {
      this._emit({
        type:
          RELAY_STATE_EVENTS.UNMAPPED_UPDATE,

        unmappedUsers:
          this.getUnmappedUsers()
      });
    }

    return removed;
  }

  getUnmappedUsers() {
    return Array.from(
      this._unmappedUsers.values()
    ).map(
      (entry) => ({
        ...entry
      })
    );
  }

  // #endregion

  // #region Full State Snapshot

  getFullState() {
    return {
      protocolVersion:
        PROTOCOL_VERSION,

      health:
        this.getRelayHealth(),

      speaking:
        this.getSpeakingStates(),

      unmappedUsers:
        this.getUnmappedUsers(),

      generatedAt:
        nowTs()
    };
  }

  // #endregion

  // #region Watchdog

  startWatchdog() {
    requireGM();

    if (this._watchdogTimer) {
      return;
    }

    this._watchdogTimer =
      globalThis.setInterval(
        () => {
          this._runWatchdog();
        },
        WATCHDOG_INTERVAL_MS
      );
  }

  stopWatchdog() {
    if (!this._watchdogTimer) {
      return;
    }

    globalThis.clearInterval(
      this._watchdogTimer
    );

    this._watchdogTimer =
      null;
  }

  _runWatchdog() {
    if (!game.user?.isGM) {
      return;
    }

    const currentTime =
      nowTs();

    this._checkRelayHeartbeat(
      currentTime
    );

    this._checkStaleSpeakers(
      currentTime
    );
  }

  _checkRelayHeartbeat(
    currentTime
  ) {
    if (
      this._relayStatus
      !== RELAY_STATUS.CONNECTED
    ) {
      return;
    }

    if (!this._lastHeartbeat) {
      return;
    }

    const timeout =
      this._heartbeatTimeoutOverrideMs
      ?? DEFAULT_RELAY_HEARTBEAT_TIMEOUT_MS;

    if (
      currentTime
      - this._lastHeartbeat
      <= timeout
    ) {
      return;
    }

    this._setRelayStatus(
      RELAY_STATUS.STALE
    );
  }

  _checkStaleSpeakers(
    currentTime
  ) {
    const timeout =
      getStaleSpeakerTimeoutMs();

    for (
      const [discordUserId, state]
      of this._speakingStates.entries()
    ) {
      if (!state.speaking) {
        continue;
      }

      if (
        currentTime
        - state.updatedAt
        <= timeout
      ) {
        continue;
      }

      const nextState = {
        ...state,

        speaking: false,

        updatedAt:
          currentTime
      };

      this._speakingStates.set(
        discordUserId,
        nextState
      );

      this._emit({
        type:
          RELAY_STATE_EVENTS.SPEAKING_UPDATE,

        reason:
          "stale-speaker-timeout",

        state: {
          ...nextState
        }
      });
    }
  }
  
  runWatchdogNow() {
    requireGM();

    this._runWatchdog();

    return this.getFullState();
  }

  // #endregion

  // #region Event Subscription

  subscribe(callback) {
    if (
      typeof callback
      !== "function"
    ) {
      throw new TypeError(
        "RelayStateStore.subscribe requires a callback function."
      );
    }

    this._listeners.add(
      callback
    );

    return () => {
      this._listeners.delete(
        callback
      );
    };
  }

  _emit(event) {
    for (
      const listener
      of this._listeners
    ) {
      try {
        listener(event);
      } catch (error) {
        console.error(
          `${LOG_PREFIX} Relay state listener failed.`,
          error
        );
      }
    }
  }

  // #endregion

  // #region Lifecycle

  destroy() {
    this.stopWatchdog();

    this._listeners.clear();
    this._speakingStates.clear();
    this._unmappedUsers.clear();
  }

  // #endregion
}

// #endregion


// #region Singleton

export const relayState =
  new RelayStateStore();

// #endregion