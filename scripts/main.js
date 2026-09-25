// scripts/main.js

// #region Imports

import {
  MODULE_ID,
  PROTOCOL_VERSION
} from "../shared/protocol.js";

import {
  registerSettings,
  isPortraitRenderSettingKey
} from "./settings.js";

import {
  registerPortraitPreferencesMenu
} from "./portraits/portrait-preferences-app.js";

import {
  portraitBar
} from "./portraits/portrait-bar.js";

import {
  portraitDebugApi
} from "./portraits/portrait-debug.js";

import {
  registerPortraitConfigMenu
} from "./portraits/portrait-config-app.js";

import {
  relayController
} from "./relay/relay-controller.js";

import {
  registerRelayControllerMenu
} from "./relay/relay-controller-app.js";

import {
  relayDebugApi
} from "./relay/relay-debug.js";

import {
  socketService
} from "./relay/socket-service.js";

// #endregion


// #region Constants

const LOG_PREFIX = "[VoiceReactivePortraitsBar]";

const WELCOME_MESSAGE = `
  <p>
    <strong>Welcome to Voice Reactive Portraits Bar!</strong>
  </p>

  <p>
    Please note that this module requires a couple of additional setup
    steps from the GM only.
  </p>

  <p>
    Please visit
    <a
      href="https://github.com/HetzenGN/Voice-Reactive-Portraits-Bar"
      target="_blank"
      rel="noopener noreferrer"
    >
      Voice Reactive Portraits Bar on GitHub
    </a>
    for the setup tutorial, feedback, or discussion.
  </p>

  <p>
    I'd love to see your art in action! Feel free to send screenshots
    to me on Discord at <strong>.hetzen</strong>. Please mention
    <strong>Voice Reactive Portraits Bar</strong> in your message.
  </p>
`;



// #endregion

async function postWelcomeMessage() {
  if (!game.user?.isActiveGM) {
    return;
  }

  await ChatMessage.create({
    content:
      WELCOME_MESSAGE,

    speaker:
      ChatMessage.getSpeaker({
        alias: "Voice Reactive Portraits Bar"
      }),

    style:
      CONST.CHAT_MESSAGE_STYLES.OOC
  });
}

// #region Public Module API

const moduleApi = {
  MODULE_ID,
  PROTOCOL_VERSION,

  receiveExtensionRelayHealth(
    payload
  ) {
    return relayController
      .receiveExtensionRelayHealth(
        payload
      );
  },

  receiveExtensionSpeakingEvent(
    payload
  ) {
    return relayController
      .receiveExtensionSpeakingEvent(
        payload
      );
  },

  receiveExtensionDiscordUserEvent(
  payload
) {
  return relayController
    .receiveExtensionDiscordUserEvent(
      payload
    );
},


getDiscoveredDiscordUsers() {
  return relayController
    .getDiscoveredDiscordUsers();
},

  ...portraitDebugApi,
  ...relayDebugApi
};

// #endregion

// #region Foundry Hooks

Hooks.once("init", () => {
  console.log(
    `${LOG_PREFIX} Initializing`
  );

  // #region Register Settings

  registerSettings();

  registerPortraitConfigMenu();
  registerPortraitPreferencesMenu();
  registerRelayControllerMenu();

  // #endregion

  // #region Register Public API

  const module =
    game.modules.get(MODULE_ID);

  if (!module) {
    console.error(
      `${LOG_PREFIX} Unable to locate module package "${MODULE_ID}".`
    );

    return;
  }

  module.api = moduleApi;

  // #endregion

  console.log(
    `${LOG_PREFIX} Protocol v${PROTOCOL_VERSION} initialized`
  );
});


Hooks.once("ready", async () => {
  console.log(
    `${LOG_PREFIX} Ready`
  );

  // #region Initialize Relay Controller

try {
  relayController.initialize();

  console.log(
    `${LOG_PREFIX} Relay Controller initialized`
  );
} catch (error) {
  console.error(
    `${LOG_PREFIX} Failed to initialize Relay Controller.`,
    error
  );
}

// #endregion

  // #region Initialize Portrait Bar

  try {
    await portraitBar.render({
      force: true
    });

    console.log(
      `${LOG_PREFIX} Reactive Portrait Bar initialized`
    );
  } catch (error) {
    console.error(
      `${LOG_PREFIX} Failed to initialize Reactive Portrait Bar.`,
      error
    );
  }

  try {
    await postWelcomeMessage();
  } catch (error) {
    console.error(
      `${LOG_PREFIX} Failed to post welcome message.`,
      error
    );
  }

  // #endregion

  // #region Portrait Presentation Setting Updates

Hooks.on(
  "updateSetting",
  (setting) => {
    if (
      !isPortraitRenderSettingKey(
        setting.key
      )
    ) {
      return;
    }

    portraitBar
      .refresh()
      .catch(
        (error) => {
          console.error(
            `${LOG_PREFIX} Failed to refresh Portrait Bar after a presentation setting changed.`,
            error
          );
        }
      );
  }
);

// #endregion

// #region Foundry User Character Updates

Hooks.on(
  "updateUser",
  (_user, changes) => {
    if (
      !Object.hasOwn(
        changes,
        "character"
      )
    ) {
      return;
    }


    portraitBar
      .refresh()
      .catch(
        (error) => {
          console.error(
            `${LOG_PREFIX} Failed to refresh Portrait Bar after a Player Character changed.`,
            error
          );
        }
      );
  }
);

// #endregion
  
// #region Request Initial State Sync

try {
  if (!socketService.isAuthoritative()) {
    socketService.requestFullSync();
  }
} catch (error) {
  console.error(
    `${LOG_PREFIX} Failed to request initial portrait state synchronization.`,
    error
  );
}

// #endregion

});

// #endregion