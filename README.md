## Reactive Discord Portraits

Max Headroom displays Discord voice activity directly inside Foundry VTT,
including multiple simultaneous speakers.

![Foundry VTT Max Headroom reactive Discord portrait demonstration](docs/media/max_headroom_demo.gif)

# Foundry VTT Max Headroom

Foundry VTT Max Headroom displays reactive Discord voice portraits directly inside Foundry VTT. Portraits can change when a Discord user speaks or mutes, giving the table a visual indication of voice activity without requiring OBS inside Foundry.

Foundry VTT Max Headroom is an independent community project and is not affiliated with or endorsed by Foundry Gaming LLC, Discord Inc., or Google.

## Requirements

Please note that Foundry VTT Max Headroom requires a couple additional steps of setup from the GM only in order to link Discord and Foundry communication. One component is the offical lightweight Discord Streamkit, though no actual streaming is involved. The other component is a small browser extension to allow the Discord Streamkit and Foundry to talk. This extension is small, simple, and verified by the Chrome Web Store. Please read on for more detailed setup.

Max Headroom requires:

- **Foundry VTT v14**
- **The Chrome Web Store-validated Max Headroom Companion extension** in a Chromium-based browser
- **Discord StreamKit**

Only the GM acting as the **Relay Host** needs the companion extension and StreamKit. Other Foundry users receive portrait state through Foundry and do not need to install the extension.

---

# 1. Authorize Discord StreamKit First

Do this before configuring Foundry. Only the GM will need to do this.

1. Open the Discord desktop application and sign in to the account you will use for the game.
2. Go to **https://streamkit.discord.com/overlay**.
3. Click **Install for OBS**. You do not need OBS; this is Discord's normal StreamKit authorization path.
4. When Discord asks for permission, **accept/authorize StreamKit Overlay**.
5. Switch to the **Voice Widget**.
6. Select the Discord server and **voice channel** used by your group.
7. Copy the **Voice Widget** overlay URL for later use in Foundry. You may open the **Voice Widget** URL in another tab now, or safe that for later.
8. You are free to close the Discord Overlay splash page that had the **Voice Widget** tab, but the final tab provided by the URL must remain open.

Verify the authorization in:

**Discord → User Settings → Connected Apps → Authorized Apps**

You should see **Streamkit Overlay**.

Once authorization is complete, Max Headroom uses the configured **Voice Widget** overlay, opened via URL, during play.

---

# 2. Install the Foundry Module

Repository:

**https://github.com/HetzenGN/Foundry-VTT-Max-Headroom**

Manifest URL:

**https://github.com/HetzenGN/Foundry-VTT-Max-Headroom/releases/latest/download/module.json**

In Foundry:

1. Open **Setup → Add-on Modules → Install Module**.
2. Paste the manifest URL above.
3. Install the module.
4. Launch your world.
5. Enable **Max Headroom** for that world.

Max Headroom targets **Foundry VTT v14 only**.

---

# 3. Install the Browser Companion

The GM who will act as Relay Host must install the Max Headroom Companion extension. Only the GM will need to do this.

Chrome Web Store:

**https://chromewebstore.google.com/detail/foundryvtt-max-headroom-r/eflhnldiekdfiaddmjmbodhkaabhgeno**

After installing it:

1. Open your Foundry world in the same Chromium-based browser.
2. Open the Max Headroom Companion extension popup.
3. Click **Pair Current Foundry Tab**.
4. Confirm the popup identifies the paired Foundry world and user.

If you later move to another Foundry tab, use **Re-pair Current Foundry Tab**. **Forget Pairing** clears the current session pairing.

---

# 4. Configure the StreamKit URL

Open **Configure Settings → Module Settings** in Foundry and find the Max Headroom settings. Only the GM will need to do this, though Users have some freedom to configure size and position.

Set **StreamKit Relay URL** to the Discord **Voice Widget** URL copied earlier. This URL identifies the Discord server and voice channel used by your group.

The Relay Controller's **Open StreamKit** button launches this configured URL.

You can also adjust portrait presentation settings such as:

- Portrait Bar Anchor
- Portrait Bar Orientation
- Portrait Tile Size
- Show User Names
- Speech Decay
- Speaking Animation

The defaults are suitable for initial testing.

---

# 5. Start the Discord Relay

Open the **Max Headroom Relay Controller** in Foundry. Its Setup section tracks four items:

- **Relay Host**
- **Browser Companion**
- **Discord StreamKit**
- **Reactive Portraits**

## Claim Relay Host

Click **Claim Relay Host**. Only one connected GM should own relay authority at a time. That GM receives companion activity and distributes the authoritative portrait state to other Foundry clients.

## Open StreamKit

Make sure the companion is paired, then:

1. Join the intended Discord voice channel.
2. Click **Open StreamKit** in the Relay Controller.
3. Leave the StreamKit Voice overlay open while playing.

