CREATE TYPE "public"."http_method" AS ENUM('GET', 'POST', 'PUT', 'PATCH', 'DELETE');--> statement-breakpoint
CREATE TYPE "public"."upstream_auth_type" AS ENUM('none', 'apiKey', 'bearer', 'oauth2');--> statement-breakpoint
CREATE TABLE "connector_actions" (
	"connector_id" text NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"method" "http_method" NOT NULL,
	"path" text NOT NULL,
	"params" jsonb NOT NULL,
	CONSTRAINT "connector_actions_connector_id_position_pk" PRIMARY KEY("connector_id","position")
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
	CONSTRAINT "connectors_header_name_iff_api_key" CHECK (("connectors"."upstream_auth_type" = 'apiKey') = ("connectors"."upstream_header_name" is not null)),
	CONSTRAINT "connectors_token_url_iff_oauth2" CHECK (("connectors"."upstream_auth_type" = 'oauth2') = ("connectors"."upstream_token_url" is not null))
);
--> statement-breakpoint
ALTER TABLE "connector_actions" ADD CONSTRAINT "connector_actions_connector_id_connectors_id_fk" FOREIGN KEY ("connector_id") REFERENCES "public"."connectors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "connectors_created_at_idx" ON "connectors" USING btree ("created_at");