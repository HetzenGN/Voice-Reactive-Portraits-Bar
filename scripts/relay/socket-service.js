// scripts/relay/socket-service.js

// #region Imports

import {
  MODULE_ID,
  PROTOCOL_VERSION,
  SOCKET_CHANNEL,
  SOCKET_EVENTS,
  nowTs
} from "../../shared/protocol.js";

import {
  isDebugEnabled
} from "../settings.js";

import {
  findUserByDiscordId
} from "../portraits/portrait-flags.js";

import {
  portraitState
} from "../portraits/portrait-state.js";

import {
  relayState,
  RELAY_STATE_EVENTS
} from "./relay-state.js";

// #endregion


// #region Constants

const LOG_PREFIX = "[FoundryVTT_Max_Headroom]";

const AUTHORITATIVE_SOCKET_EVENTS =
  new Set([
    SOCKET_EVENTS.SPEAKING_UPDATE,
    SOCKET_EVENTS.FULLSYNC_RESPONSE,
    SOCKET_EVENTS.RESET_SPEAKING
  ]);

// #endregion


// #region Internal Helpers

function debugLog(...args) {
  if (!isDebugEnabled()) {
    return;
  }

  console.debug(
    `${LOG_PREFIX} [Socket]`,
    ...args
  );
}

function isGMUserId(userId) {
  if (!userId) {
    return false;
  }

  return Boolean(
    game.users.get(userId)?.isGM
  );
}

function isSocketEnvelope(payload) {
  if (
    !payload
    || typeof payload !== "object"
  ) {
    return false;
  }

  if (
    payload.version !== PROTOCOL_VERSION
  ) {
    return false;
  }

  if (
    !Object.values(SOCKET_EVENTS)
      .includes(payload.event)
  ) {
    return false;
  }

  if (
    typeof payload.senderUserId
    !== "string"
    || !payload.senderUserId
  ) {
    return false;
  }

  if (
    typeof payload.timestamp
    !== "number"
  ) {
    return false;
  }

  return true;
}

function normalizeClientPortraitState(
  state = {}
) {
  return {
    discordUserId:
      String(
        state.discordUserId
        ?? ""
      ),

    speaking:
      Boolean(state.speaking),

    muted:
      Boolean(state.muted),

    deafened:
      Boolean(state.deafened),

    updatedAt:
      Number.isFinite(
        Number(state.updatedAt)
      )
        ? Number(state.updatedAt)
        : nowTs()
  };
}

// #endregion


// #region Socket Service

export class SocketService {
  constructor() {
    // #region Runtime State

    this._initialized = false;

    this._authoritative = false;

    this._authorityUserId = null;

    this._unsubscribeRelayState = null;

    this._boundSocketHandler =
      this._onSocketMessage.bind(this);

    // #endregion
  }


  // #region Initialization

  initialize() {
    if (this._initialized) {
      return;
    }

    game.socket.on(
      SOCKET_CHANNEL,
      this._boundSocketHandler
    );

    this._initialized = true;

    debugLog(
      `Listening on ${SOCKET_CHANNEL}`
    );
  }


  destroy() {
    if (this._initialized) {
      game.socket.off(
        SOCKET_CHANNEL,
        this._boundSocketHandler
      );
    }

    this.setAuthoritative(false);

    this._initialized = false;
    this._authorityUserId = null;
  }

  // #endregion

  // #region Authority Management

  setAuthorityUserId(userId) {
    if (!userId) {
      this._authorityUserId = null;

      debugLog(
        "Cleared authoritative relay host."
      );

      return;
    }

    const user =
      game.users.get(
        String(userId)
      );

    if (!user?.isGM) {
      throw new Error(
        `${LOG_PREFIX} Socket authority must be a Foundry GM.`
      );
    }

    this._authorityUserId =
      user.id;

    debugLog(
      "Authoritative relay host:",
      user.name,
      user.id
    );
  }


  setAuthoritative(enabled) {
    const next =
      Boolean(enabled);

    if (
      next
      && !game.user?.isGM
    ) {
      throw new Error(
        `${LOG_PREFIX} Only a GM may become the authoritative relay host.`
      );
    }

    if (
      this._authoritative
      === next
    ) {
      return;
    }

    this._authoritative =
      next;

    if (next) {
      this.setAuthorityUserId(
        game.user.id
      );

      this._subscribeToRelayState();

      relayState.startWatchdog();

      this.broadcastFullSync();

      debugLog(
        "This client is now authoritative."
      );

      return;
    }

    this._unsubscribeFromRelayState();

    relayState.stopWatchdog();

    debugLog(
      "This client is no longer authoritative."
    );
  }


