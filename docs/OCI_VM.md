# OCI ARM64 VM setup

Use one VM.Standard.A1.Flex in the tenancy's home region with the Always Free eligibility indicator. Start with **2 OCPUs, 6 GiB RAM and a 50 GB boot volume**, subject to available capacity, total tenancy usage, and the console's cost estimate. Select Ubuntu 24.04 LTS **ARM64**. A1 capacity is regional, and Oracle may reclaim idle free instances. Keep encrypted backups outside this VM. Stop at unavailable free capacity and obtain approval for any paid alternative. [Oracle Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)

## Network and access

- Attach the VM to a public subnet with an internet gateway and a public IP. Point a dedicated DNS A record such as api.staging.example.com at the VM. Publish an AAAA record only when IPv6 has been configured and checked.
- In the OCI security list or NSG, allow TCP 22 from the administrator's CIDR alone. Allow TCP 80 and 443 for Caddy and ACME. Keep TCP 8000, 8080 and PostgreSQL ports closed. Allow outbound DNS, HTTPS to the inference providers, Tavily and ACME, and TLS PostgreSQL traffic to the isolated Neon branch.
- Install an SSH public key at provisioning. Use the Ubuntu user over key-based SSH. Keep the host firewall consistent with the OCI rules. Docker can install its own packet filtering rules, so the OCI boundary and Compose port bindings matter independently.
- Install Docker Engine and the Docker Compose plugin using Docker's Ubuntu APT instructions. Verify `uname -m` reports `aarch64`, `docker version` works, and `docker compose version` is at least 2.33.1 for raw environment files and gateway priority. Enable Docker at boot with `sudo systemctl enable --now docker`. Treat Docker administration as root-equivalent. [Docker installation on Ubuntu](https://docs.docker.com/engine/install/ubuntu/)

## Stage and start

Deploy a reviewed revision containing the `deploy/` directory. Start with the included Gemini route and Python benchmark agent. Prepare the secrets on the VM from their approved stores.

```bash
umask 077
install -d -m 700 deploy/secrets
install -m 600 deploy/examples/api.env.example deploy/secrets/api.env
install -m 600 deploy/examples/bifrost.env.example deploy/secrets/bifrost.env
install -m 600 deploy/examples/vm.env.example deploy/vm.env
# Fill the three files securely before starting.
docker compose --env-file deploy/vm.env -f deploy/compose.yaml config -q
docker compose --env-file deploy/vm.env -f deploy/compose.yaml up --build -d --wait
docker compose --env-file deploy/vm.env -f deploy/compose.yaml ps
```

Populate Bifrost secrets using the [migration guide](BIFROST_MIGRATION.md). Set the API's Neon staging DSN, Tavily credentials, matching Bifrost virtual key, and operator token. Caddy automatically obtains and renews HTTPS; its certificate and account state live in Docker volumes. Only Caddy publishes host ports. The API's readiness and gateway health probes run inside their containers. [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https)

## Operate and recover

Use `docker compose ps`, `docker stats --no-stream`, `df -h`, and `docker system df` to inspect container memory, CPU and disk. Track boot-volume growth, container restarts, SQLite log retention and gateway failures. Cap resources at 512 MiB/.5 CPU for Benchify, 768 MiB/1 CPU for Bifrost and 128 MiB/.25 CPU for Caddy. These caps leave OS headroom on the proposed shape; revisit after real staging traffic. Log rotation is configured for container logs. Back up Bifrost data separately from Neon and preserve Caddy volumes across upgrades.

Compose uses unless-stopped restart policies. Restart policies trigger on process exit. An unhealthy but still-running process needs monitoring and operator follow-up. Disable incoming submissions and drain work before updates. Gracefully stop the API before stopping Bifrost. A hard VM stop can leave an active lease that Benchify recovers after expiry. Keep a boot-volume replacement procedure and run the [Neon restore drill](DEPLOYMENT.md) on a disposable branch.

## Local verification

Build the ARM64 application image and run the disposable stack with synthetic inference and local PostgreSQL. Install the backend development dependencies first so the smoke runner can use HTTPX.

```bash
docker buildx build --platform linux/arm64 --load -t benchify-api:arm64 backend
python deploy/smoke_arm64.py
```

Set BENCHIFY_SMOKE_EMULATED=1 if running the ARM64 stack under emulation on an x86 host. It raises the test health deadline and CPU allowance. The smoke runner uses a private synthetic provider, temporary credentials, local TLS, and uniquely named disposable containers and volumes. It exercises virtual-key inference, anonymous denial, the queue with Bifrost stopped, recording and replay, and inference recovery after gateway restart. Run the separate staging checklist with production resource limits, a public certificate, Neon, Gemini and Tavily before linking Vercel.

The Benchify ARM64 image built successfully and passed its readiness probe with disposable PostgreSQL. The pinned Bifrost image includes an ARM64 build. On Docker Desktop under emulation, Bifrost reached model-catalog initialization but did not pass health within the smoke window. The AMD64 stack passed the disposable smoke with synthetic Gemini. Repeat the complete smoke on native ARM64 before connecting Vercel. The starting VM size is a staging estimate, and native resource use remains unmeasured.
