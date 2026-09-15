// scripts/portraits/portrait-state.js

// #region Imports

import {
  nowTs
} from "../../shared/protocol.js";

import {
  getSetting,
  SETTING_KEYS
} from "../settings.js";

// #endregion

// #region Constants

export const DEFAULT_PORTRAIT_STATE = Object.freeze({
  discordUserId: "",
  speaking: false,
  muted: false,
  deafened: false,
  updatedAt: 0
});

export const PORTRAIT_STATE_EVENTS = Object.freeze({
  UPDATE: "update",
  REMOVE: "remove",
  RESET: "reset",
  REPLACE_ALL: "replace-all"
});

// #endregion

// #region Internal Helpers

function normalizeUserId(userId) {
  if (userId === null || userId === undefined) {
    return "";
  }

  return String(userId).trim();
}

function normalizeDiscordUserId(discordUserId) {
  if (discordUserId === null || discordUserId === undefined) {
    return "";
  }

  return String(discordUserId).trim();
}

function normalizeState(state = {}) {
  return {
    discordUserId: normalizeDiscordUserId(
      state.discordUserId
    ),

    speaking: Boolean(
      state.speaking
    ),

    muted: Boolean(
      state.muted
    ),

    deafened: Boolean(
      state.deafened
    ),

    updatedAt: Number.isFinite(Number(state.updatedAt))
      ? Number(state.updatedAt)
      : nowTs()
  };
}

function getSpeechDecayMs() {
  const value = Number(
    getSetting(SETTING_KEYS.SPEECH_DECAY_MS)
  );

  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, value);
}

function statesEqual(a, b) {
  return (
    a.discordUserId === b.discordUserId
    && a.speaking === b.speaking
    && a.muted === b.muted
    && a.deafened === b.deafened
    && a.updatedAt === b.updatedAt
  );
}

// #endregion

// #region Portrait State Store

export class PortraitStateStore {
  constructor() {
    this._states = new Map();
    this._decayTimers = new Map();
    this._listeners = new Set();
  }

  // #region State Readers

  getState(userId) {
    const normalizedUserId = normalizeUserId(userId);

    if (!normalizedUserId) {
      return null;
    }

    const state = this._states.get(normalizedUserId);

    return state
      ? { ...state }
      : null;
  }

  getAllStates() {
    return new Map(
      Array.from(
        this._states.entries(),
        ([userId, state]) => [
          userId,
          { ...state }
        ]
      )
    );
  }

  toObject() {
    return Object.fromEntries(
      Array.from(
        this._states.entries(),
        ([userId, state]) => [
          userId,
          { ...state }
        ]
      )
    );
  }

  hasState(userId) {
    const normalizedUserId = normalizeUserId(userId);

    return normalizedUserId
      ? this._states.has(normalizedUserId)
      : false;
  }

  // #endregion

  // #region State Initialization

  ensureState(userId, initialState = {}) {
    const normalizedUserId = normalizeUserId(userId);

    if (!normalizedUserId) {
      throw new TypeError(
        "PortraitStateStore.ensureState requires a Foundry User ID."
      );
    }

    if (this._states.has(normalizedUserId)) {
      return this.getState(normalizedUserId);
    }

    const state = normalizeState({
      ...DEFAULT_PORTRAIT_STATE,
      ...initialState,
      updatedAt:
        initialState.updatedAt
        ?? DEFAULT_PORTRAIT_STATE.updatedAt
    });

    this._states.set(
      normalizedUserId,
      state
    );

    return { ...state };
  }

  // #endregion

  // #region State Updates

