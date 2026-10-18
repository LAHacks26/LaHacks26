CREATE TYPE "public"."chat_role" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"saved_recipe_id" uuid NOT NULL,
	"role" "chat_role" NOT NULL,
	"content" text NOT NULL,
	"context_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source_recipe_id" uuid,
	"forked_from_id" uuid,
	"title" text NOT NULL,
	"recipe" jsonb NOT NULL,
	"undo_stack" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ready_by" timestamp with time zone,
	"share_slug" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_recipes_share_slug_unique" UNIQUE("share_slug")
);
--> statement-breakpoint
CREATE TABLE "searches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"query" text NOT NULL,
	"parsed" jsonb,
	"browser_use_task_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"url" text NOT NULL,
	"site" text NOT NULL,
	"title" text NOT NULL,
	"image_url" text,
	"total_min" integer NOT NULL,
	"allergens" text[] DEFAULT '{}' NOT NULL,
	"recipe" jsonb NOT NULL,
	"embedding" vector(768),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_recipes_url_unique" UNIQUE("url")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"google_sub" text NOT NULL,
	"email" text,
	"name" text,
	"image" text,
	"allergies" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_google_sub_unique" UNIQUE("google_sub")
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_saved_recipe_id_saved_recipes_id_fk" FOREIGN KEY ("saved_recipe_id") REFERENCES "public"."saved_recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_recipes" ADD CONSTRAINT "saved_recipes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_recipes" ADD CONSTRAINT "saved_recipes_source_recipe_id_source_recipes_id_fk" FOREIGN KEY ("source_recipe_id") REFERENCES "public"."source_recipes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_recipes" ADD CONSTRAINT "saved_recipes_forked_from_id_saved_recipes_id_fk" FOREIGN KEY ("forked_from_id") REFERENCES "public"."saved_recipes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_messages_saved_recipe_id_idx" ON "chat_messages" USING btree ("saved_recipe_id");--> statement-breakpoint
CREATE INDEX "saved_recipes_user_id_idx" ON "saved_recipes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "source_recipes_embedding_idx" ON "source_recipes" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "source_recipes_total_min_idx" ON "source_recipes" USING btree ("total_min");