  isAuthoritative() {
    return this._authoritative;
  }


  getAuthorityUserId() {
    return this._authorityUserId;
  }

  // #endregion

  // #region Relay State Subscription

  _subscribeToRelayState() {
    if (this._unsubscribeRelayState) {
      return;
    }

    this._unsubscribeRelayState =
      relayState.subscribe(
        (event) => {
          this._onRelayStateEvent(
            event
          );
        }
      );
  }

  _unsubscribeFromRelayState() {
    if (!this._unsubscribeRelayState) {
      return;
    }

    this._unsubscribeRelayState();

    this._unsubscribeRelayState =
      null;
  }

  _onRelayStateEvent(event) {
    if (!this._authoritative) {
      return;
    }

    switch (event.type) {
      case RELAY_STATE_EVENTS.SPEAKING_UPDATE:
        this._publishSpeakingState(
          event.state,
          event.reason
        );
        break;

      case RELAY_STATE_EVENTS.FULL_STATE:
        this.broadcastFullSync();
        break;

      case RELAY_STATE_EVENTS.RESET_SPEAKING:
        break;

      default:
        break;
    }
  }

  // #endregion


  // #region Socket Envelope Creation

  _makeEnvelope(
    event,
    data = {}
  ) {
    return {
      event,

      version:
        PROTOCOL_VERSION,

      senderUserId:
        game.user.id,

      authorityUserId:
        this._authorityUserId,

      timestamp:
        nowTs(),

      ...data
    };
  }


  _emit(payload) {
    debugLog(
      "Emitting:",
      payload
    );

    game.socket.emit(
      SOCKET_CHANNEL,
      payload
    );
  }

  // #endregion

  // #region Incremental Speaking Updates

  _publishSpeakingState(
    discordState,
    reason = "relay-event"
  ) {
    const discordUserId =
      String(
        discordState?.discordUserId
        ?? ""
      );

    if (!discordUserId) {
      return;
    }

    const user =
      findUserByDiscordId(
        discordUserId
      );

    if (!user) {
      debugLog(
        "Skipping unmapped Discord user:",
        discordUserId
      );

      return;
    }

    const data = {
      userId:
        user.id,

      discordUserId,

      speaking:
        Boolean(
          discordState.speaking
        ),

      muted:
        Boolean(
          discordState.muted
        ),

      deafened:
        Boolean(
          discordState.deafened
        ),

      updatedAt:
        Number(
          discordState.updatedAt
          ?? nowTs()
        ),

      reason
    };

    this._applySpeakingUpdate(
      data
    );

    this._emit(
      this._makeEnvelope(
        SOCKET_EVENTS.SPEAKING_UPDATE,
        {
          data
        }
      )
    );
  }


  _applySpeakingUpdate(data) {
    const userId =
      String(
        data?.userId
        ?? ""
      );

    if (
      !userId
      || !game.users.get(userId)
    ) {
      debugLog(
        "Rejected speaking update for unknown Foundry User:",
        userId
      );

      return false;
    }

    portraitState.setSpeakingState(
      userId,
      {
        discordUserId:
          data.discordUserId,

        speaking:
          Boolean(
            data.speaking
          ),

        muted:
          Boolean(
            data.muted
          ),

        deafened:
          Boolean(
            data.deafened
          ),

        updatedAt:
          Number(
            data.updatedAt
            ?? nowTs()
          )
      }
    );

    return true;
  }

  // #endregion

  // #region Full Synchronization

  _buildPortraitStateSnapshot() {
    const speakingStates =
      relayState.getSpeakingStates();

    const snapshot = {};

    for (
      const [discordUserId, state]
      of Object.entries(
        speakingStates
      )
    ) {
      const user =
        findUserByDiscordId(
          discordUserId
        );

      if (!user) {
        continue;
      }

      snapshot[user.id] = {
        discordUserId,

        speaking:
          Boolean(state.speaking),

        muted:
          Boolean(state.muted),

        deafened:
          Boolean(state.deafened),

        updatedAt:
          Number(
            state.updatedAt
            ?? nowTs()
          )
      };
    }

    return snapshot;
  }


  requestFullSync() {
    if (!this._initialized) {
      return;
    }

    this._emit(
      this._makeEnvelope(
        SOCKET_EVENTS.FULLSYNC_REQUEST,
        {
          requesterUserId:
            game.user.id
        }
      )
    );

    debugLog(
      "Requested full state synchronization."
    );
  }