  updateState(userId, changes = {}) {
    const normalizedUserId = normalizeUserId(userId);

    if (!normalizedUserId) {
      throw new TypeError(
        "PortraitStateStore.updateState requires a Foundry User ID."
      );
    }

    const previousState =
      this._states.get(normalizedUserId)
      ?? normalizeState({
        ...DEFAULT_PORTRAIT_STATE,
        updatedAt: 0
      });

    const nextState = normalizeState({
      ...previousState,
      ...changes,
      updatedAt:
        changes.updatedAt
        ?? nowTs()
    });

    if (statesEqual(previousState, nextState)) {
      return { ...nextState };
    }

    this._states.set(
      normalizedUserId,
      nextState
    );

    this._emit({
      type: PORTRAIT_STATE_EVENTS.UPDATE,
      userId: normalizedUserId,
      state: { ...nextState },
      previousState: { ...previousState }
    });

    return { ...nextState };
  }

setSpeakingState(
  userId,
  {
    discordUserId,
    speaking,
    muted,
    deafened,
    updatedAt
  } = {},
  {
    decayMs = getSpeechDecayMs()
  } = {}
) {
  const normalizedUserId =
    normalizeUserId(userId);

  if (!normalizedUserId) {
    throw new TypeError(
      "PortraitStateStore.setSpeakingState requires a Foundry User ID."
    );
  }

  this.ensureState(
    normalizedUserId,
    {
      discordUserId:
        discordUserId ?? ""
    }
  );

  const current =
    this._states.get(
      normalizedUserId
    );

  const isSpeaking =
    Boolean(speaking);

  // #region Mute Transition

const nextMuted =
  muted === undefined
    ? Boolean(
        current.muted
      )
    : Boolean(muted);


const muteChanged =
  muted !== undefined
  && nextMuted
    !== Boolean(
      current.muted
    );


if (muteChanged) {
  this._clearDecayTimer(
    normalizedUserId
  );


  return this.updateState(
    normalizedUserId,
    {
      discordUserId:
        discordUserId
        ?? current.discordUserId,

      speaking:
        nextMuted
          ? false
          : isSpeaking,

      muted:
        nextMuted,

      deafened:
        deafened
        ?? current.deafened,

      updatedAt:
        updatedAt
        ?? nowTs()
    }
  );
}

// #endregion

  // #region Speaking Started

  if (isSpeaking) {

    this._clearDecayTimer(
      normalizedUserId
    );

    return this.updateState(
      normalizedUserId,
      {
        discordUserId:
          discordUserId
          ?? current.discordUserId,

        speaking: true,

        muted:
          muted
          ?? current.muted,

        deafened:
          deafened
          ?? current.deafened,

        updatedAt:
          updatedAt
          ?? nowTs()
      }
    );
  }

  // #endregion

  // #region Speaking Stopped

  this.updateState(
    normalizedUserId,
    {
      discordUserId:
        discordUserId
        ?? current.discordUserId,

      speaking:
        current.speaking,

      muted:
        muted
        ?? current.muted,

      deafened:
        deafened
        ?? current.deafened,

      updatedAt:
        updatedAt
        ?? nowTs()
    }
  );

  this._clearDecayTimer(
    normalizedUserId
  );

  const latest =
    this._states.get(
      normalizedUserId
    );

  if (!latest?.speaking) {
    return {
      ...latest
    };
  }

  const normalizedDecay =
    Math.max(
      0,
      Number(decayMs) || 0
    );

  if (normalizedDecay === 0) {
    return this.updateState(
      normalizedUserId,
      {
        speaking: false,
        updatedAt: nowTs()
      }
    );
  }

  const timerId =
    globalThis.setTimeout(
      () => {
        this._decayTimers.delete(
          normalizedUserId
        );

        const state =
          this._states.get(
            normalizedUserId
          );

        if (!state?.speaking) {
          return;
        }

        this.updateState(
          normalizedUserId,
          {
            speaking: false,
            updatedAt: nowTs()
          }
        );
      },
      normalizedDecay
    );

  this._decayTimers.set(
    normalizedUserId,
    timerId
  );

  return this.getState(
    normalizedUserId
  );

  // #endregion
}

  // #endregion

  // #region Full Synchronization

