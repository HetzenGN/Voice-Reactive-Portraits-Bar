// scripts/relay/relay-controller-app.js

// #region Imports

import {
  MODULE_ID,
  nowTs
} from "../../shared/protocol.js";

import {
  relayController
} from "./relay-controller.js";

import {
  relayState
} from "./relay-state.js";

import {
  socketService
} from "./socket-service.js";

import {
  COMPANION_EXTENSION_STORE_URL,
  DOCUMENTATION_URL
} from "../companion-links.js";

import {
  getAllReactivePortraitConfigs
} from "../portraits/portrait-flags.js";

import {
  ReactiveUserConfigApp
} from "../portraits/portrait-config-app.js";

// #endregion


// #region Foundry API

const {
  ApplicationV2,
  HandlebarsApplicationMixin
} = foundry.applications.api;

// #endregion


// #region Constants

const LOG_PREFIX =
  "[FoundryVTT_Max_Headroom]";

export const RELAY_CONTROLLER_MENU_KEY =
  "discordRelayController";

const UI_REFRESH_INTERVAL_MS = 1000;

const STATE_REFRESH_DEBOUNCE_MS = 75;

// #endregion


// #region Internal Helpers

function formatAge(timestamp) {
  const value =
    Number(timestamp);

  if (
    !Number.isFinite(value)
    || value <= 0
  ) {
    return "Never";
  }

  const ageMs =
    Math.max(
      0,
      nowTs() - value
    );

  if (ageMs < 1000) {
    return "Just now";
  }

  const seconds =
    Math.floor(
      ageMs / 1000
    );

  if (seconds < 60) {
    return `${seconds} second${seconds === 1 ? "" : "s"} ago`;
  }

  const minutes =
    Math.floor(
      seconds / 60
    );

  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }

  const hours =
    Math.floor(
      minutes / 60
    );

  return `${hours} hour${hours === 1 ? "" : "s"} ago`;
}

function getDiscordDisplayName(state) {
  return (
    state?.nick
    || state?.username
    || state?.discordUserId
    || "Unknown Discord User"
  );
}

function getErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(
    error ?? "Unknown error"
  );
}

// #endregion

// #region Onboarding Helpers

function countPortraitMappings() {
  const configs =
    getAllReactivePortraitConfigs();


  const enabled =
    configs.filter(
      ({ config }) =>
        Boolean(
          config.enabled
        )
    );


  const mapped =
    enabled.filter(
      ({ config }) =>
        Boolean(
          String(
            config.discordUserId
            ?? ""
          ).trim()
        )
    );


  return {
    enabledCount:
      enabled.length,

    mappedCount:
      mapped.length,

    complete:
      enabled.length > 0
      && mapped.length
        === enabled.length
  };
}


function openExternalUrl(
  url
) {
  globalThis.open(
    url,
    "_blank",
    "noopener,noreferrer"
  );
}

// #endregion

// #region Relay Controller Application