The **Browser Companion** setup indicator does not turn green merely because the extension is installed. It turns green after Discord StreamKit is open and companion relay activity actually reaches Foundry.

Once traffic is flowing, the Relay Controller should begin showing detected Discord users and recent relay activity.

---

# 6. Configure Reactive Portraits

In the Relay Controller, find **Reactive Portraits** and click **Configure**.

Foundry Users appear in collapsible rows. Each row shows the Foundry User and an **Enabled** checkbox. Expand a user to configure mapping, portrait name, images, and sort order.

## Enable and Map a User

Check **Enabled** for each Foundry User who should appear in the portrait bar. Disabled users do not count against setup completeness.

Open the **Discord User** dropdown. With StreamKit authorized and running, users currently detected in voice should appear under **Detected in Voice**. Select the Discord account belonging to that Foundry User.

A **Manual Discord ID** field remains available as an advanced fallback, but normal setup should not require it.

## Choose the Portrait Name

Each user can display:

- **Player** — the Foundry User name
- **Player Character** — the character currently assigned in Foundry User Configuration
- **Custom** — text entered in Custom Name

When **Player Character** is selected, changing that user's assigned Foundry character automatically changes the portrait name.

## Choose Reactive Images

Each enabled user can have:

- **Idle Image**
- **Talking Image**
- **Muted Image**

These are independent from Actor portraits, Tokens, character artwork, and Foundry User avatars.

For animated portraits that activate a speaking loop the animations must be in .webp format only. For reactive, but static images, any of the normal Foundry image formats should work.

Use the folder button to select artwork. Use the clear button to remove an image and return that field to its default behavior. Talking can fall back to Idle when no separate Talking image is configured; Muted is optional.

Use **Sort Order** to control portrait order, then click **Save Configuration**.

---

# 7. Test the Setup

A basic test sequence:

1. Confirm this GM is the Relay Host.
2. Confirm the Browser Companion is connected.
3. Confirm StreamKit is open.
4. Join the configured Discord voice channel.
5. Confirm Discord users appear in Configure Reactive Portraits.
6. Speak and verify the mapped portrait changes to Talking.
7. Stop speaking and verify it returns to Idle after speech decay.
8. Mute and verify the Muted state.
9. Test two users speaking at the same time.

Other Foundry users should see the same portrait activity without running their own StreamKit overlay or companion extension.

---

# Troubleshooting

## Browser Companion does not turn green

Check that the extension is installed, the current Foundry tab is paired, this GM is Relay Host, and StreamKit is open. Installing the extension alone is not enough; Foundry must receive StreamKit relay activity.

## Speaking works, but Discord names do not appear

Check:

**Discord → User Settings → Connected Apps → Authorized Apps**

Make sure **Streamkit Overlay** is present. If it is missing:

1. Return to **https://streamkit.discord.com/overlay**.
2. Click **Install for OBS**.
3. Accept the authorization prompt.
4. Reopen the configured StreamKit overlay.
5. In **Configure Reactive Portraits**, click **Refresh Discord List**.

Manual ID mapping can still work when friendly-name discovery is unavailable, so speaking alone does not prove StreamKit authorization is complete.

## No Discord users are detected

Confirm the Relay Host is in the voice channel selected for the StreamKit Voice Widget and that **StreamKit Relay URL** points to that voice overlay. Reopen StreamKit, then use **Refresh Discord List**.

## Another GM owns the relay

Only one GM should be Relay Host. Continue using that GM or have them release the host before another GM claims it.

## A portrait does not appear

Confirm the Foundry User is **Enabled**, mapped to the correct Discord user, has an Idle image selected, and the configuration was saved.

---

# Privacy

Max Headroom does **not** record Discord voice audio and does not read Discord text-message contents. It uses the information needed for reactive portraits, such as Discord user IDs, usernames or server nicknames, voice-channel presence, speaking state, mute state, and relay health.

Persistent portrait mappings remain in the Foundry world.

---

# Quick Setup Checklist

- [ ] Discord desktop app is running
- [ ] StreamKit Overlay authorized through **Install for OBS**
- [ ] **Streamkit Overlay** appears under Discord Authorized Apps
- [ ] Voice Widget configured for the correct server/channel
- [ ] Foundry VTT Max Headroom installed and enabled
- [ ] Max Headroom Companion installed from the Chrome Web Store
- [ ] Current Foundry tab paired
- [ ] StreamKit Relay URL set to the Voice Widget URL
- [ ] GM has claimed Relay Host
- [ ] StreamKit Voice overlay is open
- [ ] Discord users are detected
- [ ] Enabled Foundry Users are mapped
- [ ] Reactive images are configured
- [ ] Speaking and mute behavior tested

Once setup is complete, normal use is simple: keep the Relay Host's Foundry tab, paired companion, Discord desktop client, and StreamKit Voice overlay running. Reactive portraits will update automatically during play.
