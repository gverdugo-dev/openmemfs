# Deploy it

openmemfs is one container and one Postgres. Anything that runs both works. What we use and
recommend: **Google Cloud Run** for the container and **Supabase** for a free database.

[Add authentication](05-authentication.md) first: a deployed memory without it is open to anyone.

## 1. A free database on Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. In **Connect**, copy the **transaction pooler** connection string (port 6543). openmemfs works
   with it as it is.

## 2. The container on Cloud Run

With the [gcloud CLI](https://cloud.google.com/sdk/docs/install) and a Google Cloud project:

```bash
# Keep the connection string and your password in Secret Manager, not in the command line.
printf '%s' 'postgres://...:6543/postgres' | gcloud secrets create openmemfs-database-url --data-file=-
printf '%s' 'a long password' | gcloud secrets create openmemfs-password --data-file=-

# Build from this folder and deploy.
gcloud run deploy openmemfs --source . --region europe-west1 \
  --allow-unauthenticated \
  --set-env-vars ALLOWED_HOSTS=memory.example.com \
  --set-secrets DATABASE_URL=openmemfs-database-url:latest,OPENMEMFS_PASSWORD=openmemfs-password:latest
```

`--allow-unauthenticated` lets the internet reach the service; your password is what closes it.
`ALLOWED_HOSTS` lists the names the server answers to (your domain, and the `run.app` address
if you use it): `/api` and `/mcp` refuse any other. The compute service account needs the **Secret Manager Secret Accessor** role on both secrets.
Migrations run on the first request.

Cloud Run prints the address. Open it, then connect your agent to `<address>/mcp`
([Connect your agent](02-connect-your-agent.md)). For your own domain, map it in Cloud Run under
**Domain mappings**.

## Elsewhere

Fly.io, Railway, a VPS with Docker: build the `Dockerfile` and give it `DATABASE_URL` and
`ALLOWED_HOSTS`. Every
variable it reads is in `.env.example`.
