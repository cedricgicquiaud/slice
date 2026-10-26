CREATE TYPE "public"."call_result" AS ENUM('succeeded', 'failed', 'api_unreachable', 'invalid_request', 'not_available', 'slice_error');--> statement-breakpoint
CREATE TYPE "public"."http_method" AS ENUM('GET', 'POST', 'PUT', 'PATCH', 'DELETE');--> statement-breakpoint
CREATE TYPE "public"."upstream_auth_type" AS ENUM('none', 'apiKey', 'bearer', 'oauth2');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connector_actions" (
	"connector_id" text NOT NULL,
	"version" integer NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"label" text NOT NULL,
	"description" text NOT NULL,
	"method" "http_method" NOT NULL,
	"path" text NOT NULL,
	"params" jsonb NOT NULL,
	CONSTRAINT "connector_actions_connector_id_version_position_pk" PRIMARY KEY("connector_id","version","position")
);
--> statement-breakpoint
CREATE TABLE "connector_api_actions" (
	"connector_id" text NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"label" text NOT NULL,
	"group_name" text NOT NULL,
	"description" text,
	"deprecated" boolean NOT NULL,
	"method" "http_method" NOT NULL,
	"path" text NOT NULL,
	"params" jsonb NOT NULL,
	CONSTRAINT "connector_api_actions_connector_id_position_pk" PRIMARY KEY("connector_id","position")
);
--> statement-breakpoint
CREATE TABLE "connector_calls" (
	"connector_id" text NOT NULL,
	"version" integer NOT NULL,
	"action" text NOT NULL,
	"called_at" timestamp with time zone NOT NULL,
	"result" "call_result" NOT NULL,
	"status" integer,
	"duration_ms" integer NOT NULL,
	CONSTRAINT "connector_calls_status_iff_failed" CHECK (("connector_calls"."result" = 'failed') = ("connector_calls"."status" is not null))
);
--> statement-breakpoint
CREATE TABLE "connector_versions" (
	"connector_id" text NOT NULL,
	"number" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"active_since" timestamp with time zone,
	CONSTRAINT "connector_versions_connector_id_number_pk" PRIMARY KEY("connector_id","number")
);
--> statement-breakpoint
CREATE TABLE "connectors" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"base_url" text NOT NULL,
	"upstream_auth_type" "upstream_auth_type" NOT NULL,
	"upstream_header_name" text,
	"upstream_token_url" text,
	"upstream_scopes" text[],
	"created_at" timestamp with time zone NOT NULL,
	"workspace_id" text NOT NULL,
	"api_name" text,
	CONSTRAINT "connectors_header_name_iff_api_key" CHECK (("connectors"."upstream_auth_type" = 'apiKey') = ("connectors"."upstream_header_name" is not null)),
	CONSTRAINT "connectors_token_url_iff_oauth2" CHECK (("connectors"."upstream_auth_type" = 'oauth2') = ("connectors"."upstream_token_url" is not null))
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "workspaces_owner_id_unique" UNIQUE("owner_id")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_actions" ADD CONSTRAINT "connector_actions_version_fk" FOREIGN KEY ("connector_id","version") REFERENCES "public"."connector_versions"("connector_id","number") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_api_actions" ADD CONSTRAINT "connector_api_actions_connector_id_connectors_id_fk" FOREIGN KEY ("connector_id") REFERENCES "public"."connectors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_calls" ADD CONSTRAINT "connector_calls_version_fk" FOREIGN KEY ("connector_id","version") REFERENCES "public"."connector_versions"("connector_id","number") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_versions" ADD CONSTRAINT "connector_versions_connector_id_connectors_id_fk" FOREIGN KEY ("connector_id") REFERENCES "public"."connectors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connectors" ADD CONSTRAINT "connectors_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "connector_calls_connector_called_at_idx" ON "connector_calls" USING btree ("connector_id","called_at");--> statement-breakpoint
CREATE UNIQUE INDEX "connector_versions_one_active_idx" ON "connector_versions" USING btree ("connector_id") WHERE "connector_versions"."active_since" is not null;--> statement-breakpoint
CREATE INDEX "connectors_created_at_idx" ON "connectors" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");