  broadcastFullSync(
    targetUserId = null
  ) {
    if (!this._authoritative) {
      return false;
    }

    const states =
      this._buildPortraitStateSnapshot();

    const payload =
      this._makeEnvelope(
        SOCKET_EVENTS.FULLSYNC_RESPONSE,
        {
          targetUserId,
          states
        }
      );

    if (!targetUserId) {
      portraitState.replaceAll(
        states
      );
    }

    this._emit(payload);

    return true;
  }

  _applyFullSync(states) {
    if (
      !states
      || typeof states !== "object"
      || Array.isArray(states)
    ) {
      debugLog(
        "Rejected malformed full sync."
      );

      return false;
    }

    const normalized = {};

    for (
      const [userId, state]
      of Object.entries(states)
    ) {
      if (!game.users.get(userId)) {
        continue;
      }

      normalized[userId] =
        normalizeClientPortraitState(
          state
        );
    }

    portraitState.replaceAll(
      normalized
    );

    debugLog(
      "Applied full state synchronization:",
      normalized
    );

    return true;
  }

  // #endregion

  // #region Reset Speaking

  broadcastResetSpeaking() {
    if (!this._authoritative) {
      return false;
    }

    portraitState.resetSpeakingStates();

    this._emit(
      this._makeEnvelope(
        SOCKET_EVENTS.RESET_SPEAKING
      )
    );

    return true;
  }

  // #endregion

  // #region Incoming Socket Handling

  _onSocketMessage(payload) {
    debugLog(
      "Received:",
      payload
    );

    if (!isSocketEnvelope(payload)) {
      debugLog(
        "Rejected malformed or incompatible socket packet."
      );

      return;
    }

    switch (payload.event) {
      case SOCKET_EVENTS.FULLSYNC_REQUEST:
        this._handleFullSyncRequest(
          payload
        );
        break;

      case SOCKET_EVENTS.SPEAKING_UPDATE:
      case SOCKET_EVENTS.FULLSYNC_RESPONSE:
      case SOCKET_EVENTS.RESET_SPEAKING:
        if (
          !this._isTrustedAuthoritativePacket(
            payload
          )
        ) {
          debugLog(
            "Rejected unauthorized authoritative packet.",
            payload
          );

          return;
        }

        this._handleAuthoritativePacket(
          payload
        );
        break;

      default:
        break;
    }
  }

  _isTrustedAuthoritativePacket(
    payload
  ) {
    if (
      !AUTHORITATIVE_SOCKET_EVENTS.has(
        payload.event
      )
    ) {
      return false;
    }

    if (
      !isGMUserId(
        payload.senderUserId
      )
    ) {
      return false;
    }

    if (
      payload.authorityUserId
      !== payload.senderUserId
    ) {
      return false;
    }

    if (
      this._authorityUserId
      && payload.senderUserId
        !== this._authorityUserId
    ) {
      return false;
    }

    if (!this._authorityUserId) {
      this._authorityUserId =
        payload.senderUserId;

      debugLog(
        "Learned relay host from authoritative packet:",
        this._authorityUserId
      );
    }

    return true;
  }

  _handleFullSyncRequest(
    payload
  ) {
    if (!this._authoritative) {
      return;
    }

    const requesterUserId =
      String(
        payload.requesterUserId
        ?? payload.senderUserId
        ?? ""
      );

    if (
      !requesterUserId
      || !game.users.get(
        requesterUserId
      )
    ) {
      debugLog(
        "Rejected full-sync request for unknown User."
      );

      return;
    }

    debugLog(
      "Responding to full-sync request:",
      requesterUserId
    );

    this.broadcastFullSync(
      requesterUserId
    );
  }

  _handleAuthoritativePacket(
    payload
  ) {
    switch (payload.event) {
      case SOCKET_EVENTS.SPEAKING_UPDATE:
        this._applySpeakingUpdate(
          payload.data
        );
        break;

      case SOCKET_EVENTS.FULLSYNC_RESPONSE:
        if (
          payload.targetUserId
          && payload.targetUserId
            !== game.user.id
        ) {
          return;
        }

        this._applyFullSync(
          payload.states
        );
        break;

      case SOCKET_EVENTS.RESET_SPEAKING:
        portraitState.resetSpeakingStates();
        break;

      default:
        break;
    }
  }

  // #endregion

  // #region Diagnostics

  getStatus() {
    return {
      initialized:
        this._initialized,

      authoritative:
        this._authoritative,

      authorityUserId:
        this._authorityUserId,

      channel:
        SOCKET_CHANNEL
    };
  }

  // #endregion
}

// #endregion


// #region Singleton

export const socketService =
  new SocketService();

// #endregion