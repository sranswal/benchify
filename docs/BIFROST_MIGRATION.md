# Migrate the local Bifrost gateway

## Local audit

The Windows NPX cache contains the Maxim Bifrost launcher and the downloaded Bifrost HTTP binary under `%LOCALAPPDATA%\bifrost\v2.5.1\bin`. The app uses loopback port 8080 and the OpenAI compatibility path. There was no active listener during this audit. Existing SQLite stores are `%APPDATA%\bifrost\config.db` and `logs.db`. Access them as sensitive files and keep them out of Git.

The SQLite inventory showed one enabled Gemini provider key stored as plaintext, one virtual key, enforced inference authentication, and no routing rules or recorded server-side fallback. The route is `gemini/gemini-3.1-flash-lite`. Logging was enabled with content logging and 365-day retention. The logs contain 104 successes and eight errors for that model, and metadata is available for Benchify correlation. No configured encryption key was found in the inspected Benchify environment. The audit could not verify a live dashboard login against the stopped Windows gateway.

## Rebuild the configuration securely

The preferred migration recreates the audited route in a fresh volume using the checked-in [Bifrost config](../deploy/bifrost.config.json). It references environment secrets, enforces admin auth and virtual-key inference, enables encryption, disables raw content logging, and retains log metadata for seven days. It scopes the Benchify virtual key to the Gemini model. Historical logs do not need to move to the server.

1. In the VM secret store create an independent high-entropy stable encryption key and setup token, each at least 32 characters. Set the admin username and a strong password. Generate the virtual key as `sk-bf-` plus a cryptographically random value. Use a new scoped Gemini provider key. Put only the matching virtual key into the Benchify API secret file. Preserve the encryption key separately from backups.
2. Start the Compose deployment with v2.5.1 and verify it from inside the API container. Ensure requests without a virtual key fail and that the real scoped model succeeds. Check that anonymous gateway management routes reject access. Verify authorized dashboard login before relying on it operationally.
3. To use the dashboard, open an SSH local port forward to the gateway container's address on the host-reachable provider-egress bridge. Get the address using `docker inspect` on the Bifrost container and select `benchify-vm_provider-egress`. Use `ssh -N -L 127.0.0.1:18080:<gateway-container-ip>:8080 ubuntu@<vm>`. Open http://127.0.0.1:18080 and sign in. Repeat discovery after recreating the gateway. Never route the gateway through Caddy or Vercel.
4. Archive the Windows config and logs separately if needed. Take a SQLite backup while the gateway is stopped or use SQLite's online backup API. Include WAL state through the backup API or a consistently stopped copy. For a legacy DB import, work on an isolated copy, match the source image and its encryption key if configured, and reconcile file configuration precedence. Cleanly reissue credentials in the new environment. The legacy files contain plaintext credentials and previous request material.

[Official deployment requirements](https://docs.getbifrost.ai/deployment-guides/runtime-contract) · [Authentication and governance](https://docs.getbifrost.ai/deployment-guides/config-json/governance) · [Provider configuration](https://docs.getbifrost.ai/deployment-guides/config-json/providers)

## Backups, upgrades and rotation

Stop API submissions, stop the Benchify API, then stop Bifrost. Archive the stopped `/app/data` volume with a root-only umask and encrypt the archive before transferring it off the VM. Save the exact image digest, config revision, and secret version identifiers with the backup. Preserve the encryption secret in the secret manager. Restore into a new volume and run health, unauthorized denial, authorized inference and dashboard checks. Keep config and log tables blocked from public access.

For upgrades, preserve the current pinned image and a pre-upgrade copy of the volume. Test the replacement version against a disposable clone. Roll back using the earlier image and its matching database snapshot if the new version migrated the SQLite schema. Never downgrade in place against an upgraded store without validating schema compatibility. Rotate provider, virtual and admin secrets through the VM secret store and verify configuration reconciliation. Treat encryption-key rotation as a documented re-encryption migration or fresh-store cutover. Keep the earlier key until restore and rollback tests pass.

Correlate using Benchify's workflow and client-request IDs and the Bifrost log dimensions. Gateway responses may omit their own request ID. Review recorded routing, retries, status and latency before attributing a 503. Keep provider content and credentials out of incident notes.
