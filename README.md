# Indus API

A small server (one file, no dependencies) that makes Indus Client's shared features work for everyone:

- **Shared cosmetics**: Indus players see each other's capes, wings, hats, claws, boots, pets and auras.
- **Indus emblem**: the Indus logo in front of Indus players' names (name tags, Tab list and chat).
- **Buying cosmetics**: premium cosmetics unlock only for players you give them to.
- **Link Discord**: players who link Discord and join your Discord server get the Indus cape for free.
- **Friends** (Microsoft accounts): friend requests, and who is online.
- **Skin changer**: custom skins of offline accounts are shown to other Indus players.
- **Partners**: the list on the launcher's Partners page (only you can edit it).

Until it runs and the launcher points at it, Indus Client works in **offline mode**: every cosmetic is
unlocked, only you see your own emblem and cosmetics, and Friends / Partners / Link Discord are hidden.

## 1. Run it

Any host with Node.js 18+ and a disk that keeps files works (a small VPS, or a Node hosting plan with
persistent storage). Everything is saved in `data.json` next to the script, so keep that file when you
move or update the server.

```bash
PUBLIC_URL=https://api.yourdomain.com ADMIN_KEY=pick-a-long-secret PORT=8787 node indus-api.js
```

Put it behind HTTPS (for example `https://api.yourdomain.com`). `PUBLIC_URL` must be that address.

## 2. Discord link (free Indus cape)

1. Open <https://discord.com/developers/applications>, create an application (for example "Indus Client").
2. In **OAuth2**, copy the **Client ID** and **Client Secret**, and add this redirect:
   `https://api.yourdomain.com/v1/discord/callback`
3. In Discord, turn on Developer Mode (Settings → Advanced), right-click your server → **Copy Server ID**.
4. Start the server with:

```bash
DISCORD_CLIENT_ID=... DISCORD_CLIENT_SECRET=... DISCORD_GUILD_ID=... (plus the settings above) node indus-api.js
```

Players press **Link Discord** in the launcher's Wardrobe, sign in to Discord, and the Indus cape unlocks if
they are in your server. No bot is needed.

## 3. Point Indus Client at it

In `src/main/config.ts` set:

```ts
const HOSTED_API = 'https://api.yourdomain.com';
```

Then say **Publish**. Every installed launcher updates and starts using it.

## 4. Manage Partners (launcher)

In the launcher open **Settings → Indus Client → Owner key**, paste your `ADMIN_KEY` and press Save.
The Partners page then shows **+ Add partner** and **Edit** buttons. The key is stored encrypted on your PC
only; nobody else can edit the list.

## 5. Give a player a cosmetic (after they pay on Discord)

The player must have opened Indus Client at least once (so their name is known), or use their UUID.

```bash
curl -X POST https://api.yourdomain.com/v1/admin/grant \
  -H "x-admin-key: pick-a-long-secret" -H "Content-Type: application/json" \
  -d '{"player":"PlayerName","item":"cape:flow"}'
```

`item` is one of the ids in `catalog.json` (for example `cape:kitty`, `wings:void_dragon`, `claws:void`),
or `"all"` to give everything. Use `/v1/admin/revoke` the same way to take one away.
The player's game picks it up within 5 minutes (the launcher right away).
