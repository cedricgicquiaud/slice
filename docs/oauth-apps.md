# Google and Microsoft sign-in applications

"Continue with Google" and "Continue with Microsoft" work only once SLICE is declared as an application with each
provider. This page walks through both declarations, for the local address first (`http://localhost:5173`, what
`pnpm dev` serves), then for a public address.

Each declaration gives two values, an ID and a secret, that go into `.env` at the repository root. `.env` is never
committed (`.gitignore`); `.env.example` lists the variables without values. `pnpm dev` reads `.env` at startup:
restart it after a change. A provider whose ID or secret is missing is simply not offered by the server.

Start with:

```bash
cp .env.example .env
```

and set, in `.env`:

```bash
BETTER_AUTH_URL=http://localhost:5173
```

The providers send the person back to an address built from `BETTER_AUTH_URL`. It must be the address the browser
uses (Vite on port 5173, which forwards `/api` to the server), not the server's own port 3001.

The return addresses to declare, exactly as written:

| Provider | Return address (local) |
|---|---|
| Google | `http://localhost:5173/api/auth/callback/google` |
| Microsoft | `http://localhost:5173/api/auth/callback/microsoft` |

## Google

You need a Google account. Nothing is paid and no review by Google is needed: SLICE only asks for the name, the
email address and the fact that Google verified it (`openid`, `email`, `profile`).

1. Open [console.cloud.google.com](https://console.cloud.google.com) and create a project named `SLICE` (project
   picker at the top, then **New project**).
2. In the menu, open **APIs & Services → OAuth consent screen** (the console may call it **Google Auth Platform**)
   and click **Get started**.
   - **App information**: app name `SLICE`, your email address as support email.
   - **Audience**: **External**.
   - **Contact information**: your email address.
   - Accept the policy and click **Create**.
3. In **Audience**, the app starts in **Testing**: only the addresses listed under **Test users** can sign in. Add
   yours. Click **Publish app** when anyone should be able to sign in; with only the basic scopes above, Google
   asks for no verification.
4. In **Clients**, click **Create client**.
   - **Application type**: **Web application**; name: `SLICE local`.
   - **Authorized JavaScript origins**: `http://localhost:5173`.
   - **Authorized redirect URIs**: `http://localhost:5173/api/auth/callback/google`.
   - Click **Create**.
5. Copy the two values shown into `.env`:

   ```bash
   GOOGLE_CLIENT_ID=<Client ID>
   GOOGLE_CLIENT_SECRET=<Client secret>
   ```

   The secret stays readable later in the client's page, under **Client secrets**.

## Microsoft

You need a Microsoft account (personal or work). The application accepts both kinds of accounts: SLICE signs in
through Microsoft's `common` address, which serves personal and work or school accounts alike.

1. Open [entra.microsoft.com](https://entra.microsoft.com) (or the Azure portal) and go to
   **Applications → App registrations → New registration**.
   - **Name**: `SLICE`.
   - **Supported account types**: **Accounts in any organizational directory and personal Microsoft accounts**.
     Any other choice refuses one of the two kinds of accounts.
   - **Redirect URI**: platform **Web**, address `http://localhost:5173/api/auth/callback/microsoft`.
   - Click **Register**.
2. On the application's **Overview**, copy **Application (client) ID** into `.env`:

   ```bash
   MICROSOFT_CLIENT_ID=<Application (client) ID>
   ```

3. In **Certificates & secrets → Client secrets**, click **New client secret**, pick an expiry (24 months at most),
   then copy the **Value** column (not **Secret ID**) into `.env`. Microsoft shows it only once.

   ```bash
   MICROSOFT_CLIENT_SECRET=<Value>
   ```

   Note the expiry date: past it, Microsoft sign-in stops until a new secret replaces this one.
4. In **Token configuration**, click **Add optional claim**, choose **ID**, tick `email`, `verified_primary_email`
   and `verified_secondary_email`, then **Add** (accept the Microsoft Graph permission it offers to turn on).
   SLICE refuses an address the provider does not vouch for (see below); these claims are how Microsoft vouches.
5. **API permissions** already holds `User.Read`; nothing else is needed.

## Check

Run `pnpm dev`, open `http://localhost:5173`, and click **Continue with Google**, then **Continue with Microsoft**.
After the provider's screens, SLICE opens on its home page, signed in. Signing in with Google and with Microsoft
under the same email address leads to the same account.

## When the provider does not vouch for the address

SLICE only trusts an email address the provider states as verified. Otherwise, sign-in is refused and the screen says
"Your Google or Microsoft account didn't confirm this email address. Get a code by email instead." Nothing is
created on SLICE's side. Google states it for every Gmail address and for Google Workspace accounts. Microsoft states
it through the optional claims of step 4: without them, every Microsoft sign-in is refused this way.

## Going online

For the public address (say `https://slice.example.com`), keep the local declarations and add:

- Google: in the same client, the origin `https://slice.example.com` and the redirect URI
  `https://slice.example.com/api/auth/callback/google`.
- Microsoft: in **Authentication**, the redirect URI `https://slice.example.com/api/auth/callback/microsoft`.

On the server, set `BETTER_AUTH_URL=https://slice.example.com` and the four values above in the platform's secret
settings, never in the repository. The production server does not read `.env`.

## Troubleshooting

- **`redirect_uri_mismatch` (Google) or `AADSTS50011` (Microsoft)**: the return address SLICE sends differs from the
  declared one. Check `BETTER_AUTH_URL` (no trailing slash, right port) and the declared address, character for
  character.
- **"Access blocked: SLICE has not completed the Google verification process"**: the Google app is in **Testing** and
  the address is not among its test users.
- **`AADSTS700016` (Microsoft)**: `MICROSOFT_CLIENT_ID` does not match the application, or the application does not
  accept this kind of account (step 1, **Supported account types**).
- **`AADSTS7000215` (Microsoft)**: the secret is wrong or expired; copy the **Value** of a new one.
