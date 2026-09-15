// scripts/portraits/portrait-debug.js

// #region Imports

import {
  MODULE_ID
} from "../../shared/protocol.js";

import {
  findUserByDiscordId,
  getReactivePortraitConfig
} from "./portrait-flags.js";

import {
  portraitState
} from "./portrait-state.js";

import {
  portraitBar
} from "./portrait-bar.js";

// #endregion


// #region Constants

const LOG_PREFIX = "[FoundryVTT_Max_Headroom]";

// #endregion

// #region User Resolution

function resolveUser(userReference) {
  if (!userReference) {
    return null;
  }

  if (
    typeof userReference === "object"
    && userReference.id
    && typeof userReference.getFlag === "function"
  ) {
    return userReference;
  }

  const value =
    String(userReference).trim();

  if (!value) {
    return null;
  }

  /* User id */
  const byId =
    game.users.get(value);

  if (byId) {
    return byId;
  }

  /* Foundry User name.*/
  const lowered =
    value.toLowerCase();

  const byName =
    game.users.find(
      (user) =>
        String(user.name ?? "")
          .toLowerCase()
          === lowered
    );

  if (byName) {
    return byName;
  }

  /*iscord User ID.*/
  return findUserByDiscordId(value);
}

function requireUser(userReference) {
  const user =
    resolveUser(userReference);

  if (!user) {
    throw new Error(
      `${LOG_PREFIX} Could not resolve Foundry User from "${String(userReference)}".`
    );
  }

  return user;
}

// #endregion


// #region State Inspection

export function getPortraitDebugState() {
  return portraitState.toObject();
}

export function inspectPortraitUser(userReference) {
  const user =
    requireUser(userReference);

  return {
    user: {
      id: user.id,
      name: user.name
    },

    config:
      getReactivePortraitConfig(user),

    state:
      portraitState.getState(user.id),

    pendingDecay:
      portraitState.hasPendingDecay(user.id)
  };
}

// #endregion

// #region Speaking Simulation

export function simulatePortraitSpeaking(
  userReference,
  speaking = true,
  {
    muted,
    deafened,
    decayMs
  } = {}
) {
  const user =
    requireUser(userReference);

  const config =
    getReactivePortraitConfig(user);

  const current =
    portraitState.getState(user.id);

  portraitState.ensureState(
    user.id,
    {
      discordUserId:
        config.discordUserId
    }
  );

  const options = {};

  if (decayMs !== undefined) {
    options.decayMs = decayMs;
  }

  const state =
    portraitState.setSpeakingState(
      user.id,
      {
        discordUserId:
          config.discordUserId,

        speaking:
          Boolean(speaking),

        muted:
          muted
          ?? current?.muted
          ?? false,

        deafened:
          deafened
          ?? current?.deafened
          ?? false
      },
      options
    );

  console.debug(
    `${LOG_PREFIX} Simulated portrait speaking state:`,
    {
      userId: user.id,
      userName: user.name,
      speaking: Boolean(speaking),
      state
    }
  );

  return state;
}

export function togglePortraitSpeaking(
  userReference,
  options = {}
) {
  const user =
    requireUser(userReference);

  const current =
    portraitState.getState(user.id);

  const nextSpeaking =
    !Boolean(current?.speaking);

  return simulatePortraitSpeaking(
    user,
    nextSpeaking,
    options
  );
}

export function simulateSimultaneousSpeakers(
  userReferences = []
) {
  if (!Array.isArray(userReferences)) {
    throw new TypeError(
      `${LOG_PREFIX} simulateSimultaneousSpeakers requires an array.`
    );
  }

  const results = [];

  for (const userReference of userReferences) {
    const user =
      requireUser(userReference);

    const state =
      simulatePortraitSpeaking(
        user,
        true
      );

    results.push({
      userId: user.id,
      userName: user.name,
      state
    });
  }

  return results;
}

// #endregion

// #region Mute and Deafen Simulation

export function simulatePortraitMuted(
  userReference,
  muted = true
) {
  const user =
    requireUser(userReference);

  const config =
    getReactivePortraitConfig(user);

  portraitState.ensureState(
    user.id,
    {
      discordUserId:
        config.discordUserId
    }
  );

  return portraitState.updateState(
    user.id,
    {
      discordUserId:
        config.discordUserId,

      muted:
        Boolean(muted)
    }
  );
}

export function togglePortraitMuted(
  userReference
) {
  const user =
    requireUser(userReference);

  const current =
    portraitState.getState(user.id);

  return simulatePortraitMuted(
    user,
    !Boolean(current?.muted)
  );
}

export function simulatePortraitDeafened(
  userReference,
  deafened = true
) {
  const user =
    requireUser(userReference);

  const config =
    getReactivePortraitConfig(user);

  portraitState.ensureState(
    user.id,
    {
      discordUserId:
        config.discordUserId
    }
  );

  return portraitState.updateState(
    user.id,
    {
      discordUserId:
        config.discordUserId,

      deafened:
        Boolean(deafened)
    }
  );
}

export function togglePortraitDeafened(
  userReference
) {
  const user =
    requireUser(userReference);

  const current =
    portraitState.getState(user.id);

  return simulatePortraitDeafened(
    user,
    !Boolean(current?.deafened)
  );
}

// #endregion

// #region Reset Utilities

export function resetPortraitSpeaking() {
  return portraitState.resetSpeakingStates();
}

export function resetPortraitStates() {
  return portraitState.resetAllStates();
}

export function clearPortraitStates() {
  portraitState.clear();
}

// #endregion

// #region Portrait Bar Utilities

export async function refreshPortraitBar() {
  return portraitBar.refresh();
}

export function patchPortraitBar() {
  portraitBar.patchAll();
}

// #endregion

// #region Debug API

export const portraitDebugApi = Object.freeze({
  getPortraitDebugState,
  inspectPortraitUser,

  simulatePortraitSpeaking,
  togglePortraitSpeaking,
  simulateSimultaneousSpeakers,

  simulatePortraitMuted,
  togglePortraitMuted,

  simulatePortraitDeafened,
  togglePortraitDeafened,

  resetPortraitSpeaking,
  resetPortraitStates,
  clearPortraitStates,

  refreshPortraitBar,
  patchPortraitBar
});

// #endregion