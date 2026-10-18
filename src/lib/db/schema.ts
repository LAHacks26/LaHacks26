import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import type { LineRef, Recipe } from "../recipe/schema";

// Tables follow PRD section 8.2. Column names are snake_case in SQL.

export const chatRoleEnum = pgEnum("chat_role", ["user", "assistant"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  googleSub: text("google_sub").notNull().unique(),
  email: text("email"),
  name: text("name"),
  image: text("image"),
  allergies: text("allergies").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Global cache of public web recipes (not user edits).
export const sourceRecipes = pgTable(
  "source_recipes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    url: text("url").notNull().unique(),
    site: text("site").notNull(),
    title: text("title").notNull(),
    imageUrl: text("image_url"),
    totalMin: integer("total_min").notNull(),
    allergens: text("allergens").array().notNull().default([]),
    recipe: jsonb("recipe").$type<Recipe>().notNull(),
    embedding: vector("embedding", { dimensions: 768 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("source_recipes_embedding_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
    index("source_recipes_total_min_idx").on(t.totalMin),
  ],
);

export const savedRecipes = pgTable(
  "saved_recipes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourceRecipeId: uuid("source_recipe_id").references(() => sourceRecipes.id, {
      onDelete: "set null",
    }),
    forkedFromId: uuid("forked_from_id").references((): AnyPgColumn => savedRecipes.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    recipe: jsonb("recipe").$type<Recipe>().notNull(),
    undoStack: jsonb("undo_stack").$type<Recipe[]>().notNull().default(sql`'[]'::jsonb`),
    readyBy: timestamp("ready_by", { withTimezone: true }),
    shareSlug: text("share_slug").unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("saved_recipes_user_id_idx").on(t.userId)],
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    savedRecipeId: uuid("saved_recipe_id")
      .notNull()
      .references(() => savedRecipes.id, { onDelete: "cascade" }),
    role: chatRoleEnum("role").notNull(),
    content: text("content").notNull(),
    contextRefs: jsonb("context_refs").$type<LineRef[]>().notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("chat_messages_saved_recipe_id_idx").on(t.savedRecipeId)],
);

// Logs and debugging only. Live search state is in memory.
export const searches = pgTable("searches", {
  id: uuid("id").primaryKey().defaultRandom(),
  query: text("query").notNull(),
  parsed: jsonb("parsed"),
  browserUseTaskId: text("browser_use_task_id"),
  status: text("status").notNull().default("pending"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type SourceRecipe = typeof sourceRecipes.$inferSelect;
export type NewSourceRecipe = typeof sourceRecipes.$inferInsert;
export type SavedRecipe = typeof savedRecipes.$inferSelect;
export type NewSavedRecipe = typeof savedRecipes.$inferInsert;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type NewChatMessage = typeof chatMessages.$inferInsert;
export type Search = typeof searches.$inferSelect;
export type NewSearch = typeof searches.$inferInsert;
