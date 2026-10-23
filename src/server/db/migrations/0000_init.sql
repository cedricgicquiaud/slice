CREATE TYPE "public"."http_method" AS ENUM('GET', 'POST', 'PUT', 'PATCH', 'DELETE');--> statement-breakpoint
CREATE TYPE "public"."upstream_auth_type" AS ENUM('none', 'apiKey', 'bearer', 'oauth2');--> statement-breakpoint
CREATE TABLE "connector_actions" (
	"connector_id" text NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"method" "http_method" NOT NULL,
	"path" text NOT NULL,
	"params" jsonb NOT NULL
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
	"created_at" timestamp with time zone NOT NULL
);