  replaceAll(states = {}) {
    this._clearAllDecayTimers();

    const entries =
      states instanceof Map
        ? Array.from(states.entries())
        : Object.entries(states ?? {});

    const replacement = new Map();

    for (const [userId, state] of entries) {
      const normalizedUserId = normalizeUserId(userId);

      if (!normalizedUserId) {
        continue;
      }

      replacement.set(
        normalizedUserId,
        normalizeState({
          ...DEFAULT_PORTRAIT_STATE,
          ...(state ?? {})
        })
      );
    }

    this._states = replacement;

    this._emit({
      type: PORTRAIT_STATE_EVENTS.REPLACE_ALL,
      states: this.toObject()
    });

    return this.toObject();
  }

  // #endregion

  // #region Reset and Removal

  resetSpeakingStates() {
    this._clearAllDecayTimers();

    const changedUserIds = [];

    for (const [userId, state] of this._states.entries()) {
      if (!state.speaking) {
        continue;
      }

      const previousState = { ...state };

      const nextState = {
        ...state,
        speaking: false,
        updatedAt: nowTs()
      };

      this._states.set(
        userId,
        nextState
      );

      changedUserIds.push(userId);

      this._emit({
        type: PORTRAIT_STATE_EVENTS.UPDATE,
        userId,
        state: { ...nextState },
        previousState
      });
    }

    this._emit({
      type: PORTRAIT_STATE_EVENTS.RESET,
      userIds: changedUserIds
    });

    return changedUserIds;
  }

  resetAllStates() {
    this._clearAllDecayTimers();

    const userIds = Array.from(
      this._states.keys()
    );

    for (const userId of userIds) {
      const previousState = this._states.get(userId);

      const nextState = normalizeState({
        ...DEFAULT_PORTRAIT_STATE,
        discordUserId:
          previousState?.discordUserId
          ?? "",
        updatedAt: nowTs()
      });

      this._states.set(
        userId,
        nextState
      );

      this._emit({
        type: PORTRAIT_STATE_EVENTS.UPDATE,
        userId,
        state: { ...nextState },
        previousState: {
          ...previousState
        }
      });
    }

    this._emit({
      type: PORTRAIT_STATE_EVENTS.RESET,
      userIds
    });

    return userIds;
  }

  removeState(userId) {
    const normalizedUserId = normalizeUserId(userId);

    if (!normalizedUserId) {
      return false;
    }

    this._clearDecayTimer(
      normalizedUserId
    );

    const existed = this._states.delete(
      normalizedUserId
    );

    if (existed) {
      this._emit({
        type: PORTRAIT_STATE_EVENTS.REMOVE,
        userId: normalizedUserId
      });
    }

    return existed;
  }

  clear() {
    this._clearAllDecayTimers();
    this._states.clear();

    this._emit({
      type: PORTRAIT_STATE_EVENTS.REPLACE_ALL,
      states: {}
    });
  }

  // #endregion

  // #region Event Subscription

  subscribe(callback) {
    if (typeof callback !== "function") {
      throw new TypeError(
        "PortraitStateStore.subscribe requires a callback function."
      );
    }

    this._listeners.add(callback);

    return () => {
      this._listeners.delete(callback);
    };
  }

  _emit(event) {
    for (const listener of this._listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error(
          "[FoundryVTT_Max_Headroom] Portrait state listener failed.",
          error
        );
      }
    }
  }

  // #endregion

  // #region Decay Timers

_clearDecayTimer(userId) {
  const timerId =
    this._decayTimers.get(
      userId
    );

  if (timerId === undefined) {
    return;
  }

  globalThis.clearTimeout(
    timerId
  );

  this._decayTimers.delete(
    userId
  );
}

_clearAllDecayTimers() {
  for (
    const timerId
    of this._decayTimers.values()
  ) {
    globalThis.clearTimeout(
      timerId
    );
  }

  this._decayTimers.clear();
}

  hasPendingDecay(userId) {
    const normalizedUserId = normalizeUserId(userId);

    return normalizedUserId
      ? this._decayTimers.has(normalizedUserId)
      : false;
  }

  // #endregion

  // #region Lifecycle

  destroy() {
    this._clearAllDecayTimers();
    this._listeners.clear();
    this._states.clear();
  }

  // #endregion
}

// #endregion

// #region Singleton

export const portraitState = new PortraitStateStore();

// #endregion