export class RelayControllerApp extends HandlebarsApplicationMixin(
  ApplicationV2
) {
  // #region Application Configuration

  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-relay-controller`,

    tag: "section",

    classes: [
      MODULE_ID,
      "max-headroom-relay-controller"
    ],

    position: {
      width: 560,
      height: 620
    },

    window: {
      title:
        "FoundryVTT_Max_Headroom: Discord Relay",

      icon:
        "fa-brands fa-discord",

      resizable: true
    }
  };


  static PARTS = {
    body: {
      template:
        `modules/${MODULE_ID}/templates/relay-controller.hbs`
    }
  };

  // #endregion


  // #region Construction

  constructor(options = {}) {
    super(options);

    this._unsubscribeRelayState =
      null;

    this._refreshTimer =
      null;

    this._refreshDebounceTimer =
      null;

    this._settingHookId =
      null;
  }

  // #endregion


  // #region Render Permission

  _canRender(options) {
    const allowed =
      super._canRender(options);

    if (allowed === false) {
      return false;
    }

    if (!game.user?.isGM) {
      ui.notifications.warn(
        "Only a GM may open the Discord Relay Controller."
      );

      return false;
    }

    return true;
  }

  // #endregion


  // #region Context Preparation

  async _prepareContext(options) {
    const context =
      await super._prepareContext(options);

    const controller =
      relayController.getStatus();

    const health =
      relayState.getRelayHealth();

    const discoveredDiscordUsers =
      relayController
        .getDiscoveredDiscordUsers();


    const presentDiscordUsers =
      discoveredDiscordUsers.filter(
        (user) =>
          user.present
      );


    const portraitMappings =
      countPortraitMappings();


    const companionDetected =
      health.status
      === "connected";


    const relayHostReady =
      Boolean(
        controller.isLocalHost
      );


    const discordUsersReady =
      presentDiscordUsers.length > 0;


    const onboardingReady =
      relayHostReady
      && companionDetected
      && discordUsersReady
      && portraitMappings.complete;

    const socket =
      socketService.getStatus();

    const host =
      relayController.getHostUser();

    const activeSpeakers =
      relayState
        .getActiveSpeakers()
        .map(
          (state) => ({
            discordUserId:
              state.discordUserId,

            displayName:
              getDiscordDisplayName(
                state
              ),

            username:
              state.username
              ?? "",

            nick:
              state.nick
              ?? "",

            muted:
              Boolean(
                state.muted
              ),

            deafened:
              Boolean(
                state.deafened
              ),

            updated:
              formatAge(
                state.updatedAt
              )
          })
        );

    const unmappedUsers =
      relayState
        .getUnmappedUsers()
        .map(
          (entry) => ({
            discordUserId:
              entry.discordUserId,

            displayName:
              getDiscordDisplayName(
                entry
              ),

            username:
              entry.username
              ?? "",

            nick:
              entry.nick
              ?? "",

            lastSeen:
              formatAge(
                entry.lastSeen
              )
          })
        );

    const isLocalHost =
      controller.isLocalHost;

    const hasHost =
      Boolean(host);

    const hostIsActive =
      Boolean(
        host?.active
      );

    const hostIsOtherGM =
      Boolean(
        host
        && host.id !== game.user.id
      );

    const canClaim =
      !isLocalHost
      && (
        !hasHost
        || !hostIsActive
      );

    return {
      ...context,

      // #region Relay Health Context

      relayStatus:
        health.status,

      relayTransport:
        "Chromium Extension",

      protocolVersion:
        health.relayProtocolVersion
        ?? "—",

      companionVersion:
        controller.extensionVersion
        || "—",

      heartbeatTimestamp:
        health.lastHeartbeat,

      heartbeatAge:
        formatAge(
          health.lastHeartbeat
        ),

      discordEventTimestamp:
        health.lastValidDiscordEvent,

      discordEventAge:
        formatAge(
          health.lastValidDiscordEvent
        ),

      streamKitChannelId:
        controller.extensionChannelId
        || "—",

      lastError:
        health.lastError
        ?? "",

      // #endregion

      // #region Onboarding Context

        companionDetected,

        relayHostReady,

        discordUsersReady,

        onboardingReady,

        detectedDiscordUserCount:
          presentDiscordUsers.length,

        knownDiscordUserCount:
          discoveredDiscordUsers.length,

        portraitMappedCount:
          portraitMappings.mappedCount,

        portraitEnabledCount:
          portraitMappings.enabledCount,

        portraitMappingsComplete:
          portraitMappings.complete,

        // #endregion


      // #region Relay Host Context

      hasHost,

      hostUserId:
        host?.id
        ?? "",

      hostUserName:
        host?.name
        ?? "None",

      hostIsActive,

      hostIsOtherGM,

      isLocalHost,

      canClaim,

      // #endregion


      // #region Socket Context

      socketInitialized:
        Boolean(
          socket.initialized
        ),

      socketAuthoritative:
        Boolean(
          socket.authoritative
        ),

      socketChannel:
        socket.channel
        ?? "",

      // #endregion


      // #region Discord State Context

      activeSpeakers,

      hasActiveSpeakers:
        activeSpeakers.length > 0,

      activeSpeakerCount:
        activeSpeakers.length,

      unmappedUsers,

      hasUnmappedUsers:
        unmappedUsers.length > 0,

      unmappedUserCount:
        unmappedUsers.length,

      // #endregion


      // #region Diagnostics Context

      expectedOrigin:
        controller.expectedOrigin
        || "Not configured",

      lastRejectedMessage:
        controller.lastRejectedMessage,

      hasRejectedMessage:
        Boolean(
          controller.lastRejectedMessage
        )

      // #endregion

      
    };
  }

  // #endregion

  // #region Render Lifecycle

  async _onRender(
    context,
    options
  ) {
    await super._onRender(
      context,
      options
    );

    this._ensureRelaySubscription();
    this._ensureSettingHook();
    this._startRefreshTimer();
  }

  _onClose(options) {
    this._removeRelaySubscription();
    this._removeSettingHook();
    this._stopRefreshTimer();
    this._clearQueuedRefresh();

    return super._onClose(
      options
    );
  }

  // #endregion

  // #region Application Actions

  async _onClickAction(
    event,
    target
  ) {
    switch (
      target.dataset.action
    ) {
      case "claimHost":
        return this._actionClaimHost();

      case "openRelay":
        return this._actionOpenRelay();

      case "resetSpeaking":
        return this._actionResetSpeaking();

      case "releaseHost":
        return this._actionReleaseHost();

      case "refresh":
        return this._actionRefresh();

      case "getCompanionExtension":
        openExternalUrl(
          COMPANION_EXTENSION_STORE_URL
        );

        return;


      case "openDocumentation":
        openExternalUrl(
          DOCUMENTATION_URL
        );

        return;


      case "configurePortraits": {
        const app =
          new ReactiveUserConfigApp();


        app.render({
          force: true
        });

        return;
      }

      default:
        return super._onClickAction(
          event,
          target
        );
    }
  }

  // #endregion

  // #region Relay Host Actions

  async _actionClaimHost() {
    try {
      await relayController.claimHost();

      ui.notifications.info(
        "Relay host claimed."
      );

      await this.render({
        force: true
      });
    } catch (error) {
      console.error(
        `${LOG_PREFIX} Failed to claim relay host.`,
        error
      );

      ui.notifications.error(
        getErrorMessage(error)
      );
    }
  }

  async _actionReleaseHost() {
    if (
      !relayController.isLocalHost()
    ) {
      ui.notifications.warn(
        "This GM is not the active relay host."
      );

      return;
    }

    try {
      await relayController.releaseHost();

      ui.notifications.info(
        "Relay host released."
      );

      await this.render({
        force: true
      });
    } catch (error) {
      console.error(
        `${LOG_PREFIX} Failed to release relay host.`,
        error
      );

      ui.notifications.error(
        getErrorMessage(error)
      );
    }
  }

  // #endregion

  // #region Relay Popup Actions

  async _actionOpenRelay() {
    if (
      !relayController.isLocalHost()
    ) {
      ui.notifications.warn(
        "Claim relay-host status before opening StreamKit."
      );

      return;
    }

    try {
      relayController.openRelayPopup();

      ui.notifications.info(
        "StreamKit window opened. The Chromium relay extension will connect automatically."
      );

      this._queueRefresh();
    } catch (error) {
      console.error(
        `${LOG_PREFIX} Failed to open StreamKit relay.`,
        error
      );

      ui.notifications.error(
        getErrorMessage(error)
      );
    }
  }

  // #endregion

  // #region Speaking State Actions

  async _actionResetSpeaking() {
    if (
      !relayController.isLocalHost()
    ) {
      ui.notifications.warn(
        "Only the active relay host may reset authoritative speaking state."
      );

      return;
    }

    try {
      relayState.resetSpeakingStates(
        "manual-controller-reset"
      );

      socketService.broadcastResetSpeaking();

      ui.notifications.info(
        "Speaking states reset."
      );

      this._queueRefresh();
    } catch (error) {
      console.error(
        `${LOG_PREFIX} Failed to reset speaking states.`,
        error
      );

      ui.notifications.error(
        getErrorMessage(error)
      );
    }
  }

  // #endregion


  // #region Refresh Action

  async _actionRefresh() {
    return this.render({
      force: true
    });
  }

  // #endregion


  // #region Relay State Subscription

  _ensureRelaySubscription() {
    if (
      this._unsubscribeRelayState
    ) {
      return;
    }

    this._unsubscribeRelayState =
      relayState.subscribe(
        () => {
          this._queueRefresh();
        }
      );
  }

  _removeRelaySubscription() {
    if (
      !this._unsubscribeRelayState
    ) {
      return;
    }

    this._unsubscribeRelayState();

    this._unsubscribeRelayState =
      null;
  }

  // #endregion

  // #region Host Setting Subscription

  _ensureSettingHook() {
    if (
      this._settingHookId !== null
    ) {
      return;
    }

    this._settingHookId =
      Hooks.on(
        "updateSetting",
        (setting) => {
          if (
            setting.key
            !== `${MODULE_ID}.relayHostUserId`
          ) {
            return;
          }

          this._queueRefresh();
        }
      );
  }

  _removeSettingHook() {
    if (
      this._settingHookId === null
    ) {
      return;
    }

    Hooks.off(
      "updateSetting",
      this._settingHookId
    );

    this._settingHookId =
      null;
  }

  // #endregion

// #region Periodic Status Refresh

_startRefreshTimer() {
  if (this._refreshTimer) {
    return;
  }

  this._refreshTimer =
    globalThis.setInterval(
      () => {
        if (!this.rendered) {
          return;
        }

        this._updateRelativeTimes();
      },
      UI_REFRESH_INTERVAL_MS
    );
}


_updateRelativeTimes() {
  if (!this.element) {
    return;
  }

  const elements =
    this.element.querySelectorAll(
      '[data-role="relative-time"]'
    );

  for (const element of elements) {
    const timestamp =
      Number(
        element.dataset.timestamp
      );

    element.textContent =
      formatAge(timestamp);
  }
}

_stopRefreshTimer() {
  if (!this._refreshTimer) {
    return;
  }

  globalThis.clearInterval(
    this._refreshTimer
  );

  this._refreshTimer =
    null;
}

_queueRefresh() {
  if (
    !this.rendered
    || this._refreshDebounceTimer
  ) {
    return;
  }

  const content =
    this.element?.querySelector(
      ".max-headroom-relay-controller__content"
    );

  const scrollTop =
    content?.scrollTop
    ?? 0;

  this._refreshDebounceTimer =
    globalThis.setTimeout(
      async () => {
        this._refreshDebounceTimer =
          null;

        if (!this.rendered) {
          return;
        }

        try {
          await this.render({
            force: true
          });

          const refreshedContent =
            this.element?.querySelector(
              ".max-headroom-relay-controller__content"
            );

          if (refreshedContent) {
            refreshedContent.scrollTop =
              scrollTop;
          }
        } catch (error) {
          console.error(
            `${LOG_PREFIX} Relay Controller refresh failed.`,
            error
          );
        }
      },
      STATE_REFRESH_DEBOUNCE_MS
    );
}


_clearQueuedRefresh() {
  if (!this._refreshDebounceTimer) {
    return;
  }

  globalThis.clearTimeout(
    this._refreshDebounceTimer
  );

  this._refreshDebounceTimer =
    null;
}

// #endregion

}

// #endregion

// #region Settings Menu Registration

export function registerRelayControllerMenu() {
  game.settings.registerMenu(
    MODULE_ID,
    RELAY_CONTROLLER_MENU_KEY,
    {
      name:
        "Discord Relay Controller",

      label:
        "Open Discord Relay Controller",

      hint:
        "Manage the GM-hosted Discord StreamKit relay, relay ownership, speaking state, and diagnostics.",

      icon:
        "fa-brands fa-discord",

      type:
        RelayControllerApp,

      restricted:
        true
    }
  );
}

// #